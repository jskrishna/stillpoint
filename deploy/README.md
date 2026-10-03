# Running Stillpoint

Four containers — MySQL, PHP-FPM, nginx, and the Next.js app — defined in
`docker-compose.yml` at the repository root.

```bash
cp deploy/.env.example .env
$EDITOR .env                  # APP_KEY and the two passwords are not optional
docker compose up --build
docker compose exec api php artisan migrate --force
docker compose exec api php artisan db:seed --force   # the demo accounts
```

The web app is then on <http://localhost:3000> and the API on
<http://localhost:8000>.

To generate the key before the first run:

```bash
docker compose run --rm api php artisan key:generate --show
```

## APP_KEY is the whole journal

Read this once rather than finding it out.

Every journal entry, every session's content and every safety flag's excerpt is
encrypted at rest with Laravel's `encrypted` cast, which keys off `APP_KEY`.
There is no second copy and no recovery path: **change the key or lose it and
that content is gone — not locked out, gone.** A password reset does not touch
it, which is the only reason offering password reset is safe (see the root
`CLAUDE.md`), and that is exactly because the key is not derived from anyone's
password.

So it belongs wherever the rest of your secrets live, with a copy somewhere that
a single lost laptop does not take with it. Rotating it is not a configuration
change; it is a migration that has to decrypt with the old key and re-encrypt
with the new one, and nothing here does that yet.

## What this is, and what it is not

It is a working deployment, and a way to run the whole product without a PHP
toolchain on your machine. It is not a production topology. Before this is in
front of real people:

- **The database needs to be somewhere it is backed up**, not in a Docker
  volume. Encrypted columns cannot be reconstructed from anywhere else.
- **TLS terminates somewhere else.** `deploy/nginx.conf` listens on port 80 and
  assumes something in front of it holds the certificate. Bearer tokens over
  plain HTTP are bearer tokens in public.
- **No mail driver is chosen.** `MAIL_MAILER=log` writes password-reset links
  into the container's log instead of sending them, which means that in this
  configuration nobody can actually reset a password. It is the one thing here
  that is deliberately not finished, and it needs a provider decision.
- **There is no queue, no scheduler and no cache store.** Nothing in the
  product needs them yet; `php artisan queue:work` has nothing to do.
- **Sanctum's token mode is in use, and the web client keeps its token in
  `localStorage`.** The weakness is documented at the top of
  `apps/web/src/lib/api.ts`. Cookie mode is the fix, and it is a change to how
  both the API and the web app authenticate — not a deployment setting.

## The images

| Image                     | What it is                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| `deploy/api.Dockerfile`   | PHP 8.3-FPM with the application and its vendor directory         |
| `deploy/nginx.Dockerfile` | nginx serving `public/` and passing PHP to the API container      |
| `deploy/web.Dockerfile`   | Next.js, from the standalone build, with no build tooling left in |

All three build from the repository root, because none of them is only one
directory: the web app consumes `packages/*` through the workspace, and the
nginx image needs the API's `public/`.

Two things in there are easy to break:

- **The web runtime copies `.next/static` and `public` in by hand.** Next leaves
  them out of the standalone output because a deployment usually serves them
  from a CDN. Without them every stylesheet and chunk 404s and the app renders
  as unstyled HTML. `apps/desktop/scripts/bundle-web.mjs` has the same two
  lines for the same reason.
- **`NEXT_PUBLIC_API_URL` is fixed when the web image is built**, because the
  browser is what calls the API. Pointing a built image at a different API is
  not possible; rebuild it. That is a property of how Next inlines
  `NEXT_PUBLIC_*`, not a choice made here.

## Verified, and not

The Dockerfiles, the compose file and the nginx configuration are built in CI
(the `docker` job), so they are known to build and the images are known to come
up. **They have not been run against real traffic**, nobody has restored a
backup through them, and the TLS and mail gaps above are real. Treat a green
build as "this will start", not as "this is ready".
