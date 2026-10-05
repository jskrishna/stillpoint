import { describe, expect, it } from 'vitest';
import { byNewest, entryFrom, listSummary, withNote, withSharing } from './journal.js';
import { sharesNewEntry } from './coach.js';
import { apply, applyAll, forgivenessFor, startSession, type SessionEvent } from './session.js';
import { STEP_ORDER } from './steps.js';

const satisfy: SessionEvent = { type: 'step_satisfied' };
const AT = new Date('2026-10-02T09:00:00Z');
const CTX = { id: 'j1', occurredAt: AT, durationMinutes: 14 };

function completed(events: readonly SessionEvent[] = []) {
  let s = applyAll(startSession(), events);
  while (s.phase === 'in_step') s = apply(s, satisfy);
  return s;
}

describe('forgivenessFor', () => {
  it('phrases the line the journal shows', () => {
    expect(forgivenessFor('I’m not good enough.')).toBe(
      'Forgive me for believing that I am not good enough.',
    );
  });

  it('strips surrounding quotes and a trailing stop', () => {
    expect(forgivenessFor('“I don’t matter to people.”')).toBe(
      'Forgive me for believing that I don’t matter to people.',
    );
  });

  it('expands a straight apostrophe too', () => {
    expect(forgivenessFor("I'm unlovable")).toBe('Forgive me for believing that I am unlovable.');
  });

  it('has nothing to phrase without a belief', () => {
    expect(forgivenessFor(undefined)).toBeUndefined();
    expect(forgivenessFor('   ')).toBeUndefined();
    expect(forgivenessFor('""')).toBeUndefined();
  });
});

describe('entryFrom', () => {
  it('builds an entry from a completed session', () => {
    const session = completed([
      { type: 'step_satisfied', capture: { title: 'Called out at work' } },
      satisfy,
      { type: 'step_satisfied', capture: { feelings: ['ashamed', 'rejected', 'unworthy'] } },
      {
        type: 'step_satisfied',
        capture: { memory: { description: 'Teacher read my wrong answer out loud.', age: 8 } },
      },
      { type: 'step_satisfied', capture: { belief: 'I’m not good enough.' } },
    ]);

    const entry = entryFrom(session, CTX);
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('Called out at work');
    expect(entry?.feelings).toEqual(['ashamed', 'rejected', 'unworthy']);
    expect(entry?.memory?.age).toBe(8);
    expect(entry?.belief).toBe('I’m not good enough.');
    expect(entry?.forgiveness).toBe('Forgive me for believing that I am not good enough.');
    expect(entry?.reachedFinalStep).toBe(true);
    expect(entry?.sharedWithCoach).toBe(false);
    expect(entry?.kind).toBe('full');
  });

  it('carries what was said at step 1, which the PHP column holds', () => {
    const said = 'My manager read my message out to the whole team meeting.';
    const session = completed([{ type: 'step_satisfied', capture: { whatHappened: said } }]);

    const entry = entryFrom(session, CTX);
    expect(entry?.whatHappened).toBe(said);
    // The title is a cut of it, not a replacement for it — which is what this
    // interface used to carry instead of the field.
    expect(entry?.title).not.toBe(said);
  });

  it('takes the sharing decision from the caller, as fromSession does', () => {
    const session = completed();

    // `always` with a coach paired: the setting the PHP hardcode broke.
    expect(sharesNewEntry('always', true)).toBe(true);
    expect(entryFrom(session, { ...CTX, sharedWithCoach: true })?.sharedWithCoach).toBe(true);

    // And fails closed when nobody decided, which is the default's whole job.
    expect(entryFrom(session, CTX)?.sharedWithCoach).toBe(false);
    expect(sharesNewEntry('always', false)).toBe(false);
    expect(sharesNewEntry('never', true)).toBe(false);
  });

  it('prefers a forgiveness the guide captured over the phrased one', () => {
    const session = completed([
      {
        type: 'step_satisfied',
        capture: { belief: 'I am not enough', forgiveness: 'My own words.' },
      },
    ]);
    expect(entryFrom(session, CTX)?.forgiveness).toBe('My own words.');
  });

  it('refuses to journal a session that ended for safety', () => {
    const stopped = apply(startSession(), { type: 'safety_signal', level: 'high' });
    expect(entryFrom(stopped, CTX)).toBeUndefined();
  });

  it('refuses to journal a session still running', () => {
    expect(entryFrom(startSession(), CTX)).toBeUndefined();
  });

  it('journals a session the user stopped, but not as reaching the end', () => {
    const stopped = applyAll(startSession(), [satisfy, { type: 'user_stopped' }]);
    const entry = entryFrom(stopped, CTX);
    expect(entry).toBeDefined();
    expect(entry?.reachedFinalStep).toBe(false);
  });

  it('carries the session kind through', () => {
    let quick = startSession('quick');
    for (const _ of STEP_ORDER) quick = apply(quick, satisfy);
    expect(entryFrom(quick, CTX)?.kind).toBe('quick');
  });

  it('omits absent fields rather than setting them undefined', () => {
    const entry = entryFrom(completed(), CTX);
    expect(entry).toBeDefined();
    expect('belief' in (entry ?? {})).toBe(false);
    expect('memory' in (entry ?? {})).toBe(false);
  });

  it('falls back to a plain title', () => {
    expect(entryFrom(completed(), CTX)?.title).toBe('Session');
  });
});

describe('listSummary', () => {
  const base = entryFrom(completed(), CTX);

  it('quotes the belief when there is one', () => {
    const withBelief = entryFrom(
      completed([{ type: 'step_satisfied', capture: { belief: 'I don’t matter.' } }]),
      CTX,
    );
    expect(listSummary(withBelief!)).toBe('“I don’t matter.”');
  });

  it('labels a quick session', () => {
    let quick = startSession('quick');
    for (const _ of STEP_ORDER) quick = apply(quick, satisfy);
    expect(listSummary(entryFrom(quick, CTX)!)).toBe('Quick session');
  });

  it('falls back for a full session with no belief', () => {
    expect(listSummary(base!)).toBe('Session');
  });

  /*
   * An empty belief is no belief, which this did not say and
   * `JournalEntry::listSummary()` in the PHP always did — it guards on `null`
   * *and* `''`. Measured before the fix: this returned `“”`, a pair of
   * quotation marks with nothing between them, where the server returned
   * "Session" for the same row.
   *
   * It is not reachable through a turn — the route's `required` rule on
   * `utterance` trims, so a whitespace-only answer is refused 422 before
   * anything is recorded — and the case is here anyway, for the reason `'ca'`
   * is in `parity/cases.json`: two implementations of one rule disagreeing is
   * what is wrong, and whether a current client can produce the input is a
   * separate and more fragile question.
   *
   * The fixture cannot carry this one: the PHP half lives on an Eloquent model
   * rather than in `app/Domain`, and `ParityTest` is a plain PHPUnit case with
   * no application booted. That asymmetry is why this went unnoticed, and it
   * is written down at the function.
   */
  it('treats an empty belief as no belief, like the PHP does', () => {
    expect(listSummary({ ...base!, belief: '' })).toBe('Session');
    expect(listSummary({ ...base!, belief: '', kind: 'quick' })).toBe('Quick session');
    // And a belief that is only whitespace is a belief, in both: neither side
    // trims, and the one place trimming happens is the route's validation.
    expect(listSummary({ ...base!, belief: ' ' })).toBe('“ ”');
  });
});

describe('notes and sharing', () => {
  const entry = entryFrom(completed(), CTX)!;

  it('attaches a trimmed note', () => {
    expect(withNote(entry, '  Felt lighter after this one.  ').note).toBe(
      'Felt lighter after this one.',
    );
  });

  it('removes the note rather than storing an empty one', () => {
    const noted = withNote(entry, 'something');
    expect('note' in withNote(noted, '   ')).toBe(false);
  });

  it('shares and withdraws', () => {
    expect(withSharing(entry, true).sharedWithCoach).toBe(true);
    expect(withSharing(withSharing(entry, true), false).sharedWithCoach).toBe(false);
  });

  it('does not mutate the entry', () => {
    withNote(entry, 'x');
    withSharing(entry, true);
    expect(entry.sharedWithCoach).toBe(false);
    expect('note' in entry).toBe(false);
  });
});

describe('byNewest', () => {
  it('orders newest first without mutating the input', () => {
    const mk = (id: string, iso: string) => ({
      ...entryFrom(completed(), CTX)!,
      id,
      occurredAt: new Date(iso),
    });
    const list = [
      mk('a', '2026-09-28T10:00:00Z'),
      mk('b', '2026-10-02T10:00:00Z'),
      mk('c', '2026-09-30T10:00:00Z'),
    ];
    expect(byNewest(list).map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  /*
   * The second key, which this had no case for and the function had no code
   * for — the same omission as `byUrgency`, and those two are the only
   * orderings in this package.
   *
   * `scopeNewestFirst()` ends in `id DESC` because the journal is cursor-paged
   * and `occurred_at` is not unique. Passed both ways round on purpose:
   * `Array.prototype.sort` is stable, so without a tiebreaker the answer was
   * whatever order the caller happened to pass, which is not a settled order
   * across two requests.
   */
  it('breaks a same-timestamp tie by id, as the query does', () => {
    const same = '2026-10-02T10:00:00Z';
    const mk = (id: string) => ({
      ...entryFrom(completed(), CTX)!,
      id,
      occurredAt: new Date(same),
    });
    const list = [mk('01m45a'), mk('01m45c'), mk('01m45b')];

    expect(byNewest(list).map((e) => e.id)).toEqual(['01m45c', '01m45b', '01m45a']);
    expect(byNewest([...list].reverse()).map((e) => e.id)).toEqual(['01m45c', '01m45b', '01m45a']);
  });
});
