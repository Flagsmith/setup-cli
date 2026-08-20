import { HttpClient } from '@actions/http-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import type { AddressInfo } from 'node:net'

import {
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
        } else if (req.url?.includes('proxy')) {
          // What a corporate proxy answers, rather than Flagsmith.
          res.writeHead(407, { 'content-type': 'text/html' })
          res.end(
            '<html>\n  <head>\n    <title>407 Proxy Authentication Required</title>\n',
          )
        } else if (req.url?.includes('verbose')) {
          res.writeHead(500, { 'content-type': 'text/plain' })
          res.end('x'.repeat(900))
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
    ).rejects.toThrow(
      /HTTP 401.*trust relationship matched[\s\S]*No matching trust relationship/,
    )
  })

  it('explains a 404 and still shows the body', async () => {
    const error = await exchangeToken(
      `${baseUrl}/missing`,
      'tok',
      new HttpClient('test'),
    ).then(
      () => new Error('the exchange unexpectedly succeeded'),
      (e: Error) => e,
    )

    expect(error.message).toMatch(/HTTP 404/)
    expect(error.message).toContain('Not Found')
  })

  it("shows a proxy's HTML answer on one line", async () => {
    const error = await exchangeToken(
      `${baseUrl}/proxy`,
      'tok',
      new HttpClient('test'),
    ).then(
      () => new Error('the exchange unexpectedly succeeded'),
      (e: Error) => e,
    )

    // The diagnosis is in the page, not in anything Flagsmith sent.
    expect(error.message).toContain('407 Proxy Authentication Required')
    // One line, so the annotation stays readable.
    expect(error.message.split('\n')).toHaveLength(2)
  })

  it('truncates a very long body', async () => {
    const error = await exchangeToken(
      `${baseUrl}/verbose`,
      'tok',
      new HttpClient('test'),
    ).then(
      () => new Error('the exchange unexpectedly succeeded'),
      (e: Error) => e,
    )

    expect(error.message).toContain('x'.repeat(500))
    expect(error.message).not.toContain('x'.repeat(501))
  })
})
