import { join } from 'node:path';
import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  dialog,
  globalShortcut,
  nativeImage,
  shell,
} from 'electron';
import { PortTakenError, haveBundledWeb, startWeb, type RunningServer } from './server.js';
import { DEFAULT_STATE, MINIMUM, readState, writeState } from './window-state.js';
import { mayOpenExternally, sameOrigin } from './navigation.js';

/**
 * Stillpoint on the desktop.
 *
 * A shell, and deliberately only a shell: it renders the Next.js app from the
 * same build the browser gets, so nothing about the product exists twice. What
 * it adds is what a desktop can do and a browser tab cannot — a window that
 * remembers itself, a tray, and one keystroke from anywhere to the thing this
 * product is for.
 *
 * ## Security
 *
 * The renderer runs sandboxed with no Node and no preload: it has nothing to
 * talk to the main process about, so it is given no way to. Navigation is
 * pinned to the app's own origin and anything else is handed to the system
 * browser — which matters more here than in most apps, because the page this
 * window shows is signed in to somebody's journal.
 */

/** Set to point the shell at a running `next dev`/`next start`. */
const DEV_URL = process.env['STILLPOINT_DEV_URL'];

const ACCELERATOR = 'CommandOrControl+Shift+S';

/**
 * Where the window opens.
 *
 * The app, not the marketing site. Somebody who has installed this has already
 * been sold to, and `/app` sends them to sign in by itself if they are not
 * signed in — so this is the right answer in both cases.
 */
const START_PATH = '/app';

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let web: RunningServer | null = null;
let origin = '';

function icon(name: string) {
  return nativeImage.createFromPath(join(import.meta.dirname, '..', 'assets', name));
}

function show(): void {
  if (window === null) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/**
 * Opens a session.
 *
 * `/session` is a route of the web app, so this is a navigation and not a
 * command: there is no second way to start a session, and the server still
 * decides whether the plan allows one.
 */
function startSession(): void {
  show();
  void window?.loadURL(`${origin}/session`);
}

function createWindow(): BrowserWindow {
  const userData = app.getPath('userData');
  const state = readState(userData);

  const created = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x === undefined ? {} : { x: state.x }),
    ...(state.y === undefined ? {} : { y: state.y }),
    minWidth: MINIMUM.width,
    minHeight: MINIMUM.height,
    // The cream from the Warm & Clear palette, so the frame does not flash
    // white before the page paints. Hard-coded rather than imported: the main
    // process has no colour scheme to ask, and this is one value.
    backgroundColor: '#FBF4EC',
    title: 'Stillpoint',
    icon: icon('icon.png'),
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });

  if (state.maximized) created.maximize();

  created.once('ready-to-show', () => {
    created.show();
  });

  const remember = () => {
    writeState(userData, created);
  };
  created.on('resize', remember);
  created.on('move', remember);
  created.on('close', remember);

  // Anything that is not this app opens in the system browser. A helpline's
  // `tel:` link is handed to the system too, which is what opens the dialler.
  //
  // Both decisions are in `navigation.ts`, which explains why neither is a
  // string comparison any more: the pin used to be `url.startsWith(origin)`,
  // and `http://127.0.0.1:8735@evil.example/` starts with this app's origin
  // and resolves to `evil.example`.
  created.webContents.setWindowOpenHandler(({ url }) => {
    if (mayOpenExternally(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  created.webContents.on('will-navigate', (event, url) => {
    if (sameOrigin(url, origin)) return;

    event.preventDefault();
    // Not opened at all if the system has no business being handed it. A URL
    // this refuses is one nothing in this product produces.
    if (mayOpenExternally(url)) void shell.openExternal(url);
  });

  created.on('closed', () => {
    window = null;
  });

  return created;
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'Session',
        submenu: [
          { label: 'Start a session', accelerator: ACCELERATOR, click: startSession },
          { type: 'separator' as const },
          {
            label: 'Journal',
            click: () => {
              show();
              void window?.loadURL(`${origin}/app/journal`);
            },
          },
          {
            label: 'Settings',
            click: () => {
              show();
              void window?.loadURL(`${origin}/app/settings`);
            },
          },
          { type: 'separator' as const },
          isMac ? { role: 'close' as const } : { role: 'quit' as const },
        ],
      },
      { role: 'editMenu' as const },
      {
        label: 'View',
        submenu: [
          { role: 'reload' as const },
          { role: 'resetZoom' as const },
          { role: 'zoomIn' as const },
          { role: 'zoomOut' as const },
          { type: 'separator' as const },
          { role: 'togglefullscreen' as const },
        ],
      },
      { role: 'windowMenu' as const },
      {
        role: 'help' as const,
        submenu: [
          {
            /*
             * The only thing in this menu worth a person's time when they are
             * upset, and it goes to the app's own screen rather than a website.
             *
             * **That screen had nothing on it until recently**, which made this
             * item the worst kind of promise: `/app/settings` listed voice
             * preferences, coach sharing and two delete buttons, and no crisis
             * number anywhere. The phone's settings screen has had a section
             * headed exactly "If you need someone now" all along; the web's
             * had not, so this label was written against a screen that only
             * existed on the other surface. `apps/web` renders
             * `helplinesFor(profile.country)` there now, as `tel:` links —
             * which is why `tel:` is one of the four schemes `openExternal`
             * passes through.
             */
            label: 'If you need someone now',
            click: () => {
              show();
              void window?.loadURL(`${origin}/app/settings`);
            },
          },
        ],
      },
    ]),
  );
}

function buildTray(): void {
  try {
    tray = new Tray(icon('tray.png'));
    tray.setToolTip('Stillpoint');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Start a session', accelerator: ACCELERATOR, click: startSession },
        { label: 'Open Stillpoint', click: show },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' },
      ]),
    );
    tray.on('click', show);
  } catch {
    // A desktop with no system tray is a desktop without this shortcut, not a
    // reason to refuse to start.
  }
}

/**
 * Startup went wrong in a way nothing anticipated.
 *
 * Logged as well as shown: the dialog is what a person sees, and stderr is
 * what survives into a terminal, a log file or somebody's bug report. The
 * known failures — a taken port, a shell with no bundle — say something
 * specific further down; this is the catch-all behind them.
 */
function cannotStart(e: unknown): void {
  console.error('[stillpoint] could not start:', e);
  try {
    dialog.showErrorBox('Stillpoint could not start', String(e));
  } catch {
    // No display to show it on. The line above is then the whole report.
  }
  app.quit();
}

async function boot(): Promise<void> {
  const root = join(import.meta.dirname, '..');

  if (DEV_URL !== undefined && DEV_URL !== '') {
    origin = DEV_URL;
  } else if (haveBundledWeb(root)) {
    try {
      web = await startWeb(root);
    } catch (e: unknown) {
      // Named, because the fix is specific and the user can act on it. Moving
      // to another port by itself would sign them out — see `server.ts`.
      dialog.showErrorBox(
        'Stillpoint is already running, or something else has its port',
        e instanceof PortTakenError
          ? `Stillpoint uses port ${String(e.port)} on this machine.\n\n` +
              'Close whatever is using it, or set STILLPOINT_PORT to another one — ' +
              'but note that changing it signs you out, because the port is part of ' +
              'the address this app stores its session against.'
          : String(e),
      );
      app.quit();
      return;
    }
    origin = web.url;
  } else {
    // Said plainly, because the cause is always the same and the fix is one
    // command. Guessing at a URL would start a window showing nothing.
    dialog.showErrorBox(
      'Stillpoint is not built',
      'The web app has not been bundled into this shell yet.\n\n' +
        'Run `pnpm --filter @stillpoint/desktop run build`, or set ' +
        'STILLPOINT_DEV_URL to a running copy of the web app.',
    );
    app.quit();
    return;
  }

  buildMenu();
  window = createWindow();
  await window.loadURL(`${origin}${START_PATH}`);
  buildTray();

  // Registering can fail when another app already holds the combination.
  // That is a shortcut the user does not get, not a failure to start.
  globalShortcut.register(ACCELERATOR, startSession);
}

// One window, and a second launch raises it rather than starting again — two
// copies would mean two servers and two ports for one person's journal.
//
// The quiet failure here cost an hour to find, so it says something now. When
// the lock is **stale** — left behind by an instance that crashed rather than
// quit — there is no first copy to raise: `second-instance` never fires
// because nothing is listening for it, and this process exits with a zero
// status and no output. The app simply does not open, for as long as the file
// is there, and the file is `SingletonLock` in the user-data directory, which
// nobody would think to look for.
//
// Not recovered from automatically, because "assume the other instance is
// dead and take the lock" is how two copies end up serving one person's
// journal on two ports. A line in the log is the proportionate answer: it
// turns an app that does nothing into an app that does nothing *and says
// why*.
if (!app.requestSingleInstanceLock()) {
  console.error(
    '[stillpoint] another copy holds the single-instance lock, so this one is ' +
      'exiting. If no other copy is running, the lock is stale: remove ' +
      "`SingletonLock` from this app's user-data directory " +
      `(${app.getPath('userData')}).`,
  );
  app.quit();
} else {
  app.on('second-instance', show);

  // `.catch`, and it matters more than it looks. This used to be
  // `.then(() => boot(), () => undefined)`, where the second argument handles
  // `whenReady()` rejecting and **not** `boot()` rejecting — so anything that
  // went wrong starting up was an unhandled rejection: the app exited with a
  // zero status, no dialog, and nothing in the log. The one thing worse than
  // failing to start is failing to start silently.
  app
    .whenReady()
    .then(() => boot())
    .catch(cannotStart);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void boot();
    else show();
  });

  app.on('window-all-closed', () => {
    // macOS keeps the app running with no windows; everywhere else, closing
    // the window means closing the app — and the bundled server with it.
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    web?.stop();
  });
}

export { DEFAULT_STATE };
