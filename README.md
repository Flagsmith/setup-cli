# `Flagsmith/setup-cli`

Install the [Flagsmith CLI](https://github.com/Flagsmith/flagsmith-cli) in a GitHub Actions job, and authenticate it without storing a secret.

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

Or, with a static key:

```yaml
jobs:
  flagsmith:
    runs-on: ubuntu-latest
    env:
      FLAGSMITH_API_KEY: ${{ secrets.FLAGSMITH_API_KEY }}
    steps:
      - uses: Flagsmith/setup-cli@v1 # installs the CLI, skips the token exchange
      - run: flagsmith flags list # uses your key
```

## Inputs

| Input         | Default                     | Description                                                                                            |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `api-url`     | `https://api.flagsmith.com` | Flagsmith API base URL. Set this for self-hosted instances.                                            |
| `audience`    | `https://github.com/OWNER`  | The `aud` claim to request. Only set this if your Flagsmith trust relationship uses a custom audience. |
| `cli-version` | `latest`                    | CLI version to install, e.g. `v2.0.0`.                                                                 |

## When the action skips authentication

The action always installs the CLI, but may skip authentication if:

- the run is a pull request from a fork.
- the job has no `id-token: write` permission.
- the job already carries a credential the CLI would use for this `api-url` (`FLAGSMITH_API_KEY` or `FLAGSMITH_ACCESS_TOKEN`, scoped to provided `api-url`).

## What the action exports

- `FLAGSMITH_API_URL` so later steps talk to the same instance.
- `FLAGSMITH_ACCESS_TOKEN_<HOST>` the access token, scoped to the API URL host.

The CLI binary is added to `PATH` via `GITHUB_PATH`, and cached in the runner tool cache by version and architecture.

## Development

```sh
npm ci
npm test        # unit tests
npm run all     # typecheck, test, and rebuild dist/
```
