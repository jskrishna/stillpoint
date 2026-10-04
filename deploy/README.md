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
- **And the thing that terminates it has to be named in `TRUSTED_PROXIES`.**
  This one is easy to miss because nothing visibly breaks. The API generates no
  URLs — the reset link and the invitation link both come from
  `APP_FRONTEND_URL` — so an untrusted proxy costs nothing there. What it costs
  is the rate limiters: two of the three `guessable` buckets key on the
  caller's address, and behind a terminator that is the terminator's address
  for every request. So `Limit::perMinute(60)->by('ip:…')` stops being a
  ceiling on one machine and becomes **sixty requests a minute for the whole
  product** across sign-in, registration, password recovery and opening an
  invitation; and the tight `6`-a-minute bucket collapses to six per account
  from anywhere, so anybody who knows an address can keep that person out of
  their own journal indefinitely. An address is not a secret — a coach types a
  client's into an invitation. `config/trustedproxy.php` has the argument and
  `TrustedProxiesTest` pins both halves; the default trusts nothing, which is
  correct only while nginx is the edge.
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

## Does it serve a session?

```bash
node deploy/smoke.mjs                              # the local stack
node deploy/smoke.mjs https://api.example.com/api  # a real API
node deploy/smoke.mjs https://api.example.com/api https://example.com
```

Plain HTTP, no browser, no workspace install — so it runs against a real
deployment from a laptop. It registers an account, checks that a session is
refused before consent, consents, starts a session, takes a turn, and then says
something that must stop the session and asserts the **server** ended it, sent
helplines, told the client nothing about which rule fired, refuses another turn
with a 409, and wrote no journal row. Then it erases the account through the
same guarded route a user would, so a pass leaves the deployment as it found it.

It also checks the **headers on the API's own origin** — a content policy of
`default-src 'none'`, `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, and no
`X-Powered-By`. Those are set by `App\Http\Middleware\SecurityHeaders` and
pinned by `ApiOriginIsLockedDownTest`, so why check them again over HTTP: a
feature test cannot see a proxy, a terminator or a CDN stripping a response
header, and a header stripped in production is missing exactly where it
matters. Three of them used to live in `nginx.conf` and only there, which meant
every other way of running the app answered with none of them.

**Give it the web origin as well.** Plain `fetch` with no `Origin` header is
not a browser, and so is never subject to CORS or to a content policy — which
means everything above can pass against a stack nobody can actually use.
Measured: with `CORS_ALLOWED_ORIGINS` naming a different deployment entirely,
the API still answered 401, the web app still answered 200, and a whole session
still ran end to end. A person opening that deployment gets a screen where
every request is blocked.

With the origin, it checks the two things fixed at build or boot rather than at
request time, and each failure names its own fix:

- **which API the web app was built to call.** `apps/web/next.config.ts` builds
  the policy's `connect-src` from the same `NEXT_PUBLIC_API_URL` the client
  reads, so the served `Content-Security-Policy` says it outright and there is
  no bundle to parse. A mismatch is the one thing configuration cannot fix:
  rebuild the image.
- **whether the API lets that origin call it.** A preflight is exactly what a
  browser asks first, and the answer is a header. A mismatch is one line of
  `CORS_ALLOWED_ORIGINS`.

Left out, the local default is tried and **skipped with a note** if nothing is
there, because the point of this script is that it runs when all you have is an
API URL.

Run it after standing a deployment up, and after changing anything in here. The
CI `docker` job runs it against the composed stack on every push, which is what
moves that job from "the images come up" to "the stack serves a session".

It reports **step 2 having no question** as a note rather than a failure, and
that is correct: production publishes no protocol version by itself, so a fresh
stack has only the questions the designs specify. Publish one at
`/admin/protocol` — see item 4 in `LAUNCH.md` — or the guide stops talking
after step 1.

It does not make an admin or a coach, because neither can be made through the
API on purpose: `role` is not fillable. A smoke test that needed one would need
a shell on the server, and this is the check you run when you have a URL.

## Verified, and not

The Dockerfiles, the compose file and the nginx configuration are built in CI
(the `docker` job), the images are known to come up, the migrations are known
to run against the MySQL the compose file starts, and the stack is known to
serve a session and stop one — see above. **It has not been run against real
traffic**, nobody has restored a backup through it, and the TLS and mail gaps
above are real. Treat a green build as "this will start and work", not as "this
is ready".
