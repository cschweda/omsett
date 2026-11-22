# Deploying Omsett to the DigitalOcean droplet

Omsett is a static site. On the droplet it is a folder that nginx serves: no Node process, no
PM2, nothing to keep running. It sits beside audit.icjia.app without touching it.

Two things make it more than "point nginx at a folder":

- **The headers.** The app needs a specific set of response headers. Without them the page
  loads and nothing converts. The build writes them as an nginx snippet, and the site's nginx
  config includes it.
- **The swap.** A build empties its output folder before filling it, so nginx must never serve
  that folder directly. `scripts/publish-static.sh` copies each finished build to
  `releases/<timestamp>` and repoints a `live` link at it in one step.

The nginx side of this is tested: CI serves every build through
[`apps/web/nginx/omsett.conf`](../apps/web/nginx/omsett.conf) and runs the conversion tests
against it. The Forge-specific steps below have **not** been run; they are written from how
Forge lays sites out, and step 6 is where to look first if something differs.

## In order

### 1. DNS (DNSimple)

Add `A` records for `omsett.com` and `www.omsett.com` pointing at the droplet's IP address.
Certificates in step 5 need these to resolve first.

### 2. Server prerequisites (once)

SSH in as `forge` and check:

```
node --version        # needs v24
corepack enable       # provides the pnpm version pinned in package.json
pnpm --version        # 10.x
```

The build also works on Node 22 (the first deploy ran on 22.23), with a warning that the project
asks for 24. To build on 24 without touching the system Node that the audit app runs on, install
nvm for the `forge` user:

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
```

Then, before the next deploy, pin nvm's default to the system Node:

```
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm alias default system
```

This matters. The first version nvm installs becomes the default for every new shell, so
without the pin, logging in as `forge` after a deploy would put you on Node 24, and rebuilding
the audit app from that shell would compile it for a Node its running process is not using.
`nvm alias default` should answer `default -> system`, and `node --version` in a fresh login
should still show the system version after a deploy.

`scripts/publish-static.sh` looks for nvm, and when it finds it, installs
and switches to the version in `.nvmrc` for that deploy only. The first line of its output says
which Node it used. Without nvm it uses the system Node.

### 3. Create the site in Forge

- **Domain:** `omsett.com`, with `www.omsett.com` as an alias.
- **Project type:** Static HTML.
- **Repository:** `cschweda/omsett`, branch `main`.
- Under **Advanced settings**:
  - **Web directory:** `/live/public` (the default is `/public`).
  - **Zero downtime deployments:** off. Forge's version gives the site its own `releases` and
    `current` layout; `scripts/publish-static.sh` already builds and then switches a `live` link
    to the new build, and running both would nest one inside the other and change every path
    in this guide.
  - **Root directory** `/`, **Frontend package manager** None, **Push to deploy** on (this is
    the Quick Deploy of step 8), website isolation off.

The site will answer 404 until the first deploy creates `live`.

### 4. Deploy script, then the first deploy

Replace Forge's deploy script with:

```
cd $FORGE_SITE_PATH
git pull origin $FORGE_SITE_BRANCH
scripts/publish-static.sh
```

Press **Deploy Now**. It should end with `Published <timestamp> → …/live`. Do this before
step 6: the nginx config there includes a file that only exists after a build.

### 5. Certificate

In the site's SSL tab, obtain a Let's Encrypt certificate for both names. HTTPS is not optional
here: browsers only allow the multi-threaded WebAssembly the engines use on a secure origin.

### 6. nginx configuration

Edit the site's nginx configuration in Forge. Inside the `server { }` block that listens on 443:

1. Add the include, replacing the path if your site directory differs:

   ```
   include /home/forge/omsett.com/live/headers.nginx;
   ```

2. If Forge's template added its own `add_header X-Frame-Options …` and
   `add_header X-Content-Type-Options …` lines, delete them. The included file sets both, and
   sending each twice with different values is worse than sending it once.

3. Make sure the main location falls back to the app:

   ```
   location / {
       try_files $uri $uri/ /index.html;
   }
   ```

4. Optionally, compress the engines (they shrink by more than half):

   ```
   gzip_types text/css application/javascript application/json application/wasm image/svg+xml;
   ```

Save. Forge tests the configuration and reloads nginx.

### 7. Check it

```
curl -sI https://omsett.com/ | grep -i -E 'cross-origin|x-frame'
```

should show `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. Then open the site, open the browser console, and
type `crossOriginIsolated`. It must say `true`. Convert the sample PNG.

To run the full browser suite against the live site from your own machine:

```
BASE_URL=https://omsett.com pnpm e2e
```

### 8. Push to deploy

With "Push to deploy" on (set when the site was created, or in the site's settings), every push
to `main` runs the deploy script. There is no staging branch
and no cost per deploy.

## Afterwards

- **When the headers change.** `publish-static.sh` prints
  `NOTE: headers.nginx changed. Reload nginx…` when a deploy alters the header file. Reload
  nginx from Forge then. This is rare: the part of the security policy that changes with every
  build lives inside the HTML, not in a header.
- **Rolling back.** The last three builds are kept. To go back one:

  ```
  cd /home/forge/omsett.com && ls releases
  ln -sfn releases/<older-timestamp> live.next && mv -T live.next live
  ```

- **Build load.** A deploy runs a build on the droplet for about a minute. If that ever
  competes with the audit app, the alternative is to build in GitHub Actions and copy
  `apps/web/.output` over; the nginx side stays exactly as it is.
- **A CDN later.** Visitors fetch the engines from this one server. They are cached for a year
  and compressed, so it is fine today. When larger engines arrive, a CDN in front of the droplet
  is the fix; `/engines/*` is already marked immutable for it.

## If something is wrong

| Symptom | Cause |
| --- | --- |
| Page loads; dropping a file says "couldn't be read", converting says "the worker crashed" | The headers are not being sent. Check the `include` line, and that nginx was reloaded |
| `crossOriginIsolated` is `false` | The same, or the site is being opened over plain HTTP |
| nginx will not reload: "open() …/headers.nginx failed" | The include was added before the first deploy. Deploy, then save the config again |
| A `.wasm` file downloads but will not start | nginx is not sending `Content-Type: application/wasm`. Current nginx does by default; on an old one, add `application/wasm wasm;` to `mime.types` |
| 404 on every page | `live` does not exist yet (no deploy has finished), or the web directory is not `/live/public` |
