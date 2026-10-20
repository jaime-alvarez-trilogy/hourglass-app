#!/usr/bin/env bash
#
# check-legal-pages.sh — verify the public legal pages App Store Connect links to.
#
# Usage: scripts/check-legal-pages.sh [BASE_URL]
#   BASE_URL  default https://jaime-alvarez-trilogy.github.io/hourglass-app
#             one trailing "/" is stripped
#
# Checks (all run, fixed order; redirects are never followed and count as failures):
#   index    GET $BASE/                     200; links to privacy-policy.html and support.html
#   privacy  GET $BASE/privacy-policy.html  200; has "Data Retention" and "push token";
#                                           not "user accounts or databases" and not the
#                                           pre-1.1.0 "keep your home screen widget up to date"
#   support  GET $BASE/support.html         200; has the contact mailto and a policy link;
#                                           not "in the background when iOS allows it"
#   All three must not contain "tool for Crossover employees" (pre-build-18 footer/intro that
#   contradicted the "Not affiliated with or endorsed by Crossover" disclaimer).
#
# On a non-200, the URL is re-requested with ?cb=<epoch>. A 200 there means the Pages CDN
# is serving a cached response; otherwise Pages is probably not enabled/deployed (OPS O2).
#
# Exit: 0 all checks pass | 1 any check fails | 2 usage error.
# Portable to macOS /bin/bash 3.2 and bash 5; needs only curl, grep, mktemp and date.

set -u

DEFAULT_BASE="https://jaime-alvarez-trilogy.github.io/hourglass-app"

usage() {
  cat >&2 <<'EOF'
Usage: scripts/check-legal-pages.sh [BASE_URL]
  BASE_URL  default https://jaime-alvarez-trilogy.github.io/hourglass-app
            one trailing "/" is stripped
EOF
}

if [ "$#" -gt 1 ]; then
  usage
  exit 2
fi

BASE="${1:-$DEFAULT_BASE}"
BASE="${BASE%/}"

tmp_root="${TMPDIR:-/tmp}"
tmpdir=$(mktemp -d "${tmp_root%/}/check-legal-pages.XXXXXX") || {
  echo "check-legal-pages: cannot create a temporary directory" >&2
  exit 1
}
trap 'rm -rf "$tmpdir"' EXIT

failures=0
o2_hint_printed=0

# fetch URL OUTFILE — prints the HTTP status code; "000" when curl gets no complete response
# (connection refused, DNS failure, timeout, or a transfer cut off after the status line, where
# curl still reports the status it saw but exits non-zero). Never aborts the script.
fetch() {
  local code
  if ! code=$(curl -sS --max-time 20 -o "$2" -w '%{http_code}' "$1"); then
    code="000"
  fi
  [ -n "$code" ] || code="000"
  printf '%s' "$code"
}

# hint URL CODE — explain a non-200 response on stderr.
hint() {
  local url=$1 code=$2 probe_code
  probe_code=$(fetch "$url?cb=$(date +%s)" "$tmpdir/probe.body")
  if [ "$probe_code" = "200" ]; then
    echo "HINT: $url is served by origin (cache-busted request returned 200) but the CDN returned $code; it is cached. Re-run in ~10 minutes." >&2
  elif [ "$o2_hint_printed" -eq 0 ]; then
    o2_hint_printed=1
    cat >&2 <<'EOF'
HINT: GitHub Pages may not be enabled or deployed yet. Run OPS O2:
  gh api -X POST repos/jaime-alvarez-trilogy/hourglass-app/pages -f build_type=workflow
  gh workflow run pages.yml --ref main
EOF
  fi
}

# check NAME URL RULE... — RULE is "+text" (body must contain text) or "-text" (must not).
# Prints exactly one PASS/FAIL line.
check() {
  local name=$1 url=$2 body code rule text
  shift 2
  body="$tmpdir/$name.body"
  code=$(fetch "$url" "$body")
  if [ "$code" != "200" ]; then
    echo "FAIL $name: HTTP $code"
    failures=$((failures + 1))
    hint "$url" "$code"
    return
  fi
  for rule in "$@"; do
    text=${rule#?}
    case $rule in
      +*)
        if ! grep -qF -- "$text" "$body"; then
          echo "FAIL $name: missing \"$text\""
          failures=$((failures + 1))
          return
        fi
        ;;
      -*)
        if grep -qF -- "$text" "$body"; then
          echo "FAIL $name: contains forbidden \"$text\""
          failures=$((failures + 1))
          return
        fi
        ;;
    esac
  done
  echo "PASS $name"
}

check index "$BASE/" \
  '+href="privacy-policy.html"' \
  '+href="support.html"' \
  '-tool for Crossover employees'
check privacy "$BASE/privacy-policy.html" \
  '+Data Retention' \
  '+push token' \
  '-user accounts or databases' \
  '-to keep your home screen widget up to date' \
  '-tool for Crossover employees'
check support "$BASE/support.html" \
  '+mailto:jaime.alvarez@trilogy.com' \
  '+href="privacy-policy.html"' \
  '-in the background when iOS allows it' \
  '-tool for Crossover employees'

if [ "$failures" -eq 0 ]; then
  echo "All legal page checks passed for $BASE"
  exit 0
fi
echo "$failures legal page check(s) failed for $BASE"
exit 1
