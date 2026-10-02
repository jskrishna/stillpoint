'use client';

import { useMemo, useState } from 'react';
import {
  BASELINE,
  STEP_ORDER,
  editStep,
  formatVersion,
  publish,
  publishProblems,
  stepIn,
  type ProtocolVersion,
  type StepId,
} from '@stillpoint/protocol';
import styles from '../admin.module.css';

/**
 * The step-prompt editor.
 *
 * Publish is gated by the domain, not by this screen: publishProblems() decides
 * what blocks, and the editor only renders what it reports. That keeps a
 * half-written protocol out of a live session, which is the whole point of the
 * version model.
 */
export default function ProtocolEditor() {
  const [draft, setDraft] = useState<ProtocolVersion>(BASELINE);
  const [selected, setSelected] = useState<StepId>('notice');
  const [published, setPublished] = useState<ProtocolVersion | null>(null);

  const problems = useMemo(() => publishProblems(draft), [draft]);
  const blocked = problems.length > 0;
  const step = stepIn(draft, selected);

  const problemsByStep = useMemo(() => {
    const map = new Map<StepId, number>();
    for (const p of problems) {
      if (p.stepId !== undefined) map.set(p.stepId, (map.get(p.stepId) ?? 0) + 1);
    }
    return map;
  }, [problems]);

  const change = (edit: Parameters<typeof editStep>[2]) => {
    setDraft((current) => editStep(current, selected, edit));
  };

  const onPublish = () => {
    const result = publish(draft, new Date());
    if (result.ok) setPublished(result.version);
  };

  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Step prompts</h1>
          <p className={styles.sub}>
            {published === null
              ? `No live version · Draft ${formatVersion(draft.number)} (not published)`
              : `Live version ${formatVersion(published.number)} · published`}
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={`${styles.button} ${styles.secondary}`} disabled>
            Test it
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={onPublish}
            disabled={blocked}
            title={blocked ? `${String(problems.length)} problems block publishing` : undefined}
          >
            Publish
          </button>
        </div>
      </div>

      <div className={styles.editor}>
        <div className={styles.stepList}>
          {STEP_ORDER.map((id) => {
            const s = stepIn(draft, id);
            const count = problemsByStep.get(id) ?? 0;
            return (
              <button
                key={id}
                type="button"
                className={`${styles.stepTab} ${id === selected ? styles.stepTabOn : ''}`}
                onClick={() => {
                  setSelected(id);
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

        <div className={styles.fields}>
          <label className={styles.field}>
            Main question
            <textarea
              className={styles.textarea}
              rows={2}
              value={step.prompts.main ?? ''}
              placeholder="Not written yet"
              onChange={(e) => {
                change({ main: e.target.value === '' ? null : e.target.value });
              }}
            />
          </label>

          {[0, 1].map((i) => (
            <label key={i} className={styles.field}>
              Backup question {i + 1}
              <textarea
                className={styles.textarea}
                rows={2}
                value={step.prompts.backups[i] ?? ''}
                placeholder="Optional"
                onChange={(e) => {
                  const next = [...step.prompts.backups];
                  next[i] = e.target.value;
                  change({ backups: next.filter((b) => b.trim() !== '') });
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
                placeholder="Not written yet"
                onChange={(e) => {
                  change({ doneWhen: e.target.value === '' ? null : e.target.value });
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
                placeholder="Not set"
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  change({ maxGuideTurns: Number.isNaN(n) ? null : n });
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {published === null ? null : (
        <p className={styles.published}>
          Version {formatVersion(published.number)} is live, published{' '}
          {published.publishedAt?.toLocaleString('en-IN') ?? ''}. It can no longer be edited.
        </p>
      )}

      {blocked ? (
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
      ) : null}
    </>
  );
}
