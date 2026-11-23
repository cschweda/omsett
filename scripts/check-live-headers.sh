#!/usr/bin/env bash
# Checks that a live copy of Omsett sends the security headers its build says it should.
#
#     scripts/check-live-headers.sh https://omsett.com [path/to/headers.nginx]
#
# The headers are in a file nginx reads only when it starts, so a deploy can change them and
# the site go on sending the old ones until nginx is reloaded. This asks the site itself.
# It makes three plain requests (the page twice, a worker script once) and changes nothing.
set -eu
url="${1:?usage: check-live-headers.sh https://site [headers.nginx]}"
cd "$(dirname "$0")/.."
file="${2:-apps/web/.output/headers.nginx}"
[ -f "$file" ] || { echo "No $file: build first, or give the path to the live headers.nginx"; exit 2; }

failed=0
# Every header named before the first "location" applies to every answer.
want=$(awk '/^location/ { exit } /^add_header/ { print $2 }' "$file" | sort -u)
worker=$(curl -fsS "$url/" | grep -o '/_nuxt/workers/[^"]*\.js' | head -1 || true)
check() {
  got=$(curl -sS -o /dev/null -D - "$1" | tr -d '\r' | tr 'A-Z' 'a-z')
  for name in $2; do
    lower=$(printf '%s' "$name" | tr 'A-Z' 'a-z')
    if printf '%s\n' "$got" | grep -q "^$lower:"; then echo "  ok       $name"; else echo "  MISSING  $name"; failed=1; fi
  done
}
echo "$url/"
check "$url/" "$want Cache-Control"
if [ -n "$worker" ]; then
  echo "$url$worker (a worker)"
  check "$url$worker" "$want Content-Security-Policy"
else
  echo "No worker script found in the page."; failed=1
fi
[ "$failed" -eq 0 ] && echo "All headers present." || { echo "Some headers are missing: reload nginx (nginx -t && service nginx reload)."; exit 1; }
