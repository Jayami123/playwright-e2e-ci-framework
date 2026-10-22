#!/usr/bin/env bash
# Sourced by scripts/bootstrap.sh and scripts/cloud-env.sh so both resolve the same PRODUCTS_ROOT.
# Needs REPO_ROOT to be set by the caller. Prints the absolute path; creates the folder.
# Order: PRODUCTS_ROOT from the environment, then PRODUCTS_ROOT in .env, then ../products
# next to this repo, then $HOME/products (a cloud VM whose repo parent is not writable).

resolve_products_root() {
  local root="${PRODUCTS_ROOT:-}"
  if [ -z "$root" ] && [ -f "$REPO_ROOT/.env" ]; then
    root="$(sed -n 's/^PRODUCTS_ROOT=//p' "$REPO_ROOT/.env" | tail -n 1 | tr -d '\r"'"'")"
  fi
  if [ -n "$root" ]; then
    case "$root" in
      /* | [A-Za-z]:*) ;;
      *) root="$REPO_ROOT/$root" ;;
    esac
    mkdir -p "$root"
    (cd "$root" && pwd)
    return
  fi
  root="$(cd "$REPO_ROOT/.." && pwd)/products"
  if mkdir -p "$root" 2>/dev/null && [ -w "$root" ]; then
    (cd "$root" && pwd)
    return
  fi
  root="$HOME/products"
  mkdir -p "$root"
  (cd "$root" && pwd)
}
