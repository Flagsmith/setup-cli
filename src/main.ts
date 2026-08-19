import * as core from '@actions/core'

import { exchangeToken, hasOidcIdentity, isForkPullRequest } from './auth.js'
import { ACCESS_TOKEN_ENV, DEFAULT_API_URL } from './constants.js'
import { existingCredential, scopedEnvName } from './credentials.js'
import { installCli } from './install.js'

const NO_IDENTITY_WARNING =
  'This job cannot request an OIDC token, so the CLI was installed but not ' +
  'authenticated. Add `permissions: id-token: write` to the job to use a ' +
  'Flagsmith trust relationship, or set FLAGSMITH_API_KEY yourself.'

const FORK_PR_WARNING =
  'Pull requests from forks are not given an OIDC identity by GitHub, so the ' +
  'CLI was installed but not authenticated. This cannot be granted with ' +
  '`permissions:`. Use `pull_request_target` with a reviewed workflow, or a ' +
  'FLAGSMITH_API_KEY from secrets, if these runs need Flagsmith access.'

export async function run(): Promise<void> {
  const apiUrl = new URL(
    core.getInput('api-url') || DEFAULT_API_URL,
  ).href.replace(/\/$/, '')
  const audience = core.getInput('audience').trim()

  await installCli(core.getInput('cli-version'))

  const provided = existingCredential(apiUrl)
  if (provided) {
    core.info(`Using the credential already in the environment ($${provided}).`)
    return
  }

  if (!hasOidcIdentity()) {
    if (isForkPullRequest()) {
      core.warning(FORK_PR_WARNING, {
        title: 'No OIDC identity (fork pull request)',
      })
    } else {
      core.warning(NO_IDENTITY_WARNING, { title: 'No OIDC identity' })
    }
    return
  }

  // Without an audience GitHub uses https://github.com/OWNER.
  const idToken = await core.getIDToken(audience || undefined)
  const token = await exchangeToken(apiUrl, idToken)

  core.setSecret(token.accessToken)

  core.exportVariable('FLAGSMITH_API_URL', apiUrl)
  core.exportVariable(
    scopedEnvName(ACCESS_TOKEN_ENV, apiUrl),
    token.accessToken,
  )

  core.info(
    `Authenticated against ${apiUrl}` +
      (token.expiresIn ? `; access token expires in ${token.expiresIn}s` : ''),
  )
}
