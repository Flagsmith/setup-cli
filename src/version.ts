import * as core from '@actions/core'
import { HttpClient } from '@actions/http-client'

import { REPO } from './install.js'

/**
 * Resolve the requested version to a concrete release tag, so the version is
 * reported and cached under the tag rather than under "latest".
 */
export async function resolveVersion(
  requested: string,
  token?: string,
): Promise<string> {
  const trimmed = requested.trim()
  if (trimmed !== '' && trimmed.toLowerCase() !== 'latest') {
    // Releases are tagged `vX.Y.Z`, and people write the version both ways.
    return /^\d/.test(trimmed) ? `v${trimmed}` : trimmed
  }

  const url = `https://api.github.com/repos/${REPO}/releases/latest`
  const http = new HttpClient('Flagsmith/setup-cli')
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
  }
  // The workflow's token lifts us out of the shared unauthenticated rate limit.
  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  const response = await http.get(url, headers)
  const body = await response.readBody()
  if (response.message.statusCode !== 200) {
    throw new Error(
      `cannot resolve the latest ${REPO} release (HTTP ${response.message.statusCode}). ` +
        `Pin cli-version instead.`,
    )
  }

  let tag: unknown
  try {
    tag = (JSON.parse(body) as { tag_name?: unknown }).tag_name
  } catch {
    throw new Error(`unexpected response from ${url}`)
  }
  if (typeof tag !== 'string' || tag === '') {
    throw new Error(
      `no tag_name in the latest ${REPO} release. Pin cli-version instead.`,
    )
  }
  core.info(`Resolved cli-version "latest" to ${tag}`)
  return tag
}
