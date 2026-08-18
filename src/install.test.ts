import { describe, expect, it } from 'vitest'

import { pinnedVersion, platformInstaller, scriptUrl } from './install.js'

describe('pinnedVersion', () => {
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
    expect(pinnedVersion(input)).toBe(expected)
  })
})

describe('platformInstaller', () => {
  it('omits the version switch when nothing is pinned', () => {
    expect(platformInstaller('', '/tmp', '/tmp/bin', 'linux').args).toEqual([
      '/tmp/install.sh',
      '--bin-dir',
      '/tmp/bin',
      '--no-modify-path',
    ])
    expect(platformInstaller('', 'C:\\t', 'C:\\t\\bin', 'win32').args).not.toContain(
      '-Version',
    )
  })

  it('keeps the shell installer out of $HOME and off PATH', () => {
    const { script, scriptPath, binary, command, args } = platformInstaller(
      'v2.0.0',
      '/tmp',
      '/tmp/bin',
      'linux',
    )
    expect(script).toBe('install.sh')
    expect(scriptPath).toBe('/tmp/install.sh')
    expect(binary).toBe('/tmp/bin/flagsmith')
    expect(command).toBe('sh')
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
    const { script, binary, command, args } = platformInstaller(
      'v2.0.0',
      'C:\\t',
      'C:\\t\\bin',
      'win32',
    )
    expect(script).toBe('install.ps1')
    expect(binary).toContain('flagsmith.exe')
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
    expect(scriptUrl('v2.0.0', 'install.sh')).toBe(
      'https://raw.githubusercontent.com/Flagsmith/flagsmith-cli/v2.0.0/install.sh',
    )
  })
})
