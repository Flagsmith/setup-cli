import * as fs from 'node:fs'

import { HttpClient } from '@actions/http-client'

export const EXCHANGE_PATH = '/api/v1/auth/oidc/token/'

export interface ExchangedToken {
  accessToken: string
  expiresIn?: number
}

/** Turn a failed exchange into something the user can act on. */
export function exchangeFailureHint(status: number, apiUrl: string): string {
  switch (status) {
    case 400:
      return 'The instance rejected the request body. This is a bug, please report it: https://github.com/Flagsmith/setup-cli/issues/new'
    case 401:
    case 403:
      return (
        'No trust relationship matched this token. Check the repository, ' +
        'GitHub environment and audience configured on the trust relationship ' +
        'in Organisation settings → API Access.'
      )
    case 404:
      return (
        `${apiUrl} has no token exchange endpoint. Check the api-url input, and ` +
        'that the instance is new enough to support trust relationships.'
      )
    case 429:
      return `Rate limited by ${apiUrl}. Retry shortly.`
    default:
      return `Check that api-url points at a Flagsmith instance with trust relationships configured.`
  }
}

/**
 * An error body is a message, not a credential, but an HTML error page is noise.
 * Surface JSON only, and keep it short.
 */
export function errorDetail(body: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }
  if (parsed === null || parsed === undefined) {
    return undefined
  }
  const detail =
    typeof parsed === 'object' && 'detail' in parsed
      ? (parsed as { detail: unknown }).detail
      : parsed
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return text.slice(0, 500)
}

export function parseExchangeResponse(body: string): ExchangedToken {
  let parsed: { access_token?: unknown; expires_in?: unknown }
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('the token exchange returned a response that is not JSON')
  }
  const accessToken = parsed.access_token
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new Error('the token exchange response contained no access token')
  }
  return {
    accessToken,
    expiresIn: typeof parsed.expires_in === 'number' ? parsed.expires_in : undefined,
  }
}

/**
 * Exchange an OIDC token for a short-lived Flagsmith access token.
 *
 * The OIDC token goes in the request body, never on a command line or in a URL,
 * so it cannot leak through the process table or a proxy log.
 */
export async function exchangeToken(
  apiUrl: string,
  idToken: string,
  http: HttpClient = new HttpClient('Flagsmith/setup-cli'),
): Promise<ExchangedToken> {
  const url = `${apiUrl}${EXCHANGE_PATH}`
  const response = await http.post(url, JSON.stringify({ token: idToken }), {
    'content-type': 'application/json',
    accept: 'application/json',
  })
  const body = await response.readBody()
  const status = response.message.statusCode ?? 0

  if (status !== 200) {
    const detail = errorDetail(body)
    throw new Error(
      `token exchange failed (HTTP ${status}). ${exchangeFailureHint(status, apiUrl)}` +
      (detail ? `\nInstance said: ${detail}` : ''),
    )
  }
  return parseExchangeResponse(body)
}

/** Whether the job was granted an OIDC identity (`permissions: id-token: write`). */
export function hasOidcIdentity(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  )
}

/**
 * Whether this run is a pull request from a fork.
 *
 * GitHub withholds an OIDC identity from fork pull requests, and no workflow
 * permission can grant one.
 */
export function isForkPullRequest(
  env: NodeJS.ProcessEnv = process.env,
  readEvent: (path: string) => string = (p) => fs.readFileSync(p, 'utf8'),
): boolean {
  if (env.GITHUB_EVENT_NAME !== 'pull_request' && env.GITHUB_EVENT_NAME !== 'pull_request_target') {
    return false
  }
  const eventPath = env.GITHUB_EVENT_PATH
  if (!eventPath) {
    return false
  }
  try {
    const event = JSON.parse(readEvent(eventPath)) as {
      pull_request?: { head?: { repo?: { full_name?: unknown } } }
    }
    const head = event.pull_request?.head?.repo?.full_name
    return typeof head === 'string' && head !== '' && head !== env.GITHUB_REPOSITORY
  } catch {
    return false
  }
}
