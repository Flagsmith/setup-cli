# `Flagsmith/setup-cli`

Install the [Flagsmith CLI](https://github.com/Flagsmith/flagsmith-cli) in a GitHub Actions job, and authenticate it
without storing a secret.

The action asks GitHub for an OIDC token and exchanges it for a short-lived Flagsmith access token, which the CLI then
picks up from the environment. Configure a **trust relationship** for your repository first: Organisation settings →
**API Access** → **Trust relationships**.

## Usage

```yaml
jobs:
  flagsmith:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # required for the token exchange
      contents: read
    steps:
      - uses: Flagsmith/setup-cli@v1
      - run: flagsmith auth status
```

## Inputs

| Input         | Default                     | Description                                                                                                                                                                          |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api-url`     | `https://api.flagsmith.com` | Flagsmith API base URL. Set this for self-hosted instances.                                                                                                                           |
| `audience`    | GitHub's default            | The `aud` claim to request. GitHub's default is `https://github.com/OWNER`, which is what the GitHub Actions trust relationship form expects. Set it to target a specific `audience`. |
| `cli-version` | `latest`                    | CLI version to install, e.g. `v2.0.0`.                                                                                                                                               |

## Outputs

| Output          | Description                                                             |
| --------------- | ----------------------------------------------------------------------- |
| `cli-version`   | The CLI version that was installed.                                     |
| `api-url`       | The API base URL the CLI is configured against.                         |
| `access-token`  | The exchanged access token (masked). Most workflows don't need this.    |
| `expires-in`    | Access token lifetime in seconds.                                       |

## When the action skips authentication

The CLI is always installed. Authentication is skipped, with a warning, when:

- the job has no `id-token: write` permission;
- the run is a **pull request from a fork** — GitHub withholds an OIDC identity from those, and no `permissions:`
  setting can grant one;
- the job already carries a credential the CLI would use for this `api-url` (`FLAGSMITH_API_KEY` or
  `FLAGSMITH_ACCESS_TOKEN`, scoped or unscoped, following the CLI's own precedence). Bring your own key and the action
  leaves it alone:

```yaml
- uses: Flagsmith/setup-cli@v1
- run: flagsmith auth status
  env:
    FLAGSMITH_API_KEY: ${{ secrets.FLAGSMITH_API_KEY }}
```

## What the action exports

- `FLAGSMITH_API_URL` — so later steps talk to the same instance.
- `FLAGSMITH_ACCESS_TOKEN_<HOST>` — the access token, under the CLI's host-scoped credential name. The CLI trusts the
  unscoped `FLAGSMITH_ACCESS_TOKEN` only for `api.flagsmith.com`, so the action always exports the scoped form. Use the
  `access-token` output if you need the raw token for something other than the CLI.

The CLI binary is added to `PATH` via `GITHUB_PATH`, and cached in the runner tool cache by version and architecture.

## How it installs

The action runs the CLI's own [`install.sh`/`install.ps1`](https://github.com/Flagsmith/flagsmith-cli), pinned to the
version being installed, with `--bin-dir` and `--no-modify-path`. Platform detection, the release layout and checksum
verification therefore live in the repository that publishes the releases, and shell profiles are left untouched.

One consequence: on Linux and macOS the installer needs `curl` or `wget`. Most container images have neither
(`ubuntu:24.04`, `node:*-slim`, `python:*-slim`; alpine has busybox `wget`), so if you run in a `container:`, add `curl`
to the image. The action checks for this and says so before running the installer.

## Development

```sh
npm ci
npm test        # unit tests
npm run all     # typecheck, test, and rebuild dist/
```

`dist/` is committed because GitHub runs the bundle, not `src/`. CI fails if it is stale.
