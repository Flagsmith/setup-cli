import { describe, expect, it } from 'vitest'

import { resolveVersion } from './version.js'

describe('resolveVersion', () => {
  it.each([
    ['v2.0.0', 'v2.0.0'],
    ['2.0.0', 'v2.0.0'],
    ['2.0.0-beta.3', 'v2.0.0-beta.3'],
    ['  v1.1.0  ', 'v1.1.0'],
  ])('returns %o pinned as %o without a network call', async (input, expected) => {
    await expect(resolveVersion(input)).resolves.toBe(expected)
  })
})
