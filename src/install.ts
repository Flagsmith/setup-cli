import * as fs from 'node:fs'
import * as path from 'node:path'

import * as core from '@actions/core'
import { exec, getExecOutput } from '@actions/exec'
import * as tc from '@actions/tool-cache'
import { fetchOrThrow } from './http.js'

export const REPO = 'Flagsmith/flagsmith-cli'
const TOOL_NAME = 'flagsmith'

type InstallScript = 'install.sh' | 'install.ps1'

/**
 * Install the CLI, add it to PATH, cache in GHA tool cache,
 * and return the directory it lives in.
 */
export async function installCli(requestedVersion: string): Promise<string> {
  const pinnedVersion = parseVersionInput(requestedVersion)
  const tempDir = process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? '/tmp'
  const binDir = path.join(tempDir, 'flagsmith-cli-install')
  await fs.promises.mkdir(binDir, { recursive: true })

  const installer = getInstallerForPlatform(pinnedVersion, tempDir, binDir)
  await fetchInstallScript(
    pinnedVersion || 'main',
    installer.script,
    installer.scriptPath,
  )

  // The installer script owns version resolution: when no version is pinned,
  // a dry run names the release it would install.
  const version = pinnedVersion || (await installer.resolveVersion())

  const cached = version && tc.find(TOOL_NAME, version, process.arch)
  if (cached) {
    core.info(`Using cached flagsmith ${version} (${process.arch})`)
    core.addPath(cached)
    return cached
  }

  await installer.install()

  if (!fs.existsSync(installer.binaryPath)) {
    throw new Error(
      `${installer.script} did not produce ${path.basename(installer.binaryPath)} in ${binDir}. See the installer output above.`,
    )
  }

  // Belt and braces: if the dry run named no version, ask the binary itself.
  const installedVersion =
    version || (await getVersionFromBinary(installer.binaryPath))

  // The CLI is installed and will be on PATH; we only failed to learn its
  // exact version, so skip the tool cache rather than poison it with a
  // made-up key.
  if (!installedVersion) {
    core.addPath(binDir)
    return binDir
  }

  const dir = await tc.cacheDir(
    binDir,
    TOOL_NAME,
    installedVersion,
    process.arch,
  )
  core.addPath(dir)
  return dir
}

/** What the installed binary reports as its version, or `''`. */
async function getVersionFromBinary(binaryPath: string): Promise<string> {
  const { stdout } = await getExecOutput(binaryPath, ['--version'], {
    silent: true,
    ignoreReturnCode: true,
  })
  return stdout.trim().split(/\s+/).pop() ?? ''
}

/** The release tag to install, or `''` for whatever the installer defaults to. */
export function parseVersionInput(requestedVersion: string): string {
  const trimmed = requestedVersion.trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'latest') {
    return ''
  }
  // Releases are tagged `vX.Y.Z`; both forms are accepted.
  return /^\d/.test(trimmed) ? `v${trimmed}` : trimmed
}

export interface Installer {
  script: InstallScript
  scriptPath: string
  /** Where the installer script leaves the binary. */
  binaryPath: string
  /** Run the installer. */
  install(): Promise<void>
  /** The version a dry run of the installer would install, or `''`. */
  resolveVersion(): Promise<string>
}

/**
 * The installer script invocation for the requested version / platform.
 *
 * `--bin-dir` keeps the install out of $HOME, and `--no-modify-path` leaves
 * shell profiles and GITHUB_PATH alone: PATH is set by the caller, after
 * caching.
 */
export function getInstallerForPlatform(
  version: string,
  tempDir: string,
  binDir: string,
  platform: string = process.platform,
): Installer {
  const windows = platform === 'win32'
  const script: InstallScript = windows ? 'install.ps1' : 'install.sh'
  const scriptPath = path.join(tempDir, script)
  const command = windows ? 'pwsh' : 'sh'
  const args = windows
    ? [
        '-NoLogo',
        '-NonInteractive',
        '-File',
        scriptPath,
        ...(version ? ['-Version', version] : []),
        '-BinDir',
        binDir,
        '-NoModifyPath',
      ]
    : [
        scriptPath,
        ...(version ? ['--version', version] : []),
        '--bin-dir',
        binDir,
        '--no-modify-path',
      ]
  return {
    script,
    scriptPath,
    binaryPath: path.join(binDir, windows ? 'flagsmith.exe' : 'flagsmith'),
    async install() {
      await exec(command, args)
    },
    async resolveVersion() {
      const { stdout } = await getExecOutput(
        command,
        [...args, windows ? '-DryRun' : '--dry-run'],
        { silent: true, ignoreReturnCode: true },
      )
      return /^would install \S+ (\S+)/m.exec(stdout)?.[1] ?? ''
    },
  }
}

export function scriptUrl(ref: string, script: InstallScript): string {
  return `https://raw.githubusercontent.com/${REPO}/${ref}/${script}`
}

async function fetchInstallScript(
  ref: string,
  script: InstallScript,
  destination: string,
): Promise<void> {
  const url = scriptUrl(ref, script)
  const body = await fetchOrThrow(
    url,
    (status) =>
      `cannot fetch ${url} (HTTP ${status}). Check that ${ref} is a released version of the CLI.`,
  )
  await fs.promises.writeFile(destination, body)
}
