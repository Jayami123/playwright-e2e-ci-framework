#!/bin/bash
# Cloud sessions only: put Node 22 (/usr/local/bin) first on PATH, start Docker, map the Documenso
# public host, complete .env, and hint at anything the environment is missing. Never fails the session.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  # shellcheck disable=SC2016  # the PATH must expand when the env file is sourced
  echo 'export PATH="/usr/local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

if command -v dockerd >/dev/null && ! docker info >/dev/null 2>&1; then
  ($SUDO dockerd > /tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

# P1 Documenso: the public host must resolve to loopback (same as e2e.yml).
grep -qE '^127\.0\.0\.1[[:space:]]+p1\.lvh\.me$' /etc/hosts \
  || echo '127.0.0.1 p1.lvh.me' | $SUDO tee -a /etc/hosts >/dev/null \
  || echo 'P1: could not add p1.lvh.me to /etc/hosts; Documenso tests will fail until it resolves to 127.0.0.1' >&2

# Create or complete .env (non-secret defaults, generated Medusa admin password). Prints key names only.
bash "$REPO_ROOT/scripts/cloud-env.sh" >&2 \
  || echo 'P1: scripts/cloud-env.sh failed; create .env from .env.example' >&2

# Variable names only, never values: a name counts as set in the environment or as a non-empty .env line.
for name in CAL_E2E_PASSWORD CAL_DST_PASSWORD; do
  if [ -z "${!name:-}" ] && ! grep -qE "^${name}=." "$REPO_ROOT/.env" 2>/dev/null; then
    echo "P1: $name is not set; add it as a variable in the cloud environment (docs/cloud-environments.md). Cal tests need it." >&2
  fi
done

if [ ! -x /opt/node24/bin/node ]; then
  echo "P1: Node 24 missing at /opt/node24; add the Node 24 snippet to the environment's setup script (docs/cloud-environments.md)" >&2
fi
if ! command -v shellcheck >/dev/null 2>&1; then
  echo "P1: shellcheck missing; add 'sudo apt-get install -y shellcheck' to the environment's setup script so actionlint matches CI" >&2
fi
exit 0
