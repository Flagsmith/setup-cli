import { describe, expect, it } from 'vitest'

import { isLatest, normaliseVersion, resolveVersion } from './version.js'

describe('normaliseVersion', () => {
  it.each([
    ['v2.0.0', 'v2.0.0'],
    ['2.0.0', 'v2.0.0'],
    ['2.0.0-beta.3', 'v2.0.0-beta.3'],
    ['  v1.1.0  ', 'v1.1.0'],
  ])('%s -> %s', (input, expected) => {
    expect(normaliseVersion(input)).toBe(expected)
  })
})

describe('isLatest', () => {
  it.each(['', '  ', 'latest', 'Latest', 'LATEST'])('treats %o as latest', (v) => {
    expect(isLatest(v)).toBe(true)
  })

  it('treats a version as a version', () => {
    expect(isLatest('v2.0.0')).toBe(false)
  })
})

describe('resolveVersion', () => {
  it('returns a pinned version without a network call', async () => {
    await expect(resolveVersion('2.0.0')).resolves.toBe('v2.0.0')
  })
})
