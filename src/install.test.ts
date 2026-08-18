import { describe, expect, it } from 'vitest'

import {
  assertDownloaderAvailable,
  binaryName,
  installerInvocation,
  installerScript,
  scriptUrl,
} from './install.js'

describe('installerScript', () => {
  it('uses the shell installer off Windows', () => {
    expect(installerScript('linux')).toBe('install.sh')
    expect(installerScript('darwin')).toBe('install.sh')
  })

  it('uses the PowerShell installer on Windows', () => {
    expect(installerScript('win32')).toBe('install.ps1')
  })
})

describe('installerInvocation', () => {
  it('keeps the shell installer out of $HOME and off PATH', () => {
    const { command, args } = installerInvocation(
      'v2.0.0',
      '/tmp/install.sh',
      '/tmp/bin',
      'linux',
    )
    expect(command).toBe('sh')
    // --bin-dir keeps it out of $HOME; --no-modify-path leaves shell profiles
    // and GITHUB_PATH alone, so PATH stays ours to set after caching.
    expect(args).toEqual([
      '/tmp/install.sh',
      '--version',
      'v2.0.0',
      '--bin-dir',
      '/tmp/bin',
      '--no-modify-path',
    ])
  })

  it('passes the equivalent switches to the PowerShell installer', () => {
    const { command, args } = installerInvocation(
      'v2.0.0',
      'C:\\t\\install.ps1',
      'C:\\t\\bin',
      'win32',
    )
    expect(command).toBe('pwsh')
    expect(args).toContain('-NoModifyPath')
    expect(args).toContain('-NonInteractive')
    expect(args.slice(args.indexOf('-Version'))).toEqual([
      '-Version',
      'v2.0.0',
      '-BinDir',
      'C:\\t\\bin',
      '-NoModifyPath',
    ])
  })
})

describe('scriptUrl', () => {
  it('pins the installer to the version being installed', () => {
    // Fetching from a tag rather than main keeps the installer and the release
    // it installs in step.
    expect(scriptUrl('v2.0.0', 'install.sh')).toBe(
      'https://raw.githubusercontent.com/Flagsmith/flagsmith-cli/v2.0.0/install.sh',
    )
  })
})

describe('binaryName', () => {
  it.each([
    ['linux', 'flagsmith'],
    ['darwin', 'flagsmith'],
    ['win32', 'flagsmith.exe'],
  ])('%s -> %s', (platform, expected) => {
    expect(binaryName(platform)).toBe(expected)
  })
})

describe('assertDownloaderAvailable', () => {
  const never = async () => false
  const always = async () => true

  it('passes when curl is present', async () => {
    await expect(
      assertDownloaderAvailable('linux', async (c) => c === 'curl'),
    ).resolves.toBeUndefined()
  })

  it('passes when only wget is present, as on alpine', async () => {
    await expect(
      assertDownloaderAvailable('linux', async (c) => c === 'wget'),
    ).resolves.toBeUndefined()
  })

  it('blames the container when neither is present', async () => {
    // ubuntu:24.04, node:*-slim and python:*-slim all ship neither.
    await expect(assertDownloaderAvailable('linux', never)).rejects.toThrow(
      /needs curl or wget.*container:/s,
    )
  })

  it('does not check on Windows, where install.ps1 downloads itself', async () => {
    await expect(
      assertDownloaderAvailable('win32', never),
    ).resolves.toBeUndefined()
    await expect(
      assertDownloaderAvailable('win32', always),
    ).resolves.toBeUndefined()
  })
})
