import * as fs from 'node:fs'
import * as path from 'node:path'

import * as core from '@actions/core'
import { exec } from '@actions/exec'
import * as tc from '@actions/tool-cache'
import { HttpClient } from '@actions/http-client'

export const REPO = 'Flagsmith/flagsmith-cli'
const TOOL_NAME = 'flagsmith'

/** Install the CLI, add it to PATH, and return the directory it lives in. */
export async function installCli(version: string): Promise<string> {
  const cached = tc.find(TOOL_NAME, version, process.arch)
  if (cached) {
    core.info(`Using cached flagsmith ${version} (${process.arch})`)
    core.addPath(cached)
    return cached
  }

  const temp = process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? '/tmp'
  const binDir = path.join(temp, 'flagsmith-cli-install')
  await fs.promises.mkdir(binDir, { recursive: true })

  const { script, scriptPath, binary, command, args } = platformInstaller(
    version,
    temp,
    binDir,
  )
  await fetchInstaller(version, script, scriptPath)

  core.info(`Running the CLI's ${script} (${version})`)
  await exec(command, args)

  if (!fs.existsSync(binary)) {
    throw new Error(
      `${script} did not produce ${path.basename(binary)} in ${binDir}. See the installer output above.`,
    )
  }

  const dir = await tc.cacheDir(binDir, TOOL_NAME, version, process.arch)
  core.addPath(dir)
  core.info(`Installed flagsmith ${version} to ${dir}`)
  return dir
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
  const scriptPath = path.join(temp, 'install.sh')
  return {
    script: 'install.sh',
    scriptPath,
    binary: path.join(binDir, 'flagsmith'),
    command: 'sh',
    args: [scriptPath, '--version', version, '--bin-dir', binDir, '--no-modify-path'],
  }
}

/** The installer is served from the tag being installed, not from the default branch. */
export function scriptUrl(version: string, script: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${version}/${script}`
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
