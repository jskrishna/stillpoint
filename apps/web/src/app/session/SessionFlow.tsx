'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BASELINE,
  FEELINGS,
  MAX_FEELINGS,
  MORE_FEELINGS,
  PRIMARY_FEELINGS,
  STEP_COUNT,
  STEP_LIST,
  apply,
  baselineRiskScreen,
  canSelectMore,
  currentOrdinal,
  entryFrom,
  helplinesFor,
  openingLine,
  startSession,
  stepIn,
  takeTurn,
  toggleFeeling,
  type CalmerRating,
  type FeelingId,
  type Session,
} from '@stillpoint/protocol';
import { FEELING_COLOR } from '@stillpoint/design-tokens';
import { browserJournalStore } from '../../lib/journal-store';
import { webGuide } from '../../lib/guide';
import styles from './session.module.css';

const RATINGS: readonly { value: CalmerRating; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'a_little', label: 'A little' },
  { value: 'no', label: 'No' },
];

const LABEL = new Map(FEELINGS.map((f) => [f.id, f.label]));

const DEPS = { guide: webGuide, risk: baselineRiskScreen };

/**
 * The six-step flow.
 *
 * The screen does not decide anything. Every answer goes through takeTurn(),
 * which screens safety first and only then asks the guide whether the step is
 * done — so the session advances because the guide said so, not because a
 * button was pressed. The typed path is built because the voice stack is not
 * chosen; "Type instead" is a first-class route on every designed screen.
 *
 * Step 3 is the one exception, and by design: it is a chip picker, not a
 * conversation, so there is no utterance to screen or interpret.
 */
export default function SessionFlow() {
  const [session, setSession] = useState<Session>(() => startSession('full', BASELINE.number));
  const [guideLine, setGuideLine] = useState<string>(() =>
    openingLine(startSession('full', BASELINE.number), BASELINE, webGuide),
  );
  const [answer, setAnswer] = useState('');
  const [lastSaid, setLastSaid] = useState('');
  const [feelings, setFeelings] = useState<readonly FeelingId[]>([]);
  const [showMore, setShowMore] = useState(false);

  const startedAt = useRef(Date.now());
  const entryId = `s_${String(startedAt.current)}`;
  const saved = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (session.phase !== 'ended' || saved.current) return;
    const entry = entryFrom(session, {
      id: entryId,
      occurredAt: new Date(startedAt.current),
      durationMinutes: Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)),
    });
    if (entry !== undefined) browserJournalStore.add(entry);
    saved.current = true;
  }, [session, entryId]);

  const ordinal = currentOrdinal(session);
  const definition = session.stepId === null ? null : stepIn(BASELINE, session.stepId);

  /** Submits a typed answer through the turn loop. */
  const submit = useCallback(() => {
    const text = answer.trim();
    if (text === '') return;

    const result = takeTurn(session, BASELINE, text, DEPS);
    setSession(result.session);
    setLastSaid(text);
    setAnswer('');

    if (result.stopped) return;
    setGuideLine(
      result.advanced ? openingLine(result.session, BASELINE, webGuide) : result.say || guideLine,
    );
  }, [answer, session, guideLine]);

  /** Step 3 is a selection, so it advances without an utterance to screen. */
  const submitFeelings = useCallback(() => {
    if (feelings.length === 0) return;
    const next = apply(session, { type: 'step_satisfied', capture: { feelings } });
    setSession(next);
    setLastSaid(feelings.map((id) => LABEL.get(id) ?? id).join(', '));
    setGuideLine(openingLine(next, BASELINE, webGuide));
  }, [feelings, session]);

  const stop = useCallback(() => {
    setSession((current) => apply(current, { type: 'user_stopped' }));
  }, []);

  const raiseSafety = useCallback(() => {
    setSession((current) => apply(current, { type: 'safety_signal', level: 'high' }));
  }, []);

  const rate = useCallback(
    (rating: CalmerRating) => {
      setSession((current) => apply(current, { type: 'rated', rating }));
      browserJournalStore.update(entryId, (e) => ({ ...e, calmerRating: rating }));
    },
    [entryId],
  );

  const finish = useCallback(() => {
    router.push('/app/journal');
  }, [router]);

  if (session.phase === 'ended') {
    return session.endReason === 'safety_stop' ? (
      <SafetyPause />
    ) : (
      <Summary session={session} onRate={rate} onFinish={finish} />
    );
  }

  const onFeelStep = session.stepId === 'feel';
  const canContinue = onFeelStep ? feelings.length > 0 : answer.trim() !== '';

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

      {guideLine === '' ? (
        <p className={styles.missing}>
          This step has no question yet. The copy for it is still owed by the PRD, so the protocol
          cannot be published — see <code>incompleteSteps()</code>.
        </p>
      ) : (
        <p className={styles.question}>{guideLine}</p>
      )}

      {lastSaid === '' ? null : (
        <div className={styles.saidCard}>
          <span className={styles.label}>YOU SAID</span>
          <p className={styles.saidText}>“{lastSaid}”</p>
        </div>
      )}

      {onFeelStep ? (
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
          onClick={onFeelStep ? submitFeelings : submit}
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

function Summary({
  session,
  onRate,
  onFinish,
}: {
  session: Session;
  onRate: (r: CalmerRating) => void;
  onFinish: () => void;
}) {
  const { data } = session;
  const rows = useMemo(
    () =>
      [
        { label: 'WHAT HAPPENED', value: data.whatHappened },
        {
          label: 'WHAT YOU FELT',
          value:
            data.feelings.length > 0
              ? data.feelings.map((id) => LABEL.get(id) ?? id).join(', ')
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
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onFinish}>
          Save and finish
        </button>
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
        <Link href="/app" className={`${styles.button} ${styles.secondary}`}>
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
