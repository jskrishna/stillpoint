import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

/**
 * The web app, running inside the desktop app.
 *
 * Next's standalone output is a self-contained server with its own
 * `node_modules`; `scripts/bundle-web.mjs` copies it, the static chunks and
 * `public/` into `web/` next to this file at build time. The desktop app runs
 * it with Electron's own Node, so there is no `pnpm`, no `next` binary and no
 * install step on the user's machine.
 *
 * This is a shell: the desktop app renders exactly what the browser does, from
 * the same build. Nothing about the product is implemented twice here, which
 * is the whole reason the designs call for Next.js on both.
 */

/** Where the bundled server lives, relative to the built `dist/`. */
function serverEntry(root: string): string {
  return join(root, 'web', 'server.js');
}

export function haveBundledWeb(root: string): boolean {
  return existsSync(serverEntry(root));
}

/**
 * The port, and why it is fixed.
 *
 * The obvious thing is to ask the operating system for a free port. It is
 * wrong here, and the reason is worth writing down because the symptom is
 * nowhere near the cause: the port is part of the origin, the origin is what
 * the browser keys storage by, and the web app keeps its bearer token in
 * `localStorage`. A different port each launch is a different origin each
 * launch, which is an empty store each launch — the desktop app would sign
 * everybody out every time it started, and nothing in the logs would say why.
 *
 * So the port is fixed, and it is the app's identity. If something else is
 * already on it the app says so and stops, because the alternative — quietly
 * moving to another port — is the sign-out bug with an extra step.
 *
 * It sits in the registered range rather than the dynamic one, where the
 * operating system hands out ephemeral ports and a collision is a matter of
 * time. `STILLPOINT_PORT` moves it for anyone who needs it moved.
 */
export const DEFAULT_PORT = 8735;

export function wantedPort(): number {
  const asked = Number(process.env['STILLPOINT_PORT'] ?? '');
  return Number.isInteger(asked) && asked > 0 && asked < 65536 ? asked : DEFAULT_PORT;
}

/**
 * Whether the port is free.
 *
 * Checked on the loopback address: this server is for this machine, and a
 * desktop app that quietly listens on every interface is a desktop app serving
 * somebody's journal to the coffee shop.
 */
export function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => {
      resolve(false);
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => {
        resolve(true);
      });
    });
  });
}

/** Thrown when the app's one port is already in use. See `wantedPort`. */
export class PortTakenError extends Error {
  constructor(readonly port: number) {
    super(`Port ${String(port)} is already in use.`);
    this.name = 'PortTakenError';
  }
}

export interface RunningServer {
  readonly url: string;
  readonly stop: () => void;
}

/**
 * Starts the bundled server and waits for it to answer.
 *
 * `ELECTRON_RUN_AS_NODE` makes Electron's binary behave as plain Node for the
 * child, which is how the server runs without Node being installed.
 */
export async function startWeb(root: string, apiUrl: string | undefined): Promise<RunningServer> {
  const port = wantedPort();
  if (!(await portIsFree(port))) {
    throw new PortTakenError(port);
  }
  const url = `http://127.0.0.1:${String(port)}`;

  const child: ChildProcess = spawn(process.execPath, [serverEntry(root)], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      ...(apiUrl === undefined ? {} : { NEXT_PUBLIC_API_URL: apiUrl }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[web] ${chunk.toString()}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[web] ${chunk.toString()}`);
  });

  await waitForServer(url, child);

  return {
    url,
    stop: () => {
      child.kill();
    },
  };
}

/**
 * Polls until the server answers, or gives up.
 *
 * Polling rather than watching for Next's "Ready" line: the wording of a log
 * line is not an interface, and what actually matters is whether a request is
 * answered. A server that dies first fails straight away rather than making
 * someone wait out the timeout.
 */
async function waitForServer(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  let died = false;
  child.once('exit', () => {
    died = true;
  });

  for (;;) {
    if (died) throw new Error('The web server stopped before it was ready.');
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.status < 500) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error('The web server did not start in time.');
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
