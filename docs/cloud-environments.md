# Cloud environments

How this repo runs in Cursor cloud agents and Claude Code cloud sessions. The pattern is the same as in
`k6-load-concurrency-suite` (P6). Everything under "Automatic from the repo" is committed here;
everything under "Pasted by hand" lives in the cloud product's own settings and must be edited there.

## What is automatic from the repo

| Piece                                                                                | Cursor cloud                                                                                                                              | Claude Code cloud                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Image: Node 22.23.3, pnpm 10.11.1, Node 24.21.0 at `/opt/node24`, shellcheck, Docker | `.cursor/Dockerfile` (rebuilt when it changes)                                                                                            | The product's base image plus the setup script below                           |
| Dependencies and product forks                                                       | `.cursor/environment.json` `install`: `npm ci`, `npx playwright install --with-deps chromium firefox`, `bash scripts/bootstrap.sh medusa` | Run `npm ci` and `bash scripts/bootstrap.sh <products>` on demand              |
| Docker daemon                                                                        | `start`: `sudo service docker start`                                                                                                      | `.claude/hooks/session-start.sh`                                               |
| `127.0.0.1 p1.lvh.me` in `/etc/hosts` (Documenso public host, as in `e2e.yml`)       | `start` (idempotent)                                                                                                                      | `.claude/hooks/session-start.sh` (idempotent)                                  |
| `/usr/local/bin` first on `PATH` (Node 22.23)                                        | Not needed in the image; see AGENTS.md for Cursor's own Node                                                                              | Hook writes it to `$CLAUDE_ENV_FILE`                                           |
| `.env` (non-secret defaults, generated Medusa admin password)                        | `scripts/bootstrap.sh` calls `scripts/cloud-env.sh`                                                                                       | Hook calls `scripts/cloud-env.sh`; `bootstrap.sh` calls it again               |
| No Claude attribution lines in commits and PRs                                       | n/a                                                                                                                                       | `.claude/settings.json`                                                        |
| `P1:` hints on stderr when something is missing                                      | n/a                                                                                                                                       | Hook: Node 24, shellcheck, `CAL_E2E_PASSWORD`, `CAL_DST_PASSWORD` (names only) |

`scripts/cloud-env.sh` creates `.env` (mode 600, temp file then move) when it is missing. When `.env` exists it
appends only the keys that are missing and never changes an existing line. It writes `PRODUCTS_ROOT`, the Cal,
Documenso, Twenty and Medusa base URLs and database URLs, `CAL_E2E_EMAIL`, `CAL_DST_EMAIL`,
`P1_DOCUMENSO_RETRIES=0`, `TWENTY_IMAGE_TAG`, `MEDUSA_ADMIN_EMAIL`, and a random `MEDUSA_ADMIN_PASSWORD` that is
generated once and kept: the harness database keeps the admin user, so the password must stay stable on a machine.
It never writes `CAL_E2E_PASSWORD`, `CAL_DST_PASSWORD`, `TWENTY_PASSWORD` or `DANGEROUS_BYPASS_RATE_LIMITS`, and
prints key names only.

`scripts/bootstrap.sh` pins the product forks to the refs in `.github/workflows/e2e.yml`; the unit test
`tests/unit/bootstrap-refs.spec.ts` fails when they drift.

### Which process reads which variables

- `playwright.config.ts` and the tests import `src/core/config.ts`, which loads the repo `.env` with `dotenv`
  (no override: a real environment variable wins). The harness is called inside that same process, so it sees
  the values. Run Playwright through `npm run test:<product>`: a worker reloads the config without `--project`
  and `npm_lifecycle_event` is how the config knows which product it is for.
- `qa-portfolio-harness` itself only loads `.env` from its own folder (inside `node_modules`, never edited).
  Its CLI scripts (`node_modules/qa-portfolio-harness/scripts/up.mjs`, `down.mjs`) therefore read the process
  environment only. Export the repo `.env` first: `set -a; . ./.env; set +a`.
- Medusa: `adapter.seed()` runs `medusa user -e "$MEDUSA_ADMIN_EMAIL" -p "$MEDUSA_ADMIN_PASSWORD"`, so the admin
  is created from those two variables.

## Pasted by hand: Claude Code cloud environment

Open the cloud environment menu in the session title bar, then Edit.

- **Name:** `playwright-e2e-ci-framework`
- **Network access:** Limited, with "Allow package managers" ticked and these allowed domains:

  | Domain                                                                       | Why                                                                      |
  | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
  | `nodejs.org`                                                                 | Node 24.21.0 tarball and `SHASUMS256.txt` (setup script)                 |
  | `registry.npmjs.org`                                                         | `npm ci`, Documenso `npm ci`, pnpm and Yarn package downloads            |
  | `repo.yarnpkg.com`                                                           | Corepack fetches Yarn 4 for the Cal fork                                 |
  | `github.com`, `codeload.github.com`                                          | product fork clones, `qa-portfolio-harness` install                      |
  | `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`               | Playwright browser downloads                                             |
  | `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com` | images `postgres:15`, `redis:7`, `inbucket/inbucket`, `twentycrm/twenty` |

  In this session's own run (default network policy) nothing was blocked, so the list comes from the hosts the
  commands above use, not from a measured denial. If a command fails on a host that is not listed, add it here and
  in the environment.

- **Environment variables:** none in the settings form. The two variables the owner sets by hand (names only,
  values are never written to a file): `CAL_E2E_PASSWORD` and `CAL_DST_PASSWORD`. Add them as variables of the
  cloud environment, using whatever secret mechanism the product offers. The hook prints a `P1:` hint naming
  either one if it is missing. `TWENTY_PASSWORD` stays unset (the harness default applies).
- **Setup script**, pasted as it is. It runs when each new session starts, is idempotent, checks the tarball
  against `SHASUMS256.txt`, works as root or with `sudo`, and never changes `PATH`:

  ```bash
  # --- P1: Node 24 for Documenso (side by side; /usr/local/bin keeps Node 22 first) ---
  P1_NODE24_VERSION=v24.21.0
  P1_SUDO=""; [ "$(id -u)" -eq 0 ] || P1_SUDO="sudo"
  if [ "$(/opt/node24/bin/node -v 2>/dev/null)" != "$P1_NODE24_VERSION" ]; then
    p1_tmp="$(mktemp -d)"
    p1_tar="node-$P1_NODE24_VERSION-linux-x64.tar.xz"
    curl -fsSL --retry 3 -o "$p1_tmp/$p1_tar" "https://nodejs.org/dist/$P1_NODE24_VERSION/$p1_tar" &&
      curl -fsSL --retry 3 -o "$p1_tmp/SHASUMS256.txt" "https://nodejs.org/dist/$P1_NODE24_VERSION/SHASUMS256.txt" &&
      (cd "$p1_tmp" && grep " $p1_tar\$" SHASUMS256.txt | sha256sum -c -) &&
      $P1_SUDO rm -rf /opt/node24 &&
      $P1_SUDO mkdir -p /opt/node24 &&
      $P1_SUDO tar -xJf "$p1_tmp/$p1_tar" -C /opt/node24 --strip-components=1 ||
      echo "P1: Node 24 install failed; Documenso commands will report ENV until it is fixed" >&2
    rm -rf "$p1_tmp"
  fi
  /opt/node24/bin/node -v 2>/dev/null || echo "P1: /opt/node24/bin/node missing" >&2
  command -v shellcheck >/dev/null 2>&1 || { $P1_SUDO apt-get install -y shellcheck >/dev/null 2>&1 || echo "P1: shellcheck install failed" >&2; }
  ```

  Do not add `bootstrap.sh` here; run it on demand.

## Pasted by hand: Cursor cloud

Nothing. There are no variables or secrets in the settings form. Set the same two variables
(`CAL_E2E_PASSWORD`, `CAL_DST_PASSWORD`) as secrets of the Cursor cloud environment. If the environment limits
network access, allow the domains in the table above.

## Updating

| Change                                                               | Where to change it                                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Product ref (`MEDUSA_REF`, `DOCUMENSO_REF`, `TWENTY_REF`, `CAL_REF`) | `.github/workflows/e2e.yml` `env`, then the same value in `scripts/bootstrap.sh`; the unit test enforces it                               |
| Twenty image tag                                                     | `e2e.yml` `TWENTY_IMAGE_TAG`, then `scripts/cloud-env.sh`; the unit test enforces it                                                      |
| Node 22, pnpm, Docker or shellcheck version                          | `.cursor/Dockerfile` (Cursor rebuilds). Claude uses its own base image: nothing to change unless a `P1:` hint appears                     |
| Node 24 version                                                      | `DOCUMENSO_NODE_VERSION` in `.cursor/Dockerfile` and `P1_NODE24_VERSION` in the Claude setup script above and in the environment settings |
| New default `.env` key                                               | `scripts/cloud-env.sh`. Existing machines get the key on the next run; their existing lines are never edited                              |
| Setup script or allowed domains in Claude                            | Edit the environment settings by hand, then update the matching text in this file in the same pull request                                |

Existing Claude environments keep their saved settings; only new sessions pick up an edited setup script.
