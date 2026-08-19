import { ACCESS_TOKEN_ENV, API_KEY_ENV, DEFAULT_API_URL } from './constants.js'

// The CLI reads credentials from the environment in two forms: unscoped
// (`FLAGSMITH_API_KEY`) and host-scoped (`FLAGSMITH_API_KEY_api_flagsmith_com`).
// The scoped form names the instance it belongs to; the unscoped form is
// trusted only for the default api.flagsmith.com host, so a credential is
// never sent to an instance it was not set for.

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
    const scopedName = scopedEnvName(base, apiUrl).toLowerCase()
    const scopedCredential = Object.keys(env).find(
      (key) => key.toLowerCase() === scopedName && env[key],
    )
    if (scopedCredential) {
      return scopedCredential
    }
    // The unscoped form is an exact name, also matching the CLI.
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
