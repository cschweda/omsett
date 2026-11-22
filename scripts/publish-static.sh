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
if [ -z "${SKIP_BUILD:-}" ]; then
  echo "Building with node $(node --version), pnpm $(pnpm --version)"
  pnpm install --frozen-lockfile
  pnpm build
fi

mkdir -p "$release"
cp -R apps/web/.output/public "$release/public"
cp apps/web/.output/headers.nginx "$release/headers.nginx"

# Tell the operator if the headers changed: that, and only that, needs an nginx reload.
if [ -e "$site/live/headers.nginx" ] && ! cmp -s "$site/live/headers.nginx" "$release/headers.nginx"; then
  echo "NOTE: headers.nginx changed. Reload nginx for the new headers to take effect."
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
