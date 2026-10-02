import { describe, expect, it } from 'vitest';
import {
  BASELINE,
  DEFAULT_SAFETY_MESSAGES,
  archive,
  draftFrom,
  editSafety,
  editStep,
  formatVersion,
  isEditable,
  isPublishable,
  isRunnable,
  publish,
  publishProblems,
  stepIn,
  stepsOf,
  type ProtocolVersion,
} from './version.js';
import { STEP_ORDER, type StepId } from './steps.js';

const AT = new Date('2026-10-02T12:00:00Z');

/** A version with every step filled in, so publishing is the thing under test. */
function complete(): ProtocolVersion {
  let v = BASELINE;
  for (const id of STEP_ORDER) {
    v = editStep(v, id, {
      main: `Question for ${id}?`,
      backups: ['Backup one?', 'Backup two?'],
      doneWhen: 'The user answers.',
      maxGuideTurns: 4,
    });
  }
  return v;
}

describe('version numbers', () => {
  it('prints as the admin screen does', () => {
    expect(formatVersion({ major: 1, minor: 4 })).toBe('1.4');
  });

  it('opens the next draft at the next minor', () => {
    const live = publish(complete(), AT);
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const next = draftFrom(live.version);
    expect(formatVersion(next.number)).toBe('1.1');
    expect(next.status).toBe('draft');
  });

  it('clears the publish date when opening a draft from a live version', () => {
    const live = publish(complete(), AT);
    if (!live.ok) return;
    expect(live.version.publishedAt).toEqual(AT);
    expect('publishedAt' in draftFrom(live.version)).toBe(false);
  });
});

describe('the baseline', () => {
  it('is a draft, because the designs leave most steps unwritten', () => {
    expect(BASELINE.status).toBe('draft');
    expect(isRunnable(BASELINE)).toBe(false);
  });

  it('cannot be published as it stands', () => {
    expect(isPublishable(BASELINE)).toBe(false);
  });

  it('carries the safety wording the designs specify', () => {
    expect(BASELINE.safety).toEqual(DEFAULT_SAFETY_MESSAGES);
    expect(BASELINE.safety.pauseTitle).toBe('Let’s pause here.');
  });

  it('holds all six steps in order', () => {
    expect(stepsOf(BASELINE).map((s) => s.id)).toEqual([...STEP_ORDER]);
  });

  it('resolves a step by id', () => {
    expect(stepIn(BASELINE, 'remember').maxGuideTurns).toBe(4);
  });
});

describe('editing', () => {
  it('edits one step of a draft without touching the others', () => {
    const edited = editStep(BASELINE, 'feel', { main: 'What are you feeling?' });
    expect(stepIn(edited, 'feel').prompts.main).toBe('What are you feeling?');
    expect(stepIn(edited, 'notice').prompts.main).toBe(stepIn(BASELINE, 'notice').prompts.main);
  });

  it('leaves fields the edit omits alone', () => {
    const edited = editStep(BASELINE, 'remember', { doneWhen: 'Changed.' });
    expect(stepIn(edited, 'remember').prompts.main).toBe(stepIn(BASELINE, 'remember').prompts.main);
    expect(stepIn(edited, 'remember').maxGuideTurns).toBe(4);
    expect(stepIn(edited, 'remember').doneWhen).toBe('Changed.');
  });

  it('can clear a field back to null', () => {
    expect(
      stepIn(editStep(BASELINE, 'remember', { doneWhen: null }), 'remember').doneWhen,
    ).toBeNull();
  });

  it('does not mutate the version it edits', () => {
    editStep(BASELINE, 'feel', { main: 'x' });
    expect(stepIn(BASELINE, 'feel').prompts.main).toBeNull();
  });

  it('copies the backups rather than aliasing the caller’s array', () => {
    const backups = ['one'];
    const edited = editStep(BASELINE, 'feel', { backups });
    backups.push('two');
    expect(stepIn(edited, 'feel').prompts.backups).toEqual(['one']);
  });

  it('edits the safety wording', () => {
    expect(editSafety(BASELINE, { pauseTitle: 'Hold on.' }).safety.pauseTitle).toBe('Hold on.');
  });

  it('refuses to edit a live version', () => {
    const live = publish(complete(), AT);
    if (!live.ok) return;
    expect(isEditable(live.version)).toBe(false);
    expect(editStep(live.version, 'feel', { main: 'changed' })).toBe(live.version);
    expect(editSafety(live.version, { pauseTitle: 'changed' })).toBe(live.version);
  });

  it('refuses to edit an archived version', () => {
    const archived = archive(BASELINE);
    expect(editStep(archived, 'feel', { main: 'changed' })).toBe(archived);
  });
});

describe('publishing', () => {
  it('publishes a complete draft', () => {
    const result = publish(complete(), AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version.status).toBe('live');
    expect(result.version.publishedAt).toEqual(AT);
  });

  it('refuses a draft with a step missing its question', () => {
    const result = publish(editStep(complete(), 'feel', { main: null }), AT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.some((p) => p.stepId === 'feel')).toBe(true);
  });

  it('treats blank copy as missing', () => {
    const result = publish(editStep(complete(), 'feel', { main: '   ' }), AT);
    expect(result.ok).toBe(false);
  });

  it('refuses a step that allows no guide turns', () => {
    const result = publish(editStep(complete(), 'notice', { maxGuideTurns: 0 }), AT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.some((p) => p.reason.includes('no guide turns'))).toBe(true);
  });

  it('refuses a draft whose safety message is blank', () => {
    const result = publish(editSafety(complete(), { pauseBody: '  ' }), AT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.some((p) => p.stepId === undefined)).toBe(true);
  });

  it('refuses to publish something already live', () => {
    const live = publish(complete(), AT);
    if (!live.ok) return;
    expect(publish(live.version, AT).ok).toBe(false);
  });

  it('reports every problem at once, named by step', () => {
    const problems = publishProblems(BASELINE);
    const steps = new Set(problems.map((p) => p.stepId));
    // Three steps have no question at all, and five lack a limit and criterion.
    expect(steps.has('responsibility')).toBe(true);
    expect(steps.has('forgive')).toBe(true);
    expect(problems.length).toBeGreaterThan(5);
  });

  it('never throws on an unpublishable draft', () => {
    expect(() => publish(BASELINE, AT)).not.toThrow();
  });

  it('does not mutate the draft it publishes', () => {
    const draft = complete();
    publish(draft, AT);
    expect(draft.status).toBe('draft');
  });
});

describe('archiving', () => {
  it('retires a version', () => {
    expect(archive(BASELINE).status).toBe('archived');
  });

  it('is idempotent', () => {
    const once = archive(BASELINE);
    expect(archive(once)).toBe(once);
  });
});

describe('runnability', () => {
  it('is false while any step lacks copy', () => {
    expect(isRunnable(BASELINE)).toBe(false);
  });

  it('is true once every step is filled in', () => {
    expect(isRunnable(complete())).toBe(true);
  });

  it('agrees with publishability for a draft', () => {
    const ids: StepId[] = [...STEP_ORDER];
    expect(ids).toHaveLength(6);
    expect(isRunnable(complete())).toBe(isPublishable(complete()));
  });
});
