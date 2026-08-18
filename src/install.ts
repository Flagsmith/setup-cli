import * as fs from 'node:fs'
import * as path from 'node:path'

import * as core from '@actions/core'
import { exec } from '@actions/exec'
import * as tc from '@actions/tool-cache'
import { HttpClient } from '@actions/http-client'

export const REPO = 'Flagsmith/flagsmith-cli'
const TOOL_NAME = 'flagsmith'

/**
 * Installation delegates to the CLI's own installers.
 *
 * They already own platform detection, the release layout and checksum
 * verification, and they live in the repository that publishes the releases —
 * so a change to how archives are named cannot break this action. We supply
 * `--bin-dir` to keep the install out of $HOME, and `--no-modify-path` so the
 * script touches neither shell profiles nor GITHUB_PATH: PATH is ours to set,
 * after the binary is in the tool cache.
 */
export interface InstallerInvocation {
  script: 'install.sh' | 'install.ps1'
  command: string
  args: string[]
}

/** The installer the CLI publishes for this platform. */
export function installerScript(
  platform: string = process.platform,
): 'install.sh' | 'install.ps1' {
  return platform === 'win32' ? 'install.ps1' : 'install.sh'
}

export function installerInvocation(
  version: string,
  scriptPath: string,
  binDir: string,
  platform: string = process.platform,
): InstallerInvocation {
  if (platform === 'win32') {
    return {
      script: 'install.ps1',
      command: 'pwsh',
      args: [
        '-NoLogo',
        '-NonInteractive',
        '-File',
        scriptPath,
        '-Version',
        version,
        '-BinDir',
        binDir,
        '-NoModifyPath',
      ],
    }
  }
  return {
    script: 'install.sh',
    command: 'sh',
    args: [
      scriptPath,
      '--version',
      version,
      '--bin-dir',
      binDir,
      '--no-modify-path',
    ],
  }
}

export function scriptUrl(version: string, script: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${version}/${script}`
}

/** The name of the installed binary on this platform. */
export function binaryName(platform: string = process.platform): string {
  return platform === 'win32' ? 'flagsmith.exe' : 'flagsmith'
}

export async function assertDownloaderAvailable(
  platform: string = process.platform,
  which: (cmd: string) => Promise<boolean> = commandExists,
): Promise<void> {
  if (platform === 'win32') {
    return
  }
  if ((await which('curl')) || (await which('wget'))) {
    return
  }
  throw new Error(
    "the CLI installer needs curl or wget, and neither is on PATH. If this job uses `container:`, add curl to the image, or run on the runner directly.",
  )
}

async function commandExists(command: string): Promise<boolean> {
  return (
    (await exec('sh', ['-c', `command -v ${command}`], {
      ignoreReturnCode: true,
      silent: true,
    })) === 0
  )
}

async function fetchInstaller(
  version: string,
  script: string,
  destination: string,
): Promise<void> {
  const url = scriptUrl(version, script)
  const http = new HttpClient('Flagsmith/setup-cli')
  const response = await http.get(url)
  const body = await response.readBody()
  if (response.message.statusCode !== 200) {
    throw new Error(
      `cannot fetch ${url} (HTTP ${response.message.statusCode}). ` +
      `Check that ${version} is a released version of the CLI.`,
    )
  }
  await fs.promises.writeFile(destination, body)
}

/**
 * Install the CLI and add it to PATH, reusing the runner tool cache when this
 * version has already been installed.
 *
 * The cache is keyed on the concrete version and the raw `process.arch`, so no
 * GOOS/GOARCH mapping is needed here — the installer does that.
 */
export async function installCli(version: string): Promise<string> {
  const cached = tc.find(TOOL_NAME, version, process.arch)
  if (cached) {
    core.info(`Using cached flagsmith ${version} (${process.arch})`)
    core.addPath(cached)
    return cached
  }

  await assertDownloaderAvailable()

  const temp = process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? '/tmp'
  const binDir = path.join(temp, 'flagsmith-cli-install')
  await fs.promises.mkdir(binDir, { recursive: true })

  // The installer is fetched here rather than piped from curl, so the job needs
  // no downloader of its own for this step.
  const script = installerScript()
  const scriptPath = path.join(temp, script)
  await fetchInstaller(version, script, scriptPath)

  const { command, args } = installerInvocation(version, scriptPath, binDir)
  core.info(`Running the CLI's ${script} (${version})`)
  await exec(command, args)

  const binary = path.join(binDir, binaryName())
  if (!fs.existsSync(binary)) {
    throw new Error(
      `${script} did not produce ${binaryName()} in ${binDir}. See the installer output above.`,
    )
  }

  const dir = await tc.cacheDir(binDir, TOOL_NAME, version, process.arch)
  core.addPath(dir)
  core.info(`Installed flagsmith ${version} to ${dir}`)
  return dir
}
