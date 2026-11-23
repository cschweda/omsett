#!/usr/bin/env bash
# Builds the site and publishes it without ever serving a half-written build.
#
#     scripts/publish-static.sh [SITE_DIR]
#     SKIP_BUILD=1 scripts/publish-static.sh [SITE_DIR]    publish the build already in .output
#
# `nuxt generate` empties its output directory before it fills it, so a web server pointed
# straight at that directory serves nothing for the length of a build. This copies each finished
# build to SITE_DIR/releases/<timestamp> and then repoints SITE_DIR/live at it in one atomic
# step. The web server's root is SITE_DIR/live/public.
#
# SITE_DIR defaults to the repository root (how a Laravel Forge site is laid out). The last
# three releases are kept, so a bad deploy is undone by repointing the link.
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
site=${1:-$repo}
stamp=$(date +%Y%m%dT%H%M%S)
release="$site/releases/$stamp"

cd "$repo"

# Use the Node version named in .nvmrc when nvm is installed; otherwise whatever `node` is.
# nvm only changes this shell, so other sites on the same server keep the Node they run on.
NVM_DIR=${NVM_DIR:-$HOME/.nvm}
if [ -s "$NVM_DIR/nvm.sh" ]; then
  set +eu # nvm is not written for strict mode
  . "$NVM_DIR/nvm.sh"
  nvm install >/dev/null && nvm use >/dev/null # both read .nvmrc; install is a no-op when present
  switched=$?
  set -eu
  [ "$switched" -eq 0 ] || { echo "nvm could not switch to the version in .nvmrc"; exit 1; }
  # pnpm comes from corepack, which is per Node version.
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  corepack enable >/dev/null 2>&1 || true
fi
# What this copy of Omsett is set up to do beyond converting: count visits, offer an
# accessibility check. Read from site.env, which is in the repository, and then from the
# server's own .env, where Forge keeps a site's settings, so that a line there wins. Only
# Omsett's own settings are read from either, and only lines that are plainly one.
for settings in site.env .env; do
  [ -f "$settings" ] || continue
  while IFS= read -r line; do
    case "$line" in
      OMSETT_[A-Z_]*=*)
        name="${line%%=*}"
        value="${line#*=}"
        value="${value%\"}"; value="${value#\"}"
        case "$value" in *[!A-Za-z0-9.:/_-]*) echo "Ignoring $name in $settings: its value is not a plain name or address"; continue ;; esac
        export "$name=$value"
        ;;
    esac
  done < "$settings"
done
if [ -z "${SKIP_BUILD:-}" ]; then
  echo "Building with node $(node --version), pnpm $(pnpm --version)"
  pnpm install --frozen-lockfile
  pnpm build
fi

mkdir -p "$release"
cp -R apps/web/.output/public "$release/public"
cp apps/web/.output/headers.nginx "$release/headers.nginx"

# The headers are read by nginx when it starts, not on each request. If they changed, nginx
# has to be reloaded or it goes on sending the old ones: an audit found the live site without
# a header that had been in this file for a day. Remembered here, acted on after the switch.
headers_changed=""
if [ -e "$site/live/headers.nginx" ] && ! cmp -s "$site/live/headers.nginx" "$release/headers.nginx"; then
  headers_changed=1
fi

# Switch to the new release. `live` is a link to a directory, and a plain `mv` onto such a link
# moves the new link INSIDE the old release instead of replacing it. GNU mv needs -T to rename
# over the link, which is atomic. BSD mv (macOS) has no -T, so there the link is replaced with
# ln -sfn, which is not atomic but is only ever used on a developer's machine.
ln -sfn "releases/$stamp" "$site/live.next"
if ! mv -Tf "$site/live.next" "$site/live" 2>/dev/null; then
  rm -f "$site/live.next"
  ln -sfn "releases/$stamp" "$site/live"
fi

# Never report success, or prune anything, unless the site really is the new release.
if [ "$(readlink "$site/live")" != "releases/$stamp" ] || [ ! -f "$site/live/public/index.html" ]; then
  echo "ERROR: $site/live does not point at the new release. Nothing was pruned."
  exit 1
fi

# Keep the newest three releases, and never the one that is live.
for old in $(ls -1d "$site"/releases/*/ 2>/dev/null | sort -r | tail -n +4); do
  [ "$(cd "$old" && pwd -P)" = "$(cd "$site/live" && pwd -P)" ] || rm -rf "$old"
done

echo "Published $stamp → $site/live"

if [ -n "$headers_changed" ]; then
  # Forge lets its user reload nginx without a password. Where that is not so, say it loudly.
  if command -v sudo >/dev/null 2>&1 && sudo -n service nginx reload >/dev/null 2>&1; then
    echo "headers.nginx changed: nginx reloaded."
  else
    echo "=================================================================="
    echo "WARNING: headers.nginx changed and nginx could NOT be reloaded here."
    echo "The site is still sending the OLD security headers. Run, as root:"
    echo "    nginx -t && service nginx reload"
    echo "(In Forge: the site's nginx 'Restart' or 'Reload' button does the same.)"
    echo "then check with:  scripts/check-live-headers.sh https://your.site"
    echo "=================================================================="
  fi
fi
