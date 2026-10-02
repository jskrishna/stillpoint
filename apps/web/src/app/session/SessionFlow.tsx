'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BASELINE,
  MAX_FEELINGS,
  MORE_FEELINGS,
  PRIMARY_FEELINGS,
  STEP_COUNT,
  STEP_LIST,
  apply,
  canSelectMore,
  currentOrdinal,
  forgivenessFor,
  helplinesFor,
  startSession,
  stepIn,
  toggleFeeling,
  type CalmerRating,
  type FeelingId,
  type Session,
  type SessionEvent,
  type StepId,
} from '@stillpoint/protocol';
import { FEELING_COLOR } from '@stillpoint/design-tokens';
import styles from './session.module.css';

const RATINGS: readonly { value: CalmerRating; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'a_little', label: 'A little' },
  { value: 'no', label: 'No' },
];

type Capture = NonNullable<Extract<SessionEvent, { type: 'step_satisfied' }>['capture']>;

/**
 * What each step contributes to the session.
 *
 * Absent values are omitted rather than set to undefined: with
 * exactOptionalPropertyTypes, "no forgiveness" and "forgiveness: undefined"
 * are different things, and only the first is true here.
 */
function captureFor(id: StepId, text: string, feelings: readonly FeelingId[]): Capture {
  switch (id) {
    case 'notice':
      return { whatHappened: text, title: text.slice(0, 60) };
    case 'feel':
      return { feelings };
    case 'remember':
      return { memory: { description: text } };
    case 'inquire': {
      const forgiveness = forgivenessFor(text);
      return forgiveness === undefined ? { belief: text } : { belief: text, forgiveness };
    }
    default:
      return {};
  }
}

/**
 * The six-step flow, driven by the protocol reducer.
 *
 * Every transition goes through `apply()`: the screen holds no rules of its
 * own, so what a user sees and what the domain believes cannot diverge. The
 * typed path is built here rather than the voice one — "Type instead" is a
 * first-class route on every designed screen, and the voice stack is not
 * chosen yet.
 */
export default function SessionFlow() {
  const [session, setSession] = useState<Session>(() => startSession('full', BASELINE.number));
  const [answer, setAnswer] = useState('');
  const [feelings, setFeelings] = useState<readonly FeelingId[]>([]);
  const [showMore, setShowMore] = useState(false);

  const ordinal = currentOrdinal(session);
  const definition = session.stepId === null ? null : stepIn(BASELINE, session.stepId);

  const advance = useCallback(() => {
    if (session.stepId === null) return;
    const id = session.stepId;
    const text = answer.trim();

    setSession((current) =>
      apply(current, { type: 'step_satisfied', capture: captureFor(id, text, feelings) }),
    );
    setAnswer('');
  }, [session.stepId, answer, feelings]);

  const stop = useCallback(() => {
    setSession((current) => apply(current, { type: 'user_stopped' }));
  }, []);

  const raiseSafety = useCallback(() => {
    setSession((current) => apply(current, { type: 'safety_signal', level: 'crisis' }));
  }, []);

  const rate = useCallback((rating: CalmerRating) => {
    setSession((current) => apply(current, { type: 'rated', rating }));
  }, []);

  if (session.phase === 'ended') {
    return session.endReason === 'safety_stop' ? (
      <SafetyPause />
    ) : (
      <Summary session={session} onRate={rate} />
    );
  }

  const canContinue = session.stepId === 'feel' ? feelings.length > 0 : answer.trim() !== '';

  return (
    <div className={styles.screen}>
      <Exits onLeave={stop} onGetHelp={raiseSafety} />

      <div className={styles.progressBlock}>
        <span className={styles.stepLabel}>
          Step {ordinal} of {STEP_COUNT} · {definition?.name}
        </span>
        <div className={styles.bars} role="presentation">
          {STEP_LIST.map((s) => (
            <div
              key={s.id}
              className={`${styles.bar} ${ordinal !== null && s.ordinal <= ordinal ? styles.barDone : ''}`}
            />
          ))}
        </div>
      </div>

      {definition?.prompts.main === null ? (
        <p className={styles.missing}>
          This step has no question yet. The copy for it is still owed by the PRD, so the protocol
          cannot be published — see <code>incompleteSteps()</code>.
        </p>
      ) : (
        <p className={styles.question}>{definition?.prompts.main}</p>
      )}

      {session.stepId === 'feel' ? (
        <FeelingPicker
          selected={feelings}
          showMore={showMore}
          onToggle={(id) => {
            setFeelings((current) => toggleFeeling(current, id));
          }}
          onShowMore={() => {
            setShowMore(true);
          }}
        />
      ) : (
        <label className={styles.answer}>
          <span className={styles.label}>YOUR ANSWER</span>
          <textarea
            className={styles.input}
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
            }}
            placeholder="Type what you want to say."
          />
        </label>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={advance}
          disabled={!canContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function Exits({ onLeave, onGetHelp }: { onLeave: () => void; onGetHelp: () => void }) {
  return (
    <div className={styles.exits}>
      <button type="button" className={styles.exit} onClick={onLeave}>
        <CloseIcon />
        Leave
      </button>
      <button type="button" className={styles.getHelp} onClick={onGetHelp}>
        Get help
      </button>
    </div>
  );
}

function FeelingPicker({
  selected,
  showMore,
  onToggle,
  onShowMore,
}: {
  selected: readonly FeelingId[];
  showMore: boolean;
  onToggle: (id: FeelingId) => void;
  onShowMore: () => void;
}) {
  const full = !canSelectMore(selected);
  const shown = showMore ? [...PRIMARY_FEELINGS, ...MORE_FEELINGS] : PRIMARY_FEELINGS;

  return (
    <>
      <p className={styles.hint}>Choose up to {MAX_FEELINGS}.</p>
      <div className={styles.chips}>
        {shown.map((f) => {
          const on = selected.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              className={`${styles.chip} ${on ? styles.chipOn : ''} ${full && !on ? styles.chipFull : ''}`}
              onClick={() => {
                onToggle(f.id);
              }}
            >
              <span className={styles.swatch} style={{ background: FEELING_COLOR[f.id] }} />
              {f.label}
            </button>
          );
        })}
      </div>
      {showMore ? null : (
        <button type="button" className={styles.moreLink} onClick={onShowMore}>
          See more feelings
        </button>
      )}
    </>
  );
}

function Summary({ session, onRate }: { session: Session; onRate: (r: CalmerRating) => void }) {
  const { data } = session;
  const rows = useMemo(
    () =>
      [
        { label: 'WHAT HAPPENED', value: data.whatHappened },
        {
          label: 'WHAT YOU FELT',
          value:
            data.feelings.length > 0
              ? data.feelings
                  .map(
                    (id) => PRIMARY_FEELINGS.concat(MORE_FEELINGS).find((f) => f.id === id)?.label,
                  )
                  .filter((l): l is string => l !== undefined)
                  .join(', ')
              : undefined,
        },
        { label: 'OLD BELIEF', value: data.belief === undefined ? undefined : `“${data.belief}”` },
        { label: 'FORGIVENESS', value: data.forgiveness },
      ].filter(
        (r): r is { label: string; value: string } => r.value !== undefined && r.value !== '',
      ),
    [data],
  );

  return (
    <div className={styles.screen}>
      <span className={styles.summaryBadge}>
        <TickIcon />
        {session.endReason === 'completed' ? 'Session complete' : 'Session saved'}
      </span>
      <h1 className={styles.summaryTitle}>
        {session.endReason === 'completed' ? 'Well done.' : 'Saved.'}
      </h1>

      <div className={styles.rows}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            <span className={styles.rowValue}>{row.value}</span>
          </div>
        ))}
      </div>

      <div className={styles.ratingCard}>
        <strong>Do you feel a bit calmer?</strong>
        <div className={styles.ratingRow}>
          {RATINGS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`${styles.ratingButton} ${data.calmerRating === r.value ? styles.ratingOn : ''}`}
              onClick={() => {
                onRate(r.value);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <Link href="/" className={`${styles.button} ${styles.primary}`}>
          Save and finish
        </Link>
      </div>
    </div>
  );
}

/**
 * The safety pause.
 *
 * No progress bar, no Continue, no way back into the flow: the session is over.
 * Helplines come from the protocol so this screen and the marketing page can
 * never disagree about which number to call.
 */
function SafetyPause() {
  const helplines = helplinesFor('IN');

  return (
    <div className={styles.screen}>
      <div className={styles.safety}>
        <h1 className={styles.safetyTitle}>{BASELINE.safety.pauseTitle}</h1>
        <p className={styles.safetyBody}>{BASELINE.safety.pauseBody}</p>

        {helplines.map((h) => (
          <a
            key={h.number}
            href={`tel:${h.number}`}
            className={`${styles.helpline} ${
              h.kind === 'emergency' ? styles.helplineEmergency : styles.helplineMain
            }`}
          >
            <span className={styles.helplineText}>
              <span className={styles.helplineName}>{h.name}</span>
              <span className={styles.helplineDetail}>{h.detail}</span>
            </span>
            <span className={styles.helplineNumber}>{h.number}</span>
          </a>
        ))}
      </div>

      <div className={styles.actions}>
        <Link href="/" className={`${styles.button} ${styles.secondary}`}>
          I’m safe, go back home
        </Link>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
