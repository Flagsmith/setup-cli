import { describe, expect, it } from 'vitest'

import { platformInstaller, scriptUrl } from './install.js'

describe('platformInstaller', () => {
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
    // Fetching from a tag rather than main keeps the installer and the release
    // it installs in step.
    expect(scriptUrl('v2.0.0', 'install.sh')).toBe(
      'https://raw.githubusercontent.com/Flagsmith/flagsmith-cli/v2.0.0/install.sh',
    )
  })
})
