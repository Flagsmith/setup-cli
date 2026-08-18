import * as fs from 'node:fs'
import * as path from 'node:path'

import * as core from '@actions/core'
import { exec, getExecOutput } from '@actions/exec'
import * as tc from '@actions/tool-cache'
import { fetchOk } from './http.js'

export const REPO = 'Flagsmith/flagsmith-cli'
const TOOL_NAME = 'flagsmith'

type InstallScript = 'install.sh' | 'install.ps1'

/**
 * Install the CLI, add it to PATH, cache in GHA tool cache,
 * and return the directory it lives in.
 */
export async function installCli(requested: string): Promise<string> {
  const pinned = pinnedVersion(requested)
  const temp = process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? '/tmp'
  const binDir = path.join(temp, 'flagsmith-cli-install')
  await fs.promises.mkdir(binDir, { recursive: true })

  const { script, scriptPath, binary, command, args, dryRunFlag } =
    platformInstaller(pinned, temp, binDir)
  await fetchInstaller(pinned || 'main', script, scriptPath)

  let version = pinned
  if (!version) {
    const { stdout } = await getExecOutput(command, [...args, dryRunFlag], {
      silent: true,
      ignoreReturnCode: true,
    })
    version = /^would install \S+ (\S+)/m.exec(stdout)?.[1] ?? ''
  }

  const cached = version && tc.find(TOOL_NAME, version, process.arch)
  if (cached) {
    core.info(`Using cached flagsmith ${version} (${process.arch})`)
    core.addPath(cached)
    return cached
  }

  await exec(command, args)

  if (!fs.existsSync(binary)) {
    throw new Error(
      `${script} did not produce ${path.basename(binary)} in ${binDir}. See the installer output above.`,
    )
  }

  // Somehow, we didn't get the exact version from --dry-run.
  if (!version) {
    const { stdout } = await getExecOutput(binary, ['--version'], {
      silent: true,
      ignoreReturnCode: true,
    })
    version = stdout.trim().split(/\s+/).pop() ?? ''
  }

  // Somehow, we didn't get the exact version from --version.
  // Succeed without caching.
  if (!version) {
    core.addPath(binDir)
    return binDir
  }

  // Cache the exact version in GitHub Actions tool cache.
  const dir = await tc.cacheDir(binDir, TOOL_NAME, version, process.arch)
  core.addPath(dir)
  return dir
}

/** The release tag to install, or `''` for whatever the installer defaults to. */
export function pinnedVersion(requested: string): string {
  const trimmed = requested.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'latest') {
    return ''
  }
  // Releases are tagged `vX.Y.Z`; both forms are accepted.
  return /^\d/.test(trimmed) ? `v${trimmed}` : trimmed
}

/**
 * Installer script and arguments for the requested version / platform.
 *
 * `--bin-dir` keeps the install out of $HOME, and `--no-modify-path` leaves
 * shell profiles and GITHUB_PATH alone: PATH is set here, after caching.
 */
export function platformInstaller(
  version: string,
  temp: string,
  binDir: string,
  platform: string = process.platform,
) {
  if (platform === 'win32') {
    const scriptPath = path.join(temp, 'install.ps1')
    return {
      script: 'install.ps1' as const,
      scriptPath,
      binary: path.join(binDir, 'flagsmith.exe'),
      command: 'pwsh',
      dryRunFlag: '-DryRun',
      args: [
        '-NoLogo',
        '-NonInteractive',
        '-File',
        scriptPath,
        ...(version ? ['-Version', version] : []),
        '-BinDir',
        binDir,
        '-NoModifyPath',
      ],
    }
  }
  const scriptPath = path.join(temp, 'install.sh')
  return {
    script: 'install.sh' as const,
    scriptPath,
    binary: path.join(binDir, 'flagsmith'),
    command: 'sh',
    dryRunFlag: '--dry-run',
    args: [
      scriptPath,
      ...(version ? ['--version', version] : []),
      '--bin-dir',
      binDir,
      '--no-modify-path',
    ],
  }
}

export function scriptUrl(ref: string, script: InstallScript): string {
  return `https://raw.githubusercontent.com/${REPO}/${ref}/${script}`
}

async function fetchInstaller(
  ref: string,
  script: InstallScript,
  destination: string,
): Promise<void> {
  const url = scriptUrl(ref, script)
  const body = await fetchOk(
    url,
    (status) =>
      `cannot fetch ${url} (HTTP ${status}). Check that ${ref} is a released version of the CLI.`,
  )
  await fs.promises.writeFile(destination, body)
}
