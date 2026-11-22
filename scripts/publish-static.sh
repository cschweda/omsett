#!/bin/sh
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
if [ -z "${SKIP_BUILD:-}" ]; then
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

# Atomic swap: build the new link beside the old one, then rename over it.
ln -sfn "releases/$stamp" "$site/live.next"
mv -f "$site/live.next" "$site/live" 2>/dev/null || { rm -rf "$site/live"; mv "$site/live.next" "$site/live"; }

# Keep the newest three releases.
ls -1d "$site"/releases/*/ 2>/dev/null | sort -r | tail -n +4 | xargs rm -rf 2>/dev/null || true

echo "Published $stamp → $site/live"
