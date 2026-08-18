/**
 * The CLI's host-scoped credential names.
 *
 * The CLI trusts the unscoped `FLAGSMITH_ACCESS_TOKEN` only for its own default
 * host, so a token minted for any other instance must be exported under the
 * scoped name.
 */

export const DEFAULT_API_URL = 'https://api.flagsmith.com'

export const ACCESS_TOKEN_ENV = 'FLAGSMITH_ACCESS_TOKEN'

export const API_KEY_ENV = 'FLAGSMITH_API_KEY'

/**
 * A URL's host and port, lowercased. A value that does not parse as a URL is
 * treated as a bare host, matching the Go `urlHost`.
 */
export function urlHost(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.host !== '') {
      return parsed.host.toLowerCase()
    }
  } catch {
    // Not a URL; fall through to the bare-host reading.
  }
  return rawUrl.replace(/^\/+|\/+$/g, '').toLowerCase()
}

/**
 * The host-scoped form of a credential variable for an instance URL: the host
 * and port with `-` written `__`, and `.` and `:` written `_`.
 */
export function scopedEnvName(base: string, rawUrl: string): string {
  const host = urlHost(rawUrl)
    .replace(/[[\]]/g, '')
    .replace(/-/g, '__')
    .replace(/[.:]/g, '_')
  return `${base}_${host}`
}

/** Trailing slashes would double up in request paths, and the CLI trims them too. */
export function normaliseApiUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '')
}

/** The CLI looks credential variables up case-insensitively, so do the same. */
function lookupFold(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(env)) {
    if (key.toLowerCase() === wanted && value !== undefined && value !== '') {
      return key
    }
  }
  return undefined
}

/**
 * The name of a credential the job already carries for this instance, if any.
 *
 * This mirrors the CLI's own precedence in `loadCredential`: a Master API key
 * wins over an access token, and the unscoped form counts only for the default
 * host. When the job has brought its own credential there is nothing to gain
 * from an exchange, and failing one would be gratuitous.
 */
export function existingCredential(
  apiUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const isDefaultHost = urlHost(apiUrl) === urlHost(DEFAULT_API_URL)
  for (const base of [API_KEY_ENV, ACCESS_TOKEN_ENV]) {
    const scoped = lookupFold(env, scopedEnvName(base, apiUrl))
    if (scoped) {
      return scoped
    }
    if (isDefaultHost) {
      const unscoped = lookupFold(env, base)
      if (unscoped) {
        return unscoped
      }
    }
  }
  return undefined
}
