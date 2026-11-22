# Build context is the repository root:  docker build -f apps/web/Dockerfile .

# The output is static files, the same on every architecture, so build on the builder's own.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .nvmrc ./
COPY packages ./packages
COPY fixtures ./fixtures
COPY apps/web ./apps/web
# Only the web app and the workspace packages it uses; the test tooling stays out of the image.
RUN pnpm install --frozen-lockfile --filter "web..."
RUN pnpm --filter web generate && pnpm --filter web write-headers

FROM caddy:2-alpine
# The stock binary carries a file capability (bind low ports). With every capability dropped,
# the kernel refuses to exec it as a non-root user, so the capability is removed: Caddy listens
# on 8080 and needs none.
RUN apk add --no-cache libcap \
  && setcap -r /usr/bin/caddy \
  && apk del libcap \
  && adduser -D -H -u 10001 omsett
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/.output/headers.caddy /etc/caddy/headers.caddy
COPY --from=build /repo/apps/web/.output/public /srv
ENV OMSETT_SITE_ADDRESS=":8080" \
    OMSETT_SERVER="" \
    XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/config
USER 10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
