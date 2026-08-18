export const DEFAULT_API_URL = 'https://api.flagsmith.com'

export const ACCESS_TOKEN_ENV = 'FLAGSMITH_ACCESS_TOKEN'

export const API_KEY_ENV = 'FLAGSMITH_API_KEY'

/**
 * The name of a credential this environment already carries for an instance.
 *
 * A Master API key wins over an access token, and an unscoped name counts only
 * for the default host.
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

export function normaliseApiUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '')
}

/** A URL's host and port, lowercased. A value that is not a URL is read as a bare host. */
export function urlHost(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.host !== '') {
      return parsed.host.toLowerCase()
    }
  } catch {
    // Fall through to the bare-host reading.
  }
  return rawUrl.replace(/^\/+|\/+$/g, '').toLowerCase()
}

function lookupFold(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const wanted = name.toLowerCase()
  return Object.keys(env).find((key) => key.toLowerCase() === wanted && env[key])
}
