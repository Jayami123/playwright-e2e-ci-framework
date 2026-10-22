# Cloud environments

How this repo runs in Cursor cloud agents and Claude Code cloud sessions. The pattern is the same as in
`k6-load-concurrency-suite` (P6). Everything under "Automatic from the repo" is committed here;
everything under "Pasted by hand" lives in the cloud product's own settings and must be edited there.

## What is automatic from the repo

| Piece                                                                                | Cursor cloud                                                                                                                                                                  | Claude Code cloud                                                                                         |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Image: Node 22.23.3, pnpm 10.11.1, Node 24.21.0 at `/opt/node24`, shellcheck, Docker | `.cursor/Dockerfile` (rebuilt when it changes)                                                                                                                                | Setup script below (as root)                                                                              |
| Dependencies and product forks                                                       | `.cursor/environment.json` `install`: `export PATH=/usr/local/bin:$PATH`, `npm ci`, `npx playwright install --with-deps chromium firefox`, `bash scripts/bootstrap.sh medusa` | Setup script: `npm ci`, Playwright browsers, `bash scripts/bootstrap.sh ${P1_BOOTSTRAP_PRODUCTS:-medusa}` |
| Docker daemon                                                                        | `start`: `sudo service docker start`                                                                                                                                          | `.claude/hooks/session-start.sh`                                                                          |
| `127.0.0.1 p1.lvh.me` in `/etc/hosts` (Documenso public host, as in `e2e.yml`)       | `start` (idempotent)                                                                                                                                                          | `.claude/hooks/session-start.sh` (idempotent)                                                             |
| `/usr/local/bin` first on `PATH` (Node 22.23)                                        | Not needed in the image; see AGENTS.md for Cursor's own Node                                                                                                                  | Hook writes it to `$CLAUDE_ENV_FILE`                                                                      |
| `.env` (non-secret defaults, generated Medusa admin password)                        | `scripts/bootstrap.sh` calls `scripts/cloud-env.sh`                                                                                                                           | Hook calls `scripts/cloud-env.sh`; `bootstrap.sh` calls it again                                          |
| No Claude attribution lines in commits and PRs                                       | n/a                                                                                                                                                                           | `.claude/settings.json`                                                                                   |
| `P1:` hints on stderr when something is missing                                      | n/a                                                                                                                                                                           | Hook: Node 24, shellcheck, `CAL_E2E_PASSWORD`, `CAL_DST_PASSWORD` (names only)                            |

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
  | `nodejs.org`                                                                 | Node 22.23.3 and 24.21.0 tarballs and `SHASUMS256.txt` (setup script)    |
  | `registry.npmjs.org`                                                         | `npm ci`, Documenso `npm ci`, pnpm and Yarn package downloads            |
  | `repo.yarnpkg.com`                                                           | Corepack fetches Yarn 4 for the Cal fork                                 |
  | `github.com`, `codeload.github.com`                                          | product fork clones, `qa-portfolio-harness` install                      |
  | `release-assets.githubusercontent.com`, `objects.githubusercontent.com`      | actionlint download (`scripts/actionlint.mts`)                           |
  | `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`               | Playwright browser downloads                                             |
  | `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com` | images `postgres:15`, `redis:7`, `inbucket/inbucket`, `twentycrm/twenty` |

  In this session's own run (default network policy) nothing was blocked, so the list comes from the hosts the
  commands above use, not from a measured denial. If a command fails on a host that is not listed, add it here and
  in the environment.

- **Environment variables:** none in the settings form. The two variables the owner sets by hand (names only,
  values are never written to a file): `CAL_E2E_PASSWORD` and `CAL_DST_PASSWORD`. Add them as variables of the
  cloud environment, using whatever secret mechanism the product offers. The hook prints a `P1:` hint naming
  either one if it is missing. `TWENTY_PASSWORD` stays unset (the harness default applies).
- **Setup script**, pasted as it is. It runs as root and is idempotent: a Node version that is already installed
  is skipped, and each Node download is checked against the official `SHASUMS256.txt`. The toolchain part (Node
  22 and 24, corepack and pnpm, shellcheck) stops at the first failing command (`set -euo pipefail`), because
  nothing after it works without it. The dependency part (`npm ci`, the Playwright browsers, `bootstrap.sh`) is
  fail-soft: a failure prints a `P1:` line to stderr and the script goes on, so it always exits 0. Claude Code
  fails the session when a setup script exits non-zero
  ([script requirements](https://code.claude.com/docs/en/cloud-environments#script-requirements)).

  The default is `bootstrap.sh medusa`, the same as Cursor. Set the environment variable `P1_BOOTSTRAP_PRODUCTS`
  to change it. Run the other products on demand: `bash scripts/bootstrap.sh cal documenso twenty`. The reason is
  time: Claude snapshots the environment only when the setup script finishes in roughly five minutes, and a
  longer script is not cached, so every new session would repeat it
  ([environment caching](https://code.claude.com/docs/en/cloud-environments#environment-caching)). Cloning and
  installing all four forks takes longer than that.

  ```bash
  # --- P1: toolchain, dependencies and product forks (root, idempotent) ---
  set -euo pipefail
  P1_NODE22_VERSION=22.23.3
  P1_NODE24_VERSION=24.21.0
  P1_PNPM_VERSION=10.11.1
  P1_REPO=/home/user/playwright-e2e-ci-framework

  case "$(uname -m)" in
    x86_64) p1_arch=x64 ;;
    aarch64) p1_arch=arm64 ;;
    *) echo "P1: unsupported architecture $(uname -m)" >&2; exit 1 ;;
  esac

  # p1_install_node <version> <prefix>: skip if installed, else download and verify before extracting.
  p1_install_node() {
    local version="$1" prefix="$2" tar="node-v$1-linux-$p1_arch.tar.xz" tmp
    if [ "$("$prefix/bin/node" -v 2>/dev/null)" = "v$version" ]; then return 0; fi
    tmp="$(mktemp -d)"
    curl -fsSL --retry 3 -o "$tmp/$tar" "https://nodejs.org/dist/v$version/$tar"
    curl -fsSL --retry 3 -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v$version/SHASUMS256.txt"
    (cd "$tmp" && grep " $tar\$" SHASUMS256.txt | sha256sum -c -)
    [ "$prefix" = /usr/local ] || rm -rf "$prefix"
    mkdir -p "$prefix"
    tar -xJf "$tmp/$tar" -C "$prefix" --strip-components=1
    rm -rf "$tmp"
  }

  export PATH="/usr/local/bin:$PATH"
  p1_install_node "$P1_NODE22_VERSION" /usr/local
  p1_install_node "$P1_NODE24_VERSION" /opt/node24
  corepack enable
  corepack prepare "pnpm@$P1_PNPM_VERSION" --activate
  command -v shellcheck >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq shellcheck; }
  echo "node $(node -v), node24 $(/opt/node24/bin/node -v), pnpm $(cd / && pnpm -v)," \
    "shellcheck $(shellcheck --version | awk '/^version:/ { print $2 }')"

  # Dependencies and forks are fail-soft: report with a "P1:" line and carry on, so the script exits 0.
  set +euo pipefail
  if [ -d "$P1_REPO" ] && cd "$P1_REPO"; then
    npm ci || echo "P1: npm ci failed; run it by hand in $P1_REPO" >&2
    npx playwright install --with-deps chromium firefox \
      || echo "P1: Playwright browser install failed; run it by hand in $P1_REPO" >&2
    if [ -f scripts/bootstrap.sh ]; then
      # shellcheck disable=SC2086  # the product list is meant to word-split
      bash scripts/bootstrap.sh ${P1_BOOTSTRAP_PRODUCTS:-medusa} \
        || echo "P1: bootstrap.sh failed; run it by hand in $P1_REPO" >&2
    fi
  else
    echo "P1: repo not found at $P1_REPO; skipped npm ci and bootstrap" >&2
  fi
  exit 0
  ```

## Pasted by hand: Cursor cloud

Not everything lives in the repo. Three things are set in Cursor itself:

- **Secrets:** add `CAL_E2E_PASSWORD` and `CAL_DST_PASSWORD` under Cursor's Secrets (names only here, values
  are never written to a file). No plain environment variables are needed.
- **Environment location:** a new saved environment must point its `environment.json` location at this
  repo's `.cursor/environment.json`, so Cursor builds from `.cursor/Dockerfile` and runs `install` and `start`.
- **Default branch only:** Cursor builds from the default-branch config, so changes to `.cursor/` apply only
  after they are merged to `main`. Testing a Dockerfile change needs a merge first.

If the environment limits network access, allow the domains in the table above.

## Updating

| Change                                                               | Where to change it                                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Product ref (`MEDUSA_REF`, `DOCUMENSO_REF`, `TWENTY_REF`, `CAL_REF`) | `.github/workflows/e2e.yml` `env`, then the same value in `scripts/bootstrap.sh`; the unit test enforces it                            |
| Twenty image tag                                                     | `e2e.yml` `TWENTY_IMAGE_TAG`, then `scripts/cloud-env.sh`; the unit test enforces it                                                   |
| Node 22, pnpm, Docker or shellcheck version                          | `.cursor/Dockerfile` (Cursor rebuilds); `P1_NODE22_VERSION` and `P1_PNPM_VERSION` in the Claude setup script above and in the settings |
| Node 24 version                                                      | `DOCUMENSO_NODE_VERSION` in `.cursor/Dockerfile` and `P1_NODE24_VERSION` in the Claude setup script above and in the settings          |
| New default `.env` key                                               | `scripts/cloud-env.sh`. Existing machines get the key on the next run; their existing lines are never edited                           |
| Setup script or allowed domains in Claude                            | Edit the environment settings by hand, then update the matching text in this file in the same pull request                             |

Existing Claude environments keep their saved settings; only new sessions pick up an edited setup script.
