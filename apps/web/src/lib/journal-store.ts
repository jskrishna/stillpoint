/**
 * Where journal entries live, for now.
 *
 * No backend is chosen yet, so entries are kept in this browser only. That is
 * a deliberate stand-in, not a design: it keeps "Only you can see these"
 * literally true while the storage decision is open, and it is behind an
 * interface so swapping in an API is a one-file change.
 *
 * What it is not: durable. Clearing site data loses everything, and nothing
 * syncs between devices. Say so in the UI rather than implying otherwise.
 */

import type { JournalEntry } from '@stillpoint/protocol';

const KEY = 'stillpoint.journal.v1';

/** Entries as stored: dates do not survive JSON, so they travel as ISO text. */
interface StoredEntry extends Omit<JournalEntry, 'occurredAt'> {
  readonly occurredAt: string;
}

export interface JournalStore {
  list(): readonly JournalEntry[];
  get(id: string): JournalEntry | undefined;
  add(entry: JournalEntry): void;
  update(id: string, change: (entry: JournalEntry) => JournalEntry): void;
  remove(id: string): void;
}

function toStored(entry: JournalEntry): StoredEntry {
  return { ...entry, occurredAt: entry.occurredAt.toISOString() };
}

function fromStored(stored: StoredEntry): JournalEntry {
  return { ...stored, occurredAt: new Date(stored.occurredAt) };
}

/**
 * Reads the stored entries.
 *
 * Every access is guarded: storage throws in a private window, can be blocked
 * outright, and may hold something another version wrote. A journal that fails
 * to parse must not take the screen down with it, so a bad read is treated as
 * an empty journal.
 */
function read(): readonly JournalEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as StoredEntry[])
      .filter((e) => typeof e.id === 'string' && typeof e.occurredAt === 'string')
      .map(fromStored);
  } catch {
    return [];
  }
}

function write(entries: readonly JournalEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.map(toStored)));
  } catch {
    // Storage full or blocked. The session itself already happened; losing the
    // written record is bad, but throwing here would lose the screen too.
  }
}

export const browserJournalStore: JournalStore = {
  list: () => read(),
  get: (id) => read().find((e) => e.id === id),
  add: (entry) => {
    write([entry, ...read().filter((e) => e.id !== entry.id)]);
  },
  update: (id, change) => {
    write(read().map((e) => (e.id === id ? change(e) : e)));
  },
  remove: (id) => {
    write(read().filter((e) => e.id !== id));
  },
};

/** Whether this browser can actually persist anything. */
export function storageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = `${KEY}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
