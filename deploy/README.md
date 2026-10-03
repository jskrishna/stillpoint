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
a single lost laptop does not take with it.

Rotating it is not a configuration change; it is a migration that has to decrypt
with the old key and re-encrypt with the new one. `stillpoint:rotate-key` does
that, and the order of the two steps is the whole safety of it:

```bash
# 1. Old key into APP_PREVIOUS_KEYS, new key into APP_KEY. Laravel reads with
#    either, so the app keeps working and stopping here loses nothing.
docker compose run --rm api php artisan stillpoint:rotate-key --dry-run
docker compose run --rm api php artisan stillpoint:rotate-key

# 2. Only once that reports a clean pass: remove the old key.
```

`--dry-run` reads every encrypted row and writes nothing, so it is also the
answer to "can this deployment still read what is stored" — worth running after
any change that touches `APP_KEY`, before a user finds out instead. A row that
decrypts under no configured key is named and left exactly as it is: the
ciphertext is the only copy of that text, and the command will not overwrite it
with a guess.

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
- **There is no queue.** Nothing in the product needs one yet; `php artisan
queue:work` has nothing to do. There _is_ a scheduler now — the `scheduler`
  service, running the same image as the API — with two tasks:
  `sanctum:prune-expired` daily and `auth:clear-resets` hourly. Both remove rows
  whose contents have already stopped working, and the second matters a little
  more than it sounds: `password_reset_tokens` is keyed by the email address and
  has no foreign key, so without it a dead token sat there holding somebody's
  address.
- **Tokens expire after thirty days** (`SANCTUM_TOKEN_MINUTES`), and there is
  no refresh flow, so that is how often someone signs in again.
  `sanctum:prune-expired` runs daily on the scheduler; expired tokens are
  refused whether or not their row is still there, so this is tidying rather
  than a control.
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

`compose up` now waits for health rather than for containers to exist. nginx is
checked with `/up` through itself, which is the only check here that proves
anything: it answers only if nginx is up, PHP-FPM is reachable over FastCGI and
the application boots. The web app waits for that to pass, because
`depends_on` without a condition used to report everything up while the API was
still booting — and the first person to load the app got an error.

Two things in there are easy to break:

- **The web image builds with `build:standalone`, not `build`.** The standalone
  output is opt-in (`NEXT_OUTPUT=standalone`), because `next start` is not
  supported alongside it, and it lands in `.next-standalone/` rather than
  `.next/`. See `apps/web/next.config.ts`; a `COPY` from the old path fails the
  build rather than producing a broken image, which is the one mercy here.
- **The web runtime copies the standalone build's `static/` and `public` in by
  hand.** Next leaves
  them out of the standalone output because a deployment usually serves them
  from a CDN. Without them every stylesheet and chunk 404s and the app renders
  as unstyled HTML. `apps/desktop/scripts/bundle-web.mjs` has the same two
  lines for the same reason. The build stage also `mkdir -p`s `public/`: a
  `COPY` of a directory that is not there fails with a checksum error that
  mentions nothing relevant, which is how the first red build on this job
  announced itself.
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
