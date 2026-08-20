import * as fs from 'node:fs'

import type { HttpClient } from '@actions/http-client'

import { fetchOrThrow } from './http.js'

export const EXCHANGE_PATH = '/api/v1/auth/oidc/token/'

export interface ExchangedToken {
  accessToken: string
  expiresIn?: number
}

/**
 * Exchange an OIDC token for a short-lived Flagsmith access token.
 */
export async function exchangeToken(
  apiUrl: string,
  idToken: string,
  http?: HttpClient,
): Promise<ExchangedToken> {
  const body = await fetchOrThrow(
    `${apiUrl}${EXCHANGE_PATH}`,
    (status) =>
      `token exchange failed (HTTP ${status}). ${exchangeFailureHint(status, apiUrl)}`,
    JSON.stringify({ token: idToken }),
    http,
  )
  return parseExchangeResponse(body)
}

/** Whether the job was granted an OIDC identity (`permissions: id-token: write`). */
export function hasOidcIdentity(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  )
}

/**
 * GitHub withholds an OIDC identity from fork pull requests, and no workflow
 * permission can grant one.
 */
export function isForkPullRequest(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (
    env.GITHUB_EVENT_NAME !== 'pull_request' &&
    env.GITHUB_EVENT_NAME !== 'pull_request_target'
  ) {
    return false
  }
  const eventPath = env.GITHUB_EVENT_PATH
  if (!eventPath) {
    return false
  }
  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as {
      pull_request?: { head?: { repo?: { full_name?: unknown } } }
    }
    const head = event.pull_request?.head?.repo?.full_name
    return (
      typeof head === 'string' && head !== '' && head !== env.GITHUB_REPOSITORY
    )
  } catch {
    return false
  }
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
    expiresIn:
      typeof parsed.expires_in === 'number' ? parsed.expires_in : undefined,
  }
}

export function exchangeFailureHint(status: number, apiUrl: string): string {
  return (
    HINTS[status]?.(apiUrl) ??
    'Check that api-url points at a Flagsmith instance with trust relationships configured.'
  )
}

const NO_MATCH_HINT =
  'No trust relationship matched this token. Check the repository, GitHub ' +
  'environment and audience configured on the trust relationship in ' +
  'Organisation settings → API Access.'

const HINTS: Record<number, (apiUrl: string) => string> = {
  400: () =>
    'The instance rejected the request body. This is a bug, please report it: https://github.com/Flagsmith/setup-cli/issues/new',
  401: () => NO_MATCH_HINT,
  403: () => NO_MATCH_HINT,
  404: (apiUrl) =>
    `${apiUrl} has no token exchange endpoint. Check the api-url input, and ` +
    'that the instance is version 2.263.0 or later.',
  429: (apiUrl) => `Rate limited by ${apiUrl}. Retry shortly.`,
}
