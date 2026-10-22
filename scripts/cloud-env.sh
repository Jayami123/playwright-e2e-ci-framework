#!/usr/bin/env bash
# Create or complete the git-ignored .env for a cloud agent machine (Cursor cloud, Claude Code cloud).
# Usage: bash scripts/cloud-env.sh
# - No .env yet: creates it (mode 600, temp file then mv).
# - .env exists: appends only the keys that are missing; existing lines are never changed.
# Writes non-secret defaults that match .github/workflows/e2e.yml and .env.example, plus a
# random Medusa admin password generated once and kept (the harness database keeps the admin
# user, so the value must stay stable on a machine). Never writes CAL_E2E_PASSWORD,
# CAL_DST_PASSWORD, TWENTY_PASSWORD or DANGEROUS_BYPASS_RATE_LIMITS. Prints key names only.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
# shellcheck source=scripts/lib/products-root.sh
source "$REPO_ROOT/scripts/lib/products-root.sh"

log() { printf '[cloud-env] %s\n' "$*"; }

tmp=""
trap 'rm -f "$tmp"' EXIT

# A key counts as present only with a non-empty value, so a blank "KEY=" line gets a value appended.
has_key() { [ -f "$ENV_FILE" ] && grep -qE "^$1=." "$ENV_FILE"; }

main() {
  umask 077
  local products_root
  products_root="$(resolve_products_root)"

  # key=value pairs in file order. Non-secret defaults only.
  local -a pairs=(
    "PRODUCTS_ROOT=$products_root"
    "CAL_BASE_URL=http://127.0.0.1:3000"
    "CAL_E2E_EMAIL=pro@example.com"
    "CAL_DST_EMAIL=trial@example.com"
    "DOCUMENSO_BASE_URL=http://127.0.0.1:3001"
    "DOCUMENSO_PUBLIC_URL=http://p1.lvh.me:3001"
    "DOCUMENSO_DB_URL=postgres://documenso:password@127.0.0.1:5451/documenso"
    "P1_DOCUMENSO_RETRIES=0"
    "TWENTY_BASE_URL=http://127.0.0.1:3002"
    "TWENTY_DB_URL=postgres://postgres:postgres@127.0.0.1:5434/default"
    "TWENTY_IMAGE_TAG=v2.44.0"
    "MEDUSA_BASE_URL=http://127.0.0.1:9000"
    "MEDUSA_DB_URL=postgres://medusa:medusa@127.0.0.1:5433/medusa"
    "MEDUSA_ADMIN_EMAIL=admin@qa.local"
  )

  local added=() pair key
  tmp="$(mktemp "$REPO_ROOT/.env.tmp.XXXXXX")"
  if [ -f "$ENV_FILE" ]; then
    cat "$ENV_FILE" > "$tmp"
    # Keep an existing file's last line terminated before appending.
    [ ! -s "$tmp" ] || [ -z "$(tail -c 1 "$tmp")" ] || printf '\n' >> "$tmp"
  fi

  for pair in "${pairs[@]}"; do
    key="${pair%%=*}"
    has_key "$key" && continue
    printf '%s\n' "$pair" >> "$tmp"
    added+=("$key")
  done
  if ! has_key MEDUSA_ADMIN_PASSWORD; then
    local password
    password="$(openssl rand -hex 16)"
    [ -n "$password" ] || { log "ERROR could not generate MEDUSA_ADMIN_PASSWORD"; exit 1; }
    printf 'MEDUSA_ADMIN_PASSWORD=%s\n' "$password" >> "$tmp"
    added+=(MEDUSA_ADMIN_PASSWORD)
  fi

  if [ "${#added[@]}" -eq 0 ]; then
    log ".env already has every cloud key. Left as is."
    return
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  log "wrote .env keys (values not printed): ${added[*]}"
}

main "$@"
