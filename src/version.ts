import * as core from '@actions/core'
import { HttpClient } from '@actions/http-client'

import { REPO } from './install.js'

/**
 * Resolve a requested version to a concrete release tag, so "latest" is
 * reported and cached under the tag it resolved to.
 */
export async function resolveVersion(requested: string): Promise<string> {
  const trimmed = requested.trim()
  if (trimmed !== '' && trimmed.toLowerCase() !== 'latest') {
    // Releases are tagged `vX.Y.Z`; both forms are accepted.
    return /^\d/.test(trimmed) ? `v${trimmed}` : trimmed
  }

  const url = `https://api.github.com/repos/${REPO}/releases/latest`
  const http = new HttpClient('Flagsmith/setup-cli')
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
  }
  // A token lifts the request out of the shared unauthenticated rate limit.
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const response = await http.get(url, headers)
  const body = await response.readBody()
  if (response.message.statusCode !== 200) {
    throw new Error(
      `cannot resolve the latest ${REPO} release (HTTP ${response.message.statusCode}).`
    )
  }

  let tag: unknown
  try {
    tag = (JSON.parse(body) as { tag_name?: unknown }).tag_name
  } catch {
    tag = undefined
  }
  if (typeof tag !== 'string' || tag === '') {
    throw new Error(`unexpected response from ${url}. Pin cli-version instead.`)
  }
  core.info(`Resolved cli-version "latest" to ${tag}`)
  return tag
}
