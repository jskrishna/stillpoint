'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, type ApiProtocolVersion, type ApiStepEdit } from '../../../lib/api';
import { describe } from '../../../lib/describe';
import { type SaveState } from '../../../components/SaveStatus';
import { inFlight } from '../../../lib/presses';
import styles from '../admin.module.css';
import { LOCALE } from '@stillpoint/protocol';

/** How long after the last keystroke an edit is sent. */
const SAVE_AFTER_MS = 600;

/** What `PATCH /admin/protocol-versions/draft/safety` takes. */
type SafetyEdit = { pauseTitle?: string; pauseBody?: string };

/**
 * The step-prompt editor.
 *
 * Publishing is gated by the server, not by this screen: the draft carries the
 * domain's `problems` list and `publishable`, and the editor renders them. The
 * Publish button being disabled is a courtesy — the refusal that matters is the
 * 422 the API returns, because a screen's own check can always be skipped.
 *
 * Edits are saved after typing stops, one step at a time, and the reply
 * replaces the draft. So the problems list and the step badges are always the
 * server's current answer rather than this screen's guess at one.
 */
export default function ProtocolEditor() {
  const [live, setLive] = useState<ApiProtocolVersion | null>(null);
  const [draft, setDraft] = useState<ApiProtocolVersion | null>(null);
  const [selected, setSelected] = useState('notice');
  const [problem, setProblem] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [publishing, setPublishing] = useState(false);

  /** Edits typed but not yet sent, so the fields stay responsive. */
  const [pending, setPending] = useState<Record<string, ApiStepEdit>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  /**
   * The safety pause's wording, same treatment.
   *
   * Kept apart from `pending` because it belongs to the version rather than to
   * a step, and `pending` is keyed by step id — a reserved key in there would
   * be a step id that is not one.
   */
  const [pendingSafety, setPendingSafety] = useState<SafetyEdit | null>(null);
  const pendingSafetyRef = useRef(pendingSafety);
  pendingSafetyRef.current = pendingSafety;

  useEffect(() => {
    api
      .protocolVersions()
      .then((versions) => {
        setLive(versions.live);
        setDraft(versions.draft);
      })
      .catch((e: unknown) => {
        setProblem(
          e instanceof ApiError && (e.isUnauthenticated || e.status === 404)
            ? 'The step-prompt editor is for staff. Sign in with an admin account.'
            : describe(e),
        );
      });
  }, []);

  // Sent after typing stops rather than on every keystroke, and from an effect
  // rather than a change handler: a save belongs where React decides when it
  // runs, not in a render that may happen twice.
  useEffect(() => {
    const steps = Object.keys(pending);
    if (steps.length === 0 && pendingSafety === null) return;

    // Typing again means the last "saved" is about older text.
    setSaveState('idle');
    const timer = setTimeout(() => {
      void (async () => {
        setSaveState('saving');
        try {
          let latest: ApiProtocolVersion | null = null;
          for (const stepId of steps) {
            const edit = pendingRef.current[stepId];
            if (edit === undefined) continue;
            latest = await api.editProtocolStep(stepId, edit);
          }
          // After the steps, so one timer and one status line cover both.
          const wording = pendingSafetyRef.current;
          if (wording !== null) latest = await api.editProtocolSafety(wording);
          if (latest !== null) setDraft(latest);
          setPending({});
          setPendingSafety(null);
          setProblem(null);
          setSaveState('saved');
        } catch (e: unknown) {
          // The server's own sentence. This said "Check your connection" for
          // every failure including a 422 — so an admin pasting a step prompt
          // over 500 characters, doing the one thing LAUNCH.md asks them to do
          // the hour a deployment is up, was told their network was bad and
          // lost the edit. Measured: the API answers "The main field must not
          // be greater than 500 characters."
          setProblem(describe(e));
          // Idle rather than "saved": the failure is the `role="alert"` below,
          // and a status that lies is worse than no status.
          setSaveState('idle');
        }
      })();
    }, SAVE_AFTER_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [pending, pendingSafety]);

  const change = useCallback((stepId: string, edit: ApiStepEdit) => {
    // Applied locally at once so the field does not fight the typist, and
    // queued for the server, which has the last word.
    setDraft((current) =>
      current === null
        ? current
        : {
            ...current,
            steps: current.steps.map((s) => (s.id === stepId ? { ...s, ...edit } : s)),
          },
    );
    setPending((current) => ({ ...current, [stepId]: { ...current[stepId], ...edit } }));
  }, []);

  const changeSafety = useCallback((edit: SafetyEdit) => {
    setDraft((current) => (current === null ? current : { ...current, ...edit }));
    setPendingSafety((current) => ({ ...current, ...edit }));
  }, []);

  const oncePublishing = useRef(inFlight()).current;

  const onPublish = () =>
    oncePublishing(async () => {
      /*
       * `inFlight`, because nothing React holds stops a second press. The
       * `onClick` guard reads `readOnly` and `publishable`, neither of which
       * changes until the response lands — and `if (publishing) return` did
       * not help either, which is the finding: the handler closes over the
       * `publishing` from the render it was built in, so every press inside
       * one frame reads `false`.
       *
       * Re-measured that way with that guard in place, on the console's most
       * consequential button: three `POST …/publish`, `[200, 500, 500]`. The
       * server locks `protocol_versions` in id order, so a second publish
       * cannot leave two live versions — what it leaves is a refusal rendered
       * over the publish that just worked. (The 500s are sqlite's `database is
       * locked` under concurrent write transactions, which is what the
       * development and end-to-end stacks run; on MySQL the second and third
       * are the 422 for a draft that is no longer open.)
       *
       * The earlier measurement used three separate clicks, which is a React
       * flush between presses and so sends one. `lib/presses.ts` has the rest.
       */
      setPublishing(true);
      try {
        const published = await api.publishProtocolDraft();
        setLive(published);
        setDraft(null);
        setProblem(null);
      } catch (e: unknown) {
        // No "The server refused:" prefix any more: it read as a refusal
        // either way, and prefixing an empty message — which is what a bare
        // `abort(404)` sends, reachable here if the admin's role was taken
        // mid-edit — produced "The server refused: " and nothing after it.
        setProblem(describe(e));
        // Re-read, so the problems shown are the ones the server named.
        const versions = await api.protocolVersions().catch(() => null);
        if (versions !== null) {
          setLive(versions.live);
          setDraft(versions.draft);
        }
      } finally {
        setPublishing(false);
      }
    });

  const openDraft = async () => {
    try {
      setDraft(await api.openProtocolDraft());
      setProblem(null);
    } catch (e: unknown) {
      setProblem(describe(e));
    }
  };

  // The draft is what is edited; with none open, the live version is read-only.
  const editing = draft ?? live;

  const problemsByStep = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of editing?.problems ?? []) {
      if (p.stepId !== null) map.set(p.stepId, (map.get(p.stepId) ?? 0) + 1);
    }
    return map;
  }, [editing]);

  if (editing === null) {
    return (
      <>
        <h1 className={styles.title}>Step prompts</h1>
        <p className={styles.sub}>{problem ?? 'Loading…'}</p>
      </>
    );
  }

  const step = editing.steps.find((s) => s.id === selected) ?? editing.steps[0];
  const readOnly = draft === null;
  const problems = editing.problems;

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Step prompts</h1>
          {/*
            The whole line is the live region, rather than a `SaveStatus`
            inside it. Everything this screen does ends up here — which
            version is live, whether a draft is open, whether the last edit
            was written — so one region covers an autosave and a publish
            alike, and after publishing it reads exactly the news:
            "Live version 1.1". Polite, because none of it should interrupt
            somebody typing; the refusals below are the `role="alert"`.
          */}
          <p className={styles.sub} role="status">
            {live === null || live.status !== 'live'
              ? 'No live version'
              : `Live version ${live.label}`}
            {draft === null ? '' : ` · Draft ${draft.label} (not published)`}
            {saveState === 'saving' ? ' · saving…' : saveState === 'saved' ? ' · saved' : ''}
          </p>
        </div>
        <div className={styles.actions}>
          {readOnly ? (
            <button
              type="button"
              className={`${styles.button} ${styles.secondary}`}
              onClick={() => {
                void openDraft();
              }}
            >
              Edit as a new draft
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={() => {
              if (readOnly || !editing.publishable || saveState === 'saving') return;
              void onPublish();
            }}
            /*
             * `aria-disabled`, not `disabled`: publishing changes what the
             * guide says to everybody, and a `disabled` button leaves the tab
             * order — so the press that succeeded dropped
             * `document.activeElement` to `<body>`, measured, and the admin
             * was told nothing. Focusable, the button stays put while the line
             * above announces the new live version. The handler refuses.
             */
            aria-disabled={readOnly || !editing.publishable || saveState === 'saving' || publishing}
            title={
              editing.publishable
                ? undefined
                : `${String(problems.length)} problems block publishing`
            }
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {problem === null ? null : (
        <p className={styles.sub} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.editor}>
        <div className={styles.stepList}>
          {editing.steps.map((s) => {
            const count = problemsByStep.get(s.id) ?? 0;
            return (
              <button
                key={s.id}
                type="button"
                /*
                 * Which step's fields are on screen, said rather than only
                 * drawn. Measured in the accessibility tree: six buttons with
                 * no `pressed`, `checked`, `selected` or `current` on any of
                 * them, so an admin editing the product's voice with a screen
                 * reader could not tell which of the six they were in.
                 *
                 * `aria-current`, not `aria-pressed`: these are not toggles,
                 * they select one of a set — the same thing `AdminNav` and
                 * `BottomNav` already say with `aria-current="page"`, and
                 * `"true"` here because this moves no page.
                 *
                 * A `tablist` of `tab`s would be the fuller answer and it
                 * brings obligations: ARIA's pattern wants arrow-key
                 * navigation and a `tabpanel` wired with `aria-controls`,
                 * which is a keyboard redesign rather than a missing state.
                 * This is one attribute that makes the current step
                 * announceable, and it is what the two navs here do.
                 */
                aria-current={s.id === selected ? 'true' : undefined}
                className={`${styles.stepTab} ${s.id === selected ? styles.stepTabOn : ''}`}
                onClick={() => {
                  setSelected(s.id);
                }}
              >
                {s.ordinal}. {s.name}
                {count > 0 ? (
                  <span
                    className={styles.stepProblem}
                    aria-label={`${String(count)} problems`}
                    role="img"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {step === undefined ? null : (
          <div className={styles.fields}>
            <label className={styles.field}>
              Main question
              <textarea
                className={styles.textarea}
                rows={2}
                value={step.main ?? ''}
                placeholder={readOnly ? '' : 'Not written yet'}
                readOnly={readOnly}
                onChange={(e) => {
                  change(step.id, { main: e.target.value === '' ? null : e.target.value });
                }}
              />
            </label>

            {[0, 1].map((i) => (
              <label key={i} className={styles.field}>
                Backup question {i + 1}
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={step.backups[i] ?? ''}
                  placeholder={readOnly ? '' : 'Optional'}
                  readOnly={readOnly}
                  onChange={(e) => {
                    const next = [...step.backups];
                    next[i] = e.target.value;
                    change(step.id, { backups: next.filter((b) => b.trim() !== '') });
                  }}
                />
              </label>
            ))}

            <div className={styles.pair}>
              <label className={styles.field}>
                Step is done when
                <input
                  className={styles.input}
                  value={step.doneWhen ?? ''}
                  placeholder={readOnly ? '' : 'Not written yet'}
                  readOnly={readOnly}
                  onChange={(e) => {
                    change(step.id, { doneWhen: e.target.value === '' ? null : e.target.value });
                  }}
                />
              </label>
              <label className={styles.field}>
                Max guide turns
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={step.maxGuideTurns ?? ''}
                  placeholder={readOnly ? '' : 'Not set'}
                  readOnly={readOnly}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    change(step.id, { maxGuideTurns: Number.isNaN(n) ? null : n });
                  }}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/*
        The safety pause's own words, which this screen did not have.
        **The route, the validation, a test, the client method and the type all
        existed; the screen was the only missing link** — `editProtocolSafety`
        was a method nothing called, so the one piece of copy on the crisis
        screen that an admin is meant to own could only be changed with a
        hand-written PATCH. `publishProblems()` refuses a draft whose title or
        body is empty, so the screen could already *report* a problem with this
        copy in the list below and offered no way to fix it.

        It is version-level rather than per-step, so it sits outside the step
        editor rather than in the tab that happens to be selected.
      */}
      <div className={styles.fields}>
        <strong className={styles.problemsTitle}>The safety pause</strong>
        <p className={styles.sub}>
          What somebody sees when a session stops because they may be in danger. The helplines below
          it come from their own country and are not editable here.
        </p>

        <label className={styles.field}>
          Title
          <input
            className={styles.input}
            value={editing.pauseTitle}
            readOnly={readOnly}
            onChange={(e) => {
              changeSafety({ pauseTitle: e.target.value });
            }}
          />
        </label>

        <label className={styles.field}>
          What it says
          <textarea
            className={styles.textarea}
            rows={3}
            value={editing.pauseBody}
            readOnly={readOnly}
            onChange={(e) => {
              changeSafety({ pauseBody: e.target.value });
            }}
          />
        </label>
      </div>

      {live !== null && live.status === 'live' ? (
        <p className={styles.published}>
          Version {live.label} is live
          {live.publishedAt === null
            ? ''
            : `, published ${new Date(live.publishedAt).toLocaleString(LOCALE)}`}
          . It can no longer be edited.
        </p>
      ) : null}

      {problems.length === 0 ? null : (
        <div className={styles.problems}>
          <strong className={styles.problemsTitle}>
            {problems.length} {problems.length === 1 ? 'problem blocks' : 'problems block'}{' '}
            publishing
          </strong>
          <ul className={styles.problemList}>
            {problems.map((p) => (
              <li key={`${p.stepId ?? 'version'}-${p.reason}`}>{p.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
