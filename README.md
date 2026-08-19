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

## Inputs

| Input         | Default                     | Description                                                                                                                                                                           |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-url`     | `https://api.flagsmith.com` | Flagsmith API base URL. Set this for self-hosted instances.                                                                                                                           |
| `audience`    | GitHub's default            | The `aud` claim to request. GitHub's default is `https://github.com/OWNER`, which is what the GitHub Actions trust relationship form expects. Set it to target a specific `audience`. |
| `cli-version` | `latest`                    | CLI version to install, e.g. `v2.0.0`.                                                                                                                                                |

## When the action skips authentication

The CLI is always installed. Authentication is skipped, with a warning, when:

- the job has no `id-token: write` permission.
- the run is a pull request from a fork.
- the job already carries a credential the CLI would use for this `api-url` (`FLAGSMITH_API_KEY` or `FLAGSMITH_ACCESS_TOKEN`, scoped to provided `api-url`). Bring your own key and the action leaves it alone:

```yaml
- uses: Flagsmith/setup-cli@v1
- run: flagsmith auth status
  env:
    FLAGSMITH_API_KEY: ${{ secrets.FLAGSMITH_API_KEY }}
```

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
