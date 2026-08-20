import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

import {
  exchangeFailureHint,
  hasOidcIdentity,
  isForkPullRequest,
  parseExchangeResponse,
} from './auth.js'

describe('parseExchangeResponse', () => {
  it('reads the documented success shape', () => {
    expect(
      parseExchangeResponse(
        '{"access_token":"tok","token_type":"Bearer","expires_in":3600}',
      ),
    ).toEqual({ accessToken: 'tok', expiresIn: 3600 })
  })

  it('tolerates a missing lifetime', () => {
    expect(parseExchangeResponse('{"access_token":"tok"}')).toEqual({
      accessToken: 'tok',
      expiresIn: undefined,
    })
  })

  it.each([
    ['{}', 'no access token'],
    ['{"access_token":""}', 'no access token'],
    ['{"access_token":null}', 'no access token'],
    ['<html>nope</html>', 'not JSON'],
  ])('rejects %s', (body, message) => {
    expect(() => parseExchangeResponse(body)).toThrow(message)
  })
})

describe('exchangeFailureHint', () => {
  it('points 401 at the trust relationship', () => {
    expect(exchangeFailureHint(401, 'https://api.flagsmith.com')).toMatch(
      /trust relationship matched/,
    )
  })

  it('points 403 at the trust relationship too', () => {
    expect(exchangeFailureHint(403, 'https://api.flagsmith.com')).toMatch(
      /trust relationship matched/,
    )
  })

  it('points 404 at api-url', () => {
    expect(exchangeFailureHint(404, 'https://api.example.com')).toContain(
      'https://api.example.com',
    )
  })

  it('calls a 400 a bug and links the issue tracker', () => {
    expect(exchangeFailureHint(400, 'https://api.flagsmith.com')).toContain(
      'https://github.com/Flagsmith/setup-cli/issues/new',
    )
  })

  it('names the instance when rate limited', () => {
    expect(exchangeFailureHint(429, 'https://api.example.com')).toBe(
      'Rate limited by https://api.example.com. Retry shortly.',
    )
  })

  it('falls back to a generic hint for unmapped statuses', () => {
    expect(exchangeFailureHint(503, 'https://api.example.com')).toContain(
      'Check that api-url points at a Flagsmith instance',
    )
  })
})

describe('hasOidcIdentity', () => {
  it('is false when the job has no id-token permission', () => {
    expect(hasOidcIdentity({})).toBe(false)
  })

  it('needs both the URL and the request token', () => {
    expect(hasOidcIdentity({ ACTIONS_ID_TOKEN_REQUEST_URL: 'u' })).toBe(false)
    expect(
      hasOidcIdentity({
        ACTIONS_ID_TOKEN_REQUEST_URL: 'u',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 't',
      }),
    ).toBe(true)
  })
})

describe('isForkPullRequest', () => {
  const eventFile = (headRepo: string) => {
    const file = path.join(
      mkdtempSync(path.join(tmpdir(), 'setup-cli-')),
      'event.json',
    )
    writeFileSync(
      file,
      JSON.stringify({
        pull_request: { head: { repo: { full_name: headRepo } } },
      }),
    )
    return file
  }

  const base = { GITHUB_REPOSITORY: 'Flagsmith/setup-cli' }

  it('is true when the head repo differs from the base repo', () => {
    expect(
      isForkPullRequest({
        ...base,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: eventFile('someone/setup-cli'),
      }),
    ).toBe(true)
  })

  it('is false for a branch pull request in the same repo', () => {
    expect(
      isForkPullRequest({
        ...base,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: eventFile('Flagsmith/setup-cli'),
      }),
    ).toBe(false)
  })

  it('is false on a push', () => {
    expect(
      isForkPullRequest({
        ...base,
        GITHUB_EVENT_NAME: 'push',
        GITHUB_EVENT_PATH: eventFile('someone/setup-cli'),
      }),
    ).toBe(false)
  })

  it('does not throw when the event payload is missing or unreadable', () => {
    expect(
      isForkPullRequest({ ...base, GITHUB_EVENT_NAME: 'pull_request' }),
    ).toBe(false)
    expect(
      isForkPullRequest({
        ...base,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: '/nope.json',
      }),
    ).toBe(false)
  })
})
