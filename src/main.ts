import * as core from '@actions/core'

import { exchangeToken, hasOidcIdentity, isForkPullRequest } from './auth.js'
import {
  ACCESS_TOKEN_ENV,
  DEFAULT_API_URL,
  existingCredential,
  normaliseApiUrl,
  scopedEnvName,
} from './credential-name.js'
import { installCli } from './install.js'
import { resolveVersion } from './version.js'

const NO_IDENTITY_WARNING =
  'This job cannot request an OIDC token, so the CLI was installed but not ' +
  'authenticated. Add `permissions: id-token: write` to the job to use a ' +
  'Flagsmith trust relationship, or set FLAGSMITH_API_KEY yourself.'

const FORK_PR_WARNING =
  'Pull requests from forks are not given an OIDC identity by GitHub, so the ' +
  'CLI was installed but not authenticated. This cannot be granted with ' +
  '`permissions:`. Use `pull_request_target` with a reviewed workflow, or a ' +
  'Master API key from secrets, if these runs need Flagsmith access.'

export async function run(): Promise<void> {
  const apiUrl = normaliseApiUrl(core.getInput('api-url') || DEFAULT_API_URL)
  const audience = core.getInput('audience').trim()

  const version = await resolveVersion(
    core.getInput('cli-version'),
    process.env.GITHUB_TOKEN,
  )
  await installCli(version)

  // A job that brought its own credential does not need an exchange, and
  // failing one it never asked for would be gratuitous.
  const provided = existingCredential(apiUrl)
  if (provided) {
    core.info(`Using the credential already in the environment ($${provided}).`)
    return
  }

  if (!hasOidcIdentity()) {
    if (isForkPullRequest()) {
      core.warning(FORK_PR_WARNING, { title: 'No OIDC identity (fork pull request)' })
    } else {
      core.warning(NO_IDENTITY_WARNING, { title: 'No OIDC identity' })
    }
    return
  }

  // Without an audience GitHub uses https://github.com/OWNER, which is what the
  // GitHub Actions trust relationship form expects.
  const idToken = await core.getIDToken(audience || undefined)
  const token = await exchangeToken(apiUrl, idToken)

  // Mask before the value can reach a log through any later step.
  core.setSecret(token.accessToken)

  // The CLI trusts the unscoped credential name only for its default host, so
  // always export the host-scoped form.
  core.exportVariable('FLAGSMITH_API_URL', apiUrl)
  core.exportVariable(scopedEnvName(ACCESS_TOKEN_ENV, apiUrl), token.accessToken)

  core.info(
    `Authenticated against ${apiUrl}` +
      (token.expiresIn ? `; access token expires in ${token.expiresIn}s` : ''),
  )
}

/* c8 ignore start */
if (process.env.VITEST === undefined) {
  run().catch((error: unknown) => {
    core.setFailed(error instanceof Error ? error.message : String(error))
  })
}
/* c8 ignore stop */
