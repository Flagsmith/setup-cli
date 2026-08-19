import { ACCESS_TOKEN_ENV, API_KEY_ENV, DEFAULT_API_URL } from './constants.js'

/**
 * The name of a credential this environment already carries for an instance.
 */
export function existingCredential(
  apiUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const isDefaultHost = urlHost(apiUrl) === urlHost(DEFAULT_API_URL)
  for (const base of [API_KEY_ENV, ACCESS_TOKEN_ENV]) {
    // Host-scoped names embed a hostname, which is itself case-insensitive,
    // so the CLI resolves them case-insensitively and this lookup must match.
    // The unscoped form is an exact name, also matching the CLI.
    const scoped = lookupFold(env, scopedEnvName(base, apiUrl))
    if (scoped) {
      return scoped
    }
    if (isDefaultHost && env[base]) {
      return base
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

export function urlHost(rawUrl: string): string {
  return new URL(rawUrl).host.toLowerCase()
}

function lookupFold(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const wanted = name.toLowerCase()
  return Object.keys(env).find(
    (key) => key.toLowerCase() === wanted && env[key],
  )
}
