#!/usr/bin/env bash
# Clone the product forks qa-portfolio-harness needs into PRODUCTS_ROOT, then write the cloud .env.
# Usage: bash scripts/bootstrap.sh [medusa|cal|documenso|twenty ...]   (default: medusa)
# Idempotent: an existing checkout is never reset, pulled or overwritten.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/products-root.sh
source "$REPO_ROOT/scripts/lib/products-root.sh"
# Must equal the env refs in .github/workflows/e2e.yml (tests/unit/bootstrap-refs.spec.ts fails on drift).
MEDUSA_REF="f677db438f27294fc50e4c7c6612e71ff38eeff5"
DOCUMENSO_REF="f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c"
TWENTY_REF="7cbdfec6f346b43715bc2056932f4fad5886f733"
CAL_REF="main"
MEDUSA_PNPM="10.11.1"
ALL_PRODUCTS=(cal documenso medusa twenty)

log() { printf '[bootstrap] %s\n' "$*"; }

# Folder names the harness resolves under PRODUCTS_ROOT (harness v0.2.11 src/config.ts).
product_dir() {
  case "$1" in
    cal) echo cal ;;
    documenso) echo documenso ;;
    medusa) echo medusa-dtc-starter ;;
    twenty) echo twenty-CRM ;;
    *) return 1 ;;
  esac
}
product_repo() {
  case "$1" in
    cal) echo https://github.com/Jayami123/cal.git ;;
    documenso) echo https://github.com/Jayami123/documenso.git ;;
    medusa) echo https://github.com/Jayami123/medusa-dtc-starter.git ;;
    twenty) echo https://github.com/Jayami123/twenty-CRM.git ;;
  esac
}
product_ref() {
  case "$1" in
    cal) echo "$CAL_REF" ;;
    documenso) echo "$DOCUMENSO_REF" ;;
    medusa) echo "$MEDUSA_REF" ;;
    twenty) echo "$TWENTY_REF" ;;
  esac
}

clone_pinned() {
  local url="$1" ref="$2" dest="$3"
  if [ -d "$dest/.git" ]; then
    local head
    head="$(git -C "$dest" rev-parse HEAD 2>/dev/null || echo unknown)"
    if [[ "$ref" =~ ^[0-9a-f]{40}$ ]] && [ "$head" != "$ref" ]; then
      log "WARN $dest is at $head, pinned ref is $ref. Left as is."
    else
      log "$dest already cloned ($head). Left as is."
    fi
    return
  fi
  if [ -d "$dest" ] && [ -n "$(ls -A "$dest")" ]; then
    log "ERROR $dest exists, is not empty and is not a git checkout. Move it away and rerun."
    exit 1
  fi
  log "cloning $url at $ref into $dest (depth 1)"
  mkdir -p "$dest"
  # One chain: a half-finished clone (network error, bad ref) must not leave a .git behind, or the
  # next run would treat the empty checkout as "already cloned".
  if ! {
    git -C "$dest" init -q \
      && git -C "$dest" remote add origin "$url" \
      && git -C "$dest" fetch -q --depth 1 origin "$ref" \
      && git -C "$dest" -c advice.detachedHead=false checkout -q FETCH_HEAD
  }; then
    rm -rf "$dest/.git"
    log "ERROR cloning $url at $ref into $dest failed; removed $dest/.git so a rerun clones again."
    exit 1
  fi
  log "cloned $(git -C "$dest" rev-parse HEAD)"
}

install_medusa_deps() {
  local dest="$1"
  if [ "${BOOTSTRAP_SKIP_INSTALL:-0}" = "1" ]; then
    log "BOOTSTRAP_SKIP_INSTALL=1; skipping Medusa pnpm install."
    return
  fi
  local pnpm_cmd=(pnpm)
  if ! command -v pnpm >/dev/null 2>&1; then
    pnpm_cmd=(corepack "pnpm@$MEDUSA_PNPM")
  fi
  log "pnpm install --frozen-lockfile in $dest"
  (cd "$dest" && COREPACK_ENABLE_STRICT=0 "${pnpm_cmd[@]}" install --frozen-lockfile)
}

install_cal_deps() {
  local dest="$1"
  if [ "${BOOTSTRAP_SKIP_INSTALL:-0}" = "1" ]; then
    log "BOOTSTRAP_SKIP_INSTALL=1; skipping Cal yarn install."
    return
  fi
  # Corepack fetches the fork's packageManager Yarn (4.12.0) from repo.yarnpkg.com.
  log "yarn install --immutable in $dest"
  (cd "$dest" && TURBO_TELEMETRY_DISABLED=1 COREPACK_ENABLE_STRICT=0 corepack yarn install --immutable)
}

# Writes the Cal .env content to $1 from the example at $2. Runs in a subshell so umask 077
# (file created owner-only) does not leak. Returns non-zero on any failure; never prints secrets.
write_cal_env() (
  umask 077
  local out="$1" example="$2" nextauth_secret encryption_key
  if [ ! -f "$example" ]; then
    log "ERROR $example missing"
    return 1
  fi
  sed 's|http://localhost:3000|http://127.0.0.1:3000|g' "$example" \
    | { grep -vE '^(NEXTAUTH_SECRET|CALENDSO_ENCRYPTION_KEY)=' || true; } > "$out" || return 1
  if ! nextauth_secret="$(openssl rand -base64 32)" || [ -z "$nextauth_secret" ]; then
    log "ERROR could not generate NEXTAUTH_SECRET"
    return 1
  fi
  if ! encryption_key="$(openssl rand -base64 24)" || [ -z "$encryption_key" ]; then
    log "ERROR could not generate CALENDSO_ENCRYPTION_KEY"
    return 1
  fi
  printf 'NEXTAUTH_SECRET=%s\nCALENDSO_ENCRYPTION_KEY=%s\n' "$nextauth_secret" "$encryption_key" >> "$out" || return 1
  if ! grep -qE '^NEXTAUTH_SECRET=.+' "$out" || ! grep -qE '^CALENDSO_ENCRYPTION_KEY=.+' "$out"; then
    log "ERROR generated .env is missing NEXTAUTH_SECRET or CALENDSO_ENCRYPTION_KEY"
    return 1
  fi
  chmod 600 "$out"
)

# Same steps as P1 CI "Prepare Cal product .env". Never prints the generated values.
# Built in a temp file and moved into place, so a failed run never leaves a partial .env.
prepare_cal_env() {
  local dest="$1"
  if [ -f "$dest/.env" ]; then
    log "$dest/.env exists. Left as is."
    return
  fi
  local tmp="$dest/.env.tmp.$$"
  if ! write_cal_env "$tmp" "$dest/.env.example" || ! mv "$tmp" "$dest/.env"; then
    rm -f "$tmp"
    log "ERROR could not write $dest/.env; nothing was created"
    exit 1
  fi
  log "wrote $dest/.env (generated secrets, not printed)"
}

install_documenso_deps() {
  local dest="$1"
  if [ "${BOOTSTRAP_SKIP_INSTALL:-0}" = "1" ]; then
    log "BOOTSTRAP_SKIP_INSTALL=1; skipping Documenso npm ci."
    return
  fi
  local node_home="${DOCUMENSO_NODE_HOME:-/opt/node24}" path_prefix=""
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$major" -lt 24 ]; then
    if [ ! -x "$node_home/bin/node" ]; then
      log "ERROR Documenso needs Node 24; install it at /opt/node24 (see docs/cloud-environments.md) or set DOCUMENSO_NODE_HOME."
      exit 1
    fi
    path_prefix="$node_home/bin:"
  fi
  log "npm ci in $dest (Node $(PATH="${path_prefix}$PATH" node -v))"
  (cd "$dest" && PATH="${path_prefix}$PATH" npm ci --no-audit --no-fund)
}

main() {
  local products=("$@")
  [ "${#products[@]}" -gt 0 ] || products=(medusa)
  local p
  for p in "${products[@]}"; do
    product_dir "$p" >/dev/null || {
      log "ERROR unknown product '$p' (expected: ${ALL_PRODUCTS[*]})"
      exit 1
    }
  done

  local root
  root="$(resolve_products_root)"
  log "PRODUCTS_ROOT=$root"

  for p in "${products[@]}"; do
    local dest
    dest="$root/$(product_dir "$p")"
    clone_pinned "$(product_repo "$p")" "$(product_ref "$p")" "$dest"
    case "$p" in
      medusa) install_medusa_deps "$dest" ;;
      cal)
        install_cal_deps "$dest"
        prepare_cal_env "$dest"
        ;;
      documenso) install_documenso_deps "$dest" ;;
      *) log "$p: dependency install is not automated yet; see the product README." ;;
    esac
  done

  # The harness resolves every product folder on load, so the others must at least exist.
  for p in "${ALL_PRODUCTS[@]}"; do
    mkdir -p "$root/$(product_dir "$p")"
  done
  # Create or complete .env with the same PRODUCTS_ROOT (never overwrites existing keys).
  PRODUCTS_ROOT="$root" bash "$REPO_ROOT/scripts/cloud-env.sh"
  log "done"
}

main "$@"
