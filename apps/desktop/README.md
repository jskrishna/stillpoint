# @stillpoint/desktop

Stillpoint for macOS, Windows and Linux. An Electron shell around the Next.js
app, which is what the designs call for: the same build the browser gets,
rendered in a window.

Read the repository root `CLAUDE.md` first.

## It is a shell, and that is the point

Nothing about the product is implemented here. There is no second session
screen, no second copy of a safety rule, no API client. The main process starts
the web app's standalone server on a loopback port and points a window at it.
What this directory adds is the handful of things a window can do and a browser
tab cannot:

- a window that remembers its size and position;
- a tray with "Start a session";
- a global shortcut, <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, which
  is the point of a desktop app for something you reach for when you are upset;
- a menu that goes to the app's own screens rather than to a website.

## Running it

```bash
# Against a running `next dev` or `next start`, with no bundling:
STILLPOINT_DEV_URL=http://localhost:3000 pnpm --filter @stillpoint/desktop run start

# Or build the bundle first, and run what a user would run:
pnpm run build                                    # at the root: packages, then web, then this
pnpm --filter @stillpoint/desktop run start
```

`pnpm run build` here compiles the main process, builds the web app in
standalone mode, and copies `apps/web/.next-standalone/standalone` — plus that
build's `static/` and `public/`, which Next leaves out because a deployment
serves them from a CDN and a desktop app has no CDN — into
`apps/desktop/web/`. That folder is generated and git-ignored.

The standalone build is its **own** build, into its own directory, and both
halves are deliberate. `next start` is not supported alongside
`output: 'standalone'` — Next warns at every boot — and `next start` is what
local development and the end-to-end job use, so standalone is opt-in behind
`NEXT_OUTPUT=standalone`. And two builds of one app into one `.next` means
whichever ran last decides what `next start` finds, which is why this one
writes `.next-standalone` instead.

The API's address is fixed **when the web app is built**, not when the shell
runs. `NEXT_PUBLIC_*` is inlined into the client bundle and every route here is
statically prerendered, so the renderer calls whatever the build was given:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com/api pnpm --filter @stillpoint/desktop run build
```

There used to be a `STILLPOINT_API_URL` that the shell passed to the bundled
server at launch. It did nothing, for the reason above, and it has been removed
rather than left looking like a setting. The Docker image has the same property
and `deploy/README.md` has always said so.

It matters a little more now: the build also writes the API's origin into the
app's `connect-src`, so a build pointed at one API cannot talk to another even
if something tried.

## Security

The renderer is sandboxed, has no Node integration and no preload — it has
nothing to say to the main process, so it is given no way to say it. Navigation
is pinned to the app's own origin and anything else is handed to the system
browser. This matters more here than in most apps: the page in this window is
signed in to somebody's journal.

**The pin is an origin comparison, and it used to be a string prefix.**
`src/navigation.ts` holds both decisions and says why. The short version:
`url.startsWith(origin)` with the origin `http://127.0.0.1:8735` allowed
`http://127.0.0.1:8735@evil.example/phish`, whose real host is `evil.example` —
everything before an `@` is userinfo. That would have navigated the window that
is signed in to somebody's journal, with this app's frame around it. A pin a
string can step around is not a pin. `src/navigation.test.ts` has the case;
five of its nine tests go red if the prefix check comes back.

**And `shell.openExternal` is given four schemes, not whatever it is handed.**
The renderer is sandboxed, but the content policy keeps `'unsafe-inline'` and
`apps/web/next.config.ts` is plain that injected inline script still runs — so
a payload in the page could `window.open('file:///…')`, or any scheme another
application has registered, and the main process passed it straight to the
operating system. `http:`, `https:`, `mailto:` and `tel:` go through; `tel:`
because the safety screen's helplines are `tel:` links and the system is what
opens the dialler.

The bundled server binds to `127.0.0.1` on port **8735**, fixed. This README
said the operating system allocated it, which is the thing the fixed port was
chosen against: the port is part of the origin, the origin is what the browser
keys `localStorage` by, and a new port each launch signs everybody out every
launch. `src/server.ts` has the reasoning. It is for this machine.

## What is verified, and what is not

`pnpm run build` and `pnpm run typecheck` run in CI. The app has been launched
under Xvfb in the development container, which proves the server starts, the
window opens and the app renders — re-verified after the standalone build moved
to its own `distDir`, which is exactly the sort of change that breaks this and
nothing else.

**The app surface has no desktop layout.** `apps/web`'s `/app` caps its content
column at 430px and puts the navigation along the bottom — it is the phone
design, which is the only one the artifacts give for these screens. So this
window opens narrow: that is the designed layout at its designed width, not a
desktop one. The admin console, the coach portal and the marketing site do have
desktop layouts, and they render as intended. Supplying a desktop layout for
`/app` is a design decision, not a CSS change, and it belongs in `apps/web`
when it arrives — this shell will pick it up with no change here.

**It has not been packaged or run on macOS or Windows.** There is no installer
yet — no `electron-builder`, no code signing, no notarisation, no auto-update —
and each of those is a decision with a cost attached (a developer certificate,
an update server) rather than a line of configuration. The tray icon, the
global shortcut and the window-position file have only ever run on Linux.

## Things that will bite

- **A stale `SingletonLock` stops the app opening, and used to do it in
  silence.** One window is deliberate — two copies would mean two servers and
  two ports for one person's journal — but when the lock is left behind by an
  instance that crashed rather than quit, there is no first copy to raise:
  `second-instance` never fires, and the process exits with a zero status and
  no output. It logs a line naming the file and the directory now. It is not
  recovered from automatically, because "assume the other copy is dead and take
  the lock" is how two copies end up serving one journal on two ports. The file
  is `SingletonLock` in the user-data directory; an hour went into finding that
  the first time.
- **The standalone build needs its `static/` copied in.** Without it the
  window renders unstyled HTML and every chunk 404s. `scripts/bundle-web.mjs`
  does it; if you change how the web app is built, check this still holds.
  Note the path inside the bundle is `.next-standalone/static`, because that
  is the `distDir` the standalone build uses.
- **`outputFileTracingRoot`** in `apps/web/next.config.ts` must stay pointed at
  the workspace root, or the trace stops at `apps/web` and misses the
  `@stillpoint/*` symlinks pnpm leaves in `node_modules`.
- **The copy dereferences symlinks**, because pnpm's point at a store that is
  not on the user's machine.
- **Electron's binary is not downloaded by default.** pnpm 10 does not run a
  dependency's install scripts unless it is listed under
  `onlyBuiltDependencies` in `pnpm-workspace.yaml`, which Electron is.
