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

## What the action exports

- `FLAGSMITH_API_URL` — so later steps talk to the same instance.
- `FLAGSMITH_ACCESS_TOKEN_<HOST>` — the access token, under the CLI's host-scoped credential name. The CLI trusts the
  unscoped `FLAGSMITH_ACCESS_TOKEN` only for `api.flagsmith.com`, so the action always exports the scoped form. Use the
  `access-token` output if you need the raw token for something other than the CLI.

The CLI binary is added to `PATH` via `GITHUB_PATH`.

## Without an OIDC identity

If the job has no `id-token: write` permission, the action installs the CLI, warns, and does not authenticate. That
leaves you free to supply a credential yourself:

```yaml
- uses: Flagsmith/setup-cli@v1
- run: flagsmith auth status
  env:
    FLAGSMITH_API_KEY: ${{ secrets.FLAGSMITH_API_KEY }}
```
