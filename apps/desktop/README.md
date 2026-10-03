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

`pnpm run build` here compiles the main process and then copies
`apps/web/.next/standalone` — plus `.next/static` and `public`, which Next
leaves out because a deployment serves them from a CDN and a desktop app has
no CDN — into `apps/desktop/web/`. That folder is generated and git-ignored.

`STILLPOINT_API_URL` is passed through to the bundled server as
`NEXT_PUBLIC_API_URL`, for pointing a build at something other than
`http://localhost:8000/api`.

## Security

The renderer is sandboxed, has no Node integration and no preload — it has
nothing to say to the main process, so it is given no way to say it. Navigation
is pinned to the app's own origin and anything else is handed to the system
browser. This matters more here than in most apps: the page in this window is
signed in to somebody's journal.

The bundled server binds to `127.0.0.1` on a port the operating system
allocates. It is for this machine.

## What is verified, and what is not

`pnpm run build` and `pnpm run typecheck` run in CI. The app has been launched
under Xvfb in the development container, which proves the server starts, the
window opens and the app renders.

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

- **The standalone build needs `.next/static` copied in.** Without it the
  window renders unstyled HTML and every chunk 404s. `scripts/bundle-web.mjs`
  does it; if you change how the web app is built, check this still holds.
- **`outputFileTracingRoot`** in `apps/web/next.config.ts` must stay pointed at
  the workspace root, or the trace stops at `apps/web` and misses the
  `@stillpoint/*` symlinks pnpm leaves in `node_modules`.
- **The copy dereferences symlinks**, because pnpm's point at a store that is
  not on the user's machine.
- **Electron's binary is not downloaded by default.** pnpm 10 does not run a
  dependency's install scripts unless it is listed under
  `onlyBuiltDependencies` in `pnpm-workspace.yaml`, which Electron is.
