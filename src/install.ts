import * as fs from 'node:fs'
import * as path from 'node:path'

import * as core from '@actions/core'
import { exec, getExecOutput } from '@actions/exec'
import * as tc from '@actions/tool-cache'
import { HttpClient } from '@actions/http-client'

export const REPO = 'Flagsmith/flagsmith-cli'
const TOOL_NAME = 'flagsmith'

/**
 * Install the CLI, add it to PATH, and return the directory it lives in.
 *
 * A pinned version is installed by the installer published alongside it. An
 * unpinned install runs the installer from `main`, whose default version is the
 * latest release, and asks it which version that is before installing, so the
 * tool cache is keyed on a concrete tag either way.
 */
export async function installCli(requested: string): Promise<string> {
  const pinned = pinnedVersion(requested)
  const temp = process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? '/tmp'
  const binDir = path.join(temp, 'flagsmith-cli-install')
  await fs.promises.mkdir(binDir, { recursive: true })

  const { script, scriptPath, binary, command, args, dryRunFlag } =
    platformInstaller(pinned, temp, binDir)
  await fetchInstaller(pinned || 'main', script, scriptPath)

  const version = pinned || (await dryRunVersion(command, [...args, dryRunFlag]))

  const cached = version && tc.find(TOOL_NAME, version, process.arch)
  if (cached) {
    core.info(`Using cached flagsmith ${version} (${process.arch})`)
    core.addPath(cached)
    return cached
  }

  core.info(`Running the CLI's ${script}`)
  await exec(command, args)

  if (!fs.existsSync(binary)) {
    throw new Error(
      `${script} did not produce ${path.basename(binary)} in ${binDir}. See the installer output above.`,
    )
  }

  // An unreadable dry run costs the tool cache, not the install.
  if (!version) {
    core.addPath(binDir)
    return binDir
  }

  const dir = await tc.cacheDir(binDir, TOOL_NAME, version, process.arch)
  core.addPath(dir)
  return dir
}

/** The version a dry run reports it would install, if it reported one. */
export function dryRunReport(output: string): string | undefined {
  return /^would install \S+ (\S+)/m.exec(output)?.[1]
}

async function dryRunVersion(
  command: string,
  args: string[],
): Promise<string | undefined> {
  const { stdout } = await getExecOutput(command, args, {
    silent: true,
    ignoreReturnCode: true,
  })
  return dryRunReport(stdout)
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
      script: 'install.ps1',
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
    script: 'install.sh',
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

/** The installer is served from the ref being installed, not from a fixed branch. */
export function scriptUrl(ref: string, script: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${ref}/${script}`
}

async function fetchInstaller(
  ref: string,
  script: string,
  destination: string,
): Promise<void> {
  const url = scriptUrl(ref, script)
  const http = new HttpClient('Flagsmith/setup-cli')
  const response = await http.get(url)
  const body = await response.readBody()
  if (response.message.statusCode !== 200) {
    throw new Error(
      `cannot fetch ${url} (HTTP ${response.message.statusCode}). ` +
      `Check that ${ref} is a released version of the CLI.`,
    )
  }
  await fs.promises.writeFile(destination, body)
}
