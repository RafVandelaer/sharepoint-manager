#!/usr/bin/env bash

# Ephemeral Admin Token Helper Script
# ====================================
# Doel: gemak voor rotatie, status uitlezen en gebruik van ephemeral admin token
# Vereist: server draait lokaal (default http://localhost:3000)
# Auth: gebruikt eerst opgeslagen ephemeral token (cache bestand), anders legacy ADMIN_API_KEY uit .env
#
# Functies:
#   rotate [ttlSeconds]   - Genereer/roteer token met optionele TTL
#   status                - Toon status van huidig token
#   logs [date]           - Haal logs op (YYYY-MM-DD, default: vandaag)
#   ensure                - Zorg dat er een token is (geen output behalve foutmeldingen)
#   help                  - Toon gebruik
#
# Opslag:
#   Cache bestand: .admin-ephemeral-token (in project root)
#
# Exit codes:
#   0 = succes
#   1 = algemene fout
#   2 = authenticatie fout

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
CACHE_FILE=".admin-ephemeral-token"
ENV_FILE=".env"

red() { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
blue() { printf "\033[34m%s\033[0m\n" "$*"; }

have_legacy_key() {
  grep -E '^ADMIN_API_KEY=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '\r' | tr -d '\n'
}

load_token() {
  if [[ -f "$CACHE_FILE" ]]; then
    tr -d '\r' < "$CACHE_FILE" | tr -d '\n'
  fi
}

save_token() {
  printf '%s' "$1" > "$CACHE_FILE"
}

api_get() {
  local path="$1"; shift || true
  local token="$(load_token || true)"
  local legacy="$(have_legacy_key || true)"
  if [[ -n "$token" ]]; then
    curl -fsS "$BASE_URL$path" -H "X-Admin-Ephemeral: $token" "$@"
  elif [[ -n "$legacy" ]]; then
    curl -fsS "$BASE_URL$path" -H "X-Admin-Key: $legacy" "$@"
  else
    red "Geen ephemeral token of legacy ADMIN_API_KEY beschikbaar"
    exit 2
  fi
}

api_post() {
  local path="$1"; shift || true
  local data="$1"; shift || true
  local token="$(load_token || true)"
  local legacy="$(have_legacy_key || true)"
  if [[ -n "$token" ]]; then
    curl -fsS -X POST "$BASE_URL$path" -H 'Content-Type: application/json' -H "X-Admin-Ephemeral: $token" -d "$data" "$@"
  elif [[ -n "$legacy" ]]; then
    curl -fsS -X POST "$BASE_URL$path" -H 'Content-Type: application/json' -H "X-Admin-Key: $legacy" -d "$data" "$@"
  else
    red "Geen authenticatiemiddel beschikbaar voor POST"
    exit 2
  fi
}

cmd_rotate() {
  local ttlSeconds="${1:-}"; local ttlMs="";
  if [[ -n "$ttlSeconds" ]]; then
    if ! [[ "$ttlSeconds" =~ ^[0-9]+$ ]]; then
      red "TTL moet een geheel aantal seconden zijn"; exit 1;
    fi
    ttlMs=$(( ttlSeconds * 1000 ))
  fi
  yellow "Roteer token (TTL: ${ttlSeconds:-default})..."
  local payload="{\"rotate\": true$( [[ -n "$ttlMs" ]] && printf ", \"ttlMs\": %s" "$ttlMs" ) }"
  if result=$(api_post '/api/admin/ephemeral' "$payload" 2>&1); then
    local token
    token=$(echo "$result" | grep -o '"token":"[a-f0-9]\{64\}"' | cut -d'"' -f4 || true)
    if [[ -n "$token" ]]; then
      save_token "$token"
      green "Nieuw ephemeral token opgeslagen in $CACHE_FILE"
      echo "$result" | sed 's/"token":"[a-f0-9]\{64\}"/"token":"<redacted>"/'
    else
      red "Kon token niet extraheren"; echo "$result"; exit 1
    fi
  else
    red "Rotatie mislukt"; echo "$result"; exit 1
  fi
}

cmd_status() {
  if output=$(api_get '/api/admin/ephemeral' 2>&1); then
    echo "$output" | sed 's/"token":"[a-f0-9]\{64\}"/"token":"<redacted>"/'
  else
    red "Status ophalen mislukt"; echo "$output"; exit 1
  fi
}

cmd_logs() {
  local date="$1";
  if [[ -z "$date" ]]; then
    date=$(date '+%Y-%m-%d')
  fi
  yellow "Logs ophalen voor datum: $date"
  if output=$(api_get "/api/logs?date=$date" 2>&1); then
    echo "$output"
  else
    red "Logs ophalen mislukt"; echo "$output"; exit 1
  fi
}

cmd_ensure() {
  local token="$(load_token || true)"
  if [[ -n "$token" ]]; then
    yellow "Bestaand token gedetecteerd (cache)."; return 0
  fi
  local legacy="$(have_legacy_key || true)"
  if [[ -z "$legacy" ]]; then
    red "Geen legacy ADMIN_API_KEY beschikbaar voor initiële rotatie"; exit 2
  fi
  cmd_rotate
}

cmd_help() {
  cat <<EOF
Gebruik: $0 <command> [args]

Commands:
  rotate [ttlSeconds]  Genereer/roteer ephemeral token (standaard TTL = 8h)
  status               Toon token status (expiry, rotaties)
  logs [YYYY-MM-DD]    Haal admin logs op (default vandaag)
  ensure               Zorg dat er een token is (genereer indien nodig)
  help                 Toon deze hulp

Variabelen:
  BASE_URL   Server basis URL (default http://localhost:3000)
  ADMIN_API_KEY in .env voor initiële rotatie indien geen token aanwezig.

Voorbeeld:
  $0 ensure
  $0 rotate 14400          # 4 uur TTL
  $0 status
  $0 logs 2025-11-25
EOF
}

main() {
  local cmd="${1:-help}"; shift || true
  case "$cmd" in
    rotate) cmd_rotate "$@" ;;
    status) cmd_status ;;
    logs)   cmd_logs "$@" ;;
    ensure) cmd_ensure ;;
    help|--help|-h) cmd_help ;;
    *) red "Onbekend commando: $cmd"; cmd_help; exit 1 ;;
  esac
}

main "$@"
