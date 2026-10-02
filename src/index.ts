/**
 * Stillpoint — public entry point.
 *
 * This module is intentionally minimal: it exists so the build, lint, type and
 * test pipelines all have something real to run against. Replace the contents
 * as the project takes shape; keep this file as the package's single export
 * surface.
 */

export const name = 'stillpoint';

export const version = '0.1.0';

/** Build information reported by {@link describe}. */
export interface BuildInfo {
  readonly name: string;
  readonly version: string;
}

/** Returns the package's identifying information. */
export function describe(): BuildInfo {
  return { name, version };
}
