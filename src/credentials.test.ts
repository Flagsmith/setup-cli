import { describe, expect, it } from 'vitest'

import { ACCESS_TOKEN_ENV } from './constants.js'
import { existingCredential, scopedEnvName, urlHost } from './credentials.js'

describe('scopedEnvName', () => {
  it.each([
    ['https://api.flagsmith.com', 'FLAGSMITH_ACCESS_TOKEN_api_flagsmith_com'],
    // `-` becomes `__`, so a hyphenated host cannot collide with a dotted one.
    [
      'https://api.flagsmith-staging.com',
      'FLAGSMITH_ACCESS_TOKEN_api_flagsmith__staging_com',
    ],
    ['http://localhost:8000', 'FLAGSMITH_ACCESS_TOKEN_localhost_8000'],
    ['https://API.Flagsmith.COM', 'FLAGSMITH_ACCESS_TOKEN_api_flagsmith_com'],
    [
      'https://my-flagsmith.internal.example.com/api',
      'FLAGSMITH_ACCESS_TOKEN_my__flagsmith_internal_example_com',
    ],
    // Brackets are URL syntax, not part of the name.
    ['https://[::1]:8000', 'FLAGSMITH_ACCESS_TOKEN___1_8000'],
  ])('%s -> %s', (url, expected) => {
    expect(scopedEnvName(ACCESS_TOKEN_ENV, url)).toBe(expected)
  })

  it('distinguishes hosts that differ only by hyphen versus dot', () => {
    expect(scopedEnvName(ACCESS_TOKEN_ENV, 'https://a-b.com')).not.toBe(
      scopedEnvName(ACCESS_TOKEN_ENV, 'https://a.b.com'),
    )
  })
})

describe('urlHost', () => {
  it('keeps the port and drops the path', () => {
    expect(urlHost('https://example.com:8443/api/v1/')).toBe('example.com:8443')
  })
})

describe('existingCredential', () => {
  const DEFAULT = 'https://api.flagsmith.com'
  const SELF_HOSTED = 'https://flagsmith.internal.example.com'

  it('finds nothing in a clean environment', () => {
    expect(existingCredential(DEFAULT, {})).toBeUndefined()
  })

  it('finds an unscoped Master API key on the default host', () => {
    expect(existingCredential(DEFAULT, { FLAGSMITH_API_KEY: 'k' })).toBe(
      'FLAGSMITH_API_KEY',
    )
  })

  it('ignores an unscoped key off the default host, exactly as the CLI does', () => {
    expect(
      existingCredential(SELF_HOSTED, { FLAGSMITH_API_KEY: 'k' }),
    ).toBeUndefined()
  })

  it('finds a scoped credential for a self-hosted instance', () => {
    expect(
      existingCredential(SELF_HOSTED, {
        FLAGSMITH_API_KEY_flagsmith_internal_example_com: 'k',
      }),
    ).toBe('FLAGSMITH_API_KEY_flagsmith_internal_example_com')
  })

  it('matches a scoped name case-insensitively, as the CLI does', () => {
    expect(
      existingCredential(SELF_HOSTED, {
        FLAGSMITH_API_KEY_FLAGSMITH_INTERNAL_EXAMPLE_COM: 'k',
      }),
    ).toBe('FLAGSMITH_API_KEY_FLAGSMITH_INTERNAL_EXAMPLE_COM')
  })

  it('requires the exact unscoped name, as the CLI does', () => {
    expect(
      existingCredential(DEFAULT, { flagsmith_api_key: 'k' }),
    ).toBeUndefined()
  })

  it('prefers the Master API key, matching the CLI precedence', () => {
    expect(
      existingCredential(DEFAULT, {
        FLAGSMITH_ACCESS_TOKEN: 't',
        FLAGSMITH_API_KEY: 'k',
      }),
    ).toBe('FLAGSMITH_API_KEY')
  })

  it('treats an empty value as absent', () => {
    expect(
      existingCredential(DEFAULT, { FLAGSMITH_API_KEY: '' }),
    ).toBeUndefined()
  })
})
