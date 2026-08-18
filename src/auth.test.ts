import { HttpClient } from '@actions/http-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  errorDetail,
  exchangeFailureHint,
  exchangeToken,
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
    ).toEqual({ accessToken: 'tok', tokenType: 'Bearer', expiresIn: 3600 })
  })

  it('defaults the token type, and tolerates a missing lifetime', () => {
    expect(parseExchangeResponse('{"access_token":"tok"}')).toEqual({
      accessToken: 'tok',
      tokenType: 'Bearer',
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

describe('errorDetail', () => {
  it('prefers a DRF detail field', () => {
    expect(errorDetail('{"detail":"Token validation failed"}')).toBe(
      'Token validation failed',
    )
  })

  it('suppresses an HTML error page', () => {
    expect(errorDetail('<!doctype html><h1>Not Found</h1>')).toBeUndefined()
  })

  it('suppresses plain text', () => {
    expect(errorDetail('upstream connect error')).toBeUndefined()
  })

  it('serialises a JSON body with no detail field', () => {
    expect(errorDetail('{"token":["This field is required."]}')).toBe(
      '{"token":["This field is required."]}',
    )
  })

  it('truncates a long detail', () => {
    expect(errorDetail(JSON.stringify({ detail: 'x'.repeat(900) }))).toHaveLength(
      500,
    )
  })
})

describe('exchangeFailureHint', () => {
  it('points 401 at the trust relationship', () => {
    expect(exchangeFailureHint(401, 'https://api.flagsmith.com')).toMatch(
      /trust relationship matched/,
    )
  })

  it('points 404 at api-url', () => {
    expect(exchangeFailureHint(404, 'https://api.example.com')).toContain(
      'https://api.example.com',
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
  const event = (headRepo: string) =>
    JSON.stringify({ pull_request: { head: { repo: { full_name: headRepo } } } })

  it('is true when the head repo differs from the base repo', () => {
    expect(
      isForkPullRequest(
        {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: '/event.json',
          GITHUB_REPOSITORY: 'Flagsmith/setup-cli',
        },
        () => event('someone/setup-cli'),
      ),
    ).toBe(true)
  })

  it('is false for a branch pull request in the same repo', () => {
    expect(
      isForkPullRequest(
        {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: '/event.json',
          GITHUB_REPOSITORY: 'Flagsmith/setup-cli',
        },
        () => event('Flagsmith/setup-cli'),
      ),
    ).toBe(false)
  })

  it('is false on a push', () => {
    expect(
      isForkPullRequest({ GITHUB_EVENT_NAME: 'push' }, () => event('x/y')),
    ).toBe(false)
  })

  it('does not throw when the event payload is missing or unreadable', () => {
    expect(
      isForkPullRequest({
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_REPOSITORY: 'Flagsmith/setup-cli',
      }),
    ).toBe(false)
    expect(
      isForkPullRequest(
        {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: '/nope.json',
          GITHUB_REPOSITORY: 'Flagsmith/setup-cli',
        },
        () => {
          throw new Error('ENOENT')
        },
      ),
    ).toBe(false)
  })
})

describe('exchangeToken', () => {
  let server: Server
  let baseUrl: string
  const requests: { url: string; body: string; contentType?: string }[] = []

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString()
        requests.push({
          url: req.url ?? '',
          body,
          contentType: req.headers['content-type'],
        })
        const json = (code: number, payload: unknown) => {
          res.writeHead(code, { 'content-type': 'application/json' })
          res.end(JSON.stringify(payload))
        }
        if (req.url?.includes('unauthorised')) {
          json(401, { detail: 'No matching trust relationship' })
        } else if (req.url?.includes('missing')) {
          res.writeHead(404, { 'content-type': 'text/html' })
          res.end('<!doctype html><h1>Not Found</h1>')
        } else {
          json(200, {
            access_token: 'fs_access_token',
            token_type: 'Bearer',
            expires_in: 3600,
          })
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('posts the ID token to the documented endpoint and returns the token', async () => {
    const token = await exchangeToken(
      baseUrl,
      'header.payload.sig',
      new HttpClient('test'),
    )

    expect(token).toEqual({
      accessToken: 'fs_access_token',
      tokenType: 'Bearer',
      expiresIn: 3600,
    })
    const request = requests.at(-1)
    expect(request?.url).toBe('/api/v1/auth/oidc/token/')
    expect(request?.contentType).toBe('application/json')
    // The OIDC token travels in the body, never in the URL.
    expect(JSON.parse(request?.body ?? '{}')).toEqual({
      token: 'header.payload.sig',
    })
    expect(request?.url).not.toContain('header.payload.sig')
  })

  it('explains a 401 and surfaces the instance detail', async () => {
    await expect(
      exchangeToken(`${baseUrl}/unauthorised`, 'tok', new HttpClient('test')),
    ).rejects.toThrow(/HTTP 401.*trust relationship matched[\s\S]*No matching trust relationship/)
  })

  it('explains a 404 without dumping the HTML page', async () => {
    const error = await exchangeToken(
      `${baseUrl}/missing`,
      'tok',
      new HttpClient('test'),
    ).catch((e: Error) => e)

    expect(error.message).toMatch(/HTTP 404/)
    expect(error.message).not.toContain('doctype')
  })
})
