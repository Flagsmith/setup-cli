import { beforeEach, describe, expect, it, vi } from 'vitest'

import { exec, getExecOutput } from '@actions/exec'

import {
  getInstallerForPlatform,
  parseVersionInput,
  scriptUrl,
} from './install.js'

vi.mock('@actions/exec', () => ({
  exec: vi.fn(),
  getExecOutput: vi.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  }),
}))

describe('parseVersionInput', () => {
  it.each([
    ['v2.0.0', 'v2.0.0'],
    ['2.0.0', 'v2.0.0'],
    ['2.0.0-beta.3', 'v2.0.0-beta.3'],
    ['  v1.1.0  ', 'v1.1.0'],
    ['latest', ''],
    ['LATEST', ''],
    ['', ''],
    ['  ', ''],
  ])('%o -> %o', (input, expected) => {
    expect(parseVersionInput(input)).toBe(expected)
  })
})

describe('getInstallerForPlatform', () => {
  beforeEach(() => {
    vi.mocked(exec).mockClear()
    vi.mocked(getExecOutput).mockClear()
  })

  it('omits the version switch when nothing is pinned', async () => {
    await getInstallerForPlatform('', '/tmp', '/tmp/bin', 'linux').install()
    expect(exec).toHaveBeenCalledWith('sh', [
      '/tmp/install.sh',
      '--bin-dir',
      '/tmp/bin',
      '--no-modify-path',
    ])

    await getInstallerForPlatform('', 'C:\\t', 'C:\\t\\bin', 'win32').install()
    expect(vi.mocked(exec).mock.calls[1]?.[1]).not.toContain('-Version')
  })

  it('keeps the shell installer out of $HOME and off PATH', async () => {
    const installer = getInstallerForPlatform(
      'v2.0.0',
      '/tmp',
      '/tmp/bin',
      'linux',
    )
    expect(installer.script).toBe('install.sh')
    expect(installer.scriptPath).toBe('/tmp/install.sh')
    expect(installer.binaryPath).toBe('/tmp/bin/flagsmith')
    await installer.install()
    expect(exec).toHaveBeenCalledWith('sh', [
      '/tmp/install.sh',
      '--version',
      'v2.0.0',
      '--bin-dir',
      '/tmp/bin',
      '--no-modify-path',
    ])
  })

  it('passes the equivalent switches to the PowerShell installer', async () => {
    const installer = getInstallerForPlatform(
      'v2.0.0',
      'C:\\t',
      'C:\\t\\bin',
      'win32',
    )
    expect(installer.script).toBe('install.ps1')
    expect(installer.binaryPath).toContain('flagsmith.exe')
    await installer.install()
    const [command, args] = vi.mocked(exec).mock.calls[0] ?? []
    expect(command).toBe('pwsh')
    expect(args).toContain('-NoModifyPath')
    expect(args).toContain('-NonInteractive')
    expect(args?.slice(args.indexOf('-Version'))).toEqual([
      '-Version',
      'v2.0.0',
      '-BinDir',
      'C:\\t\\bin',
      '-NoModifyPath',
    ])
  })

  it('resolves the version with a dry run of the installer', async () => {
    vi.mocked(getExecOutput).mockResolvedValueOnce({
      stdout: 'would install flagsmith v2.3.4 to /tmp/bin\n',
      stderr: '',
      exitCode: 0,
    })
    const installer = getInstallerForPlatform('', '/tmp', '/tmp/bin', 'linux')
    await expect(installer.resolveVersion()).resolves.toBe('v2.3.4')
    expect(getExecOutput).toHaveBeenCalledWith(
      'sh',
      [
        '/tmp/install.sh',
        '--bin-dir',
        '/tmp/bin',
        '--no-modify-path',
        '--dry-run',
      ],
      { silent: true, ignoreReturnCode: true },
    )
    expect(exec).not.toHaveBeenCalled()
  })

  it('resolves to the empty string when the dry run names no version', async () => {
    const installer = getInstallerForPlatform('', '/tmp', '/tmp/bin', 'linux')
    await expect(installer.resolveVersion()).resolves.toBe('')
  })
})

describe('scriptUrl', () => {
  it('pins the installer to the version being installed', () => {
    expect(scriptUrl('v2.0.0', 'install.sh')).toBe(
      'https://raw.githubusercontent.com/Flagsmith/flagsmith-cli/v2.0.0/install.sh',
    )
  })
})
