'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, type ApiProtocolVersion, type ApiStepEdit } from '../../../lib/api';
import { describe } from '../../../lib/describe';
import styles from '../admin.module.css';
import { LOCALE } from '@stillpoint/protocol';

/** How long after the last keystroke an edit is sent. */
const SAVE_AFTER_MS = 600;

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
  const [saving, setSaving] = useState(false);

  /** Edits typed but not yet sent, so the fields stay responsive. */
  const [pending, setPending] = useState<Record<string, ApiStepEdit>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

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
    if (steps.length === 0) return;

    const timer = setTimeout(() => {
      void (async () => {
        setSaving(true);
        try {
          let latest: ApiProtocolVersion | null = null;
          for (const stepId of steps) {
            const edit = pendingRef.current[stepId];
            if (edit === undefined) continue;
            latest = await api.editProtocolStep(stepId, edit);
          }
          if (latest !== null) setDraft(latest);
          setPending({});
          setProblem(null);
        } catch (e: unknown) {
          // The server's own sentence. This said "Check your connection" for
          // every failure including a 422 — so an admin pasting a step prompt
          // over 500 characters, doing the one thing LAUNCH.md asks them to do
          // the hour a deployment is up, was told their network was bad and
          // lost the edit. Measured: the API answers "The main field must not
          // be greater than 500 characters."
          setProblem(describe(e));
        } finally {
          setSaving(false);
        }
      })();
    }, SAVE_AFTER_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [pending]);

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

  const onPublish = async () => {
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
    }
  };

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
          <p className={styles.sub}>
            {live === null || live.status !== 'live'
              ? 'No live version'
              : `Live version ${live.label}`}
            {draft === null ? '' : ` · Draft ${draft.label} (not published)`}
            {saving ? ' · saving…' : ''}
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
              void onPublish();
            }}
            disabled={readOnly || !editing.publishable || saving}
            title={
              editing.publishable
                ? undefined
                : `${String(problems.length)} problems block publishing`
            }
          >
            Publish
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
