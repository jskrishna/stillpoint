'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CALMER_ANSWER_LABEL,
  CALMER_RATINGS,
  DEFAULT_COUNTRY,
  FEELINGS,
  MAX_FEELINGS,
  MORE_FEELINGS,
  PRIMARY_FEELINGS,
  baselineRiskScreen,
  canSelectMore,
  helplinesFor,
  toggleFeeling,
  type FeelingId,
} from '@stillpoint/protocol';
import { FEELING_COLOR } from '@stillpoint/design-tokens';
import HelplineLink from '../../components/HelplineLink';
import { ApiError, api, hasToken, type ApiHelpline, type ApiSession } from '../../lib/api';
import { describe } from '../../lib/describe';
import { browserVoiceLoop, type VoiceLoop } from '../../lib/voice';
import styles from './session.module.css';

// One copy of the three answers, from the domain. Both session screens held
// their own identical array of these, which is how the plan labels and the
// console's word for a full session came to disagree.
const RATINGS = CALMER_RATINGS.map((value) => ({ value, label: CALMER_ANSWER_LABEL[value] }));

const LABEL = new Map(FEELINGS.map((f) => [f.id, f.label]));

/**
 * The six-step flow, run by the server.
 *
 * The screen holds no rules at all now. Every answer is posted to
 * `/sessions/{id}/turns`, which screens for risk before the guide is consulted
 * and returns the session as the server believes it to be. What is rendered is
 * whatever came back, so the two cannot diverge — and a client cannot skip the
 * safety check, because there is no other way to advance.
 */
export default function SessionFlow() {
  const [session, setSession] = useState<ApiSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Whose crisis numbers, if this screen ever has to offer them itself. */
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  /**
   * Helplines to show beside an answer that never reached the server.
   *
   * **This is not the stop and must never become it.** The stop, the flag and
   * the queue are the server's, and the browser's copy of the phrase screen is
   * a convenience — that rule is why `takeTurn()` screens server-side before
   * the guide is consulted, and nothing here changes it. What this covers is
   * the one case the server cannot: the request did not arrive. Somebody typed
   * that they were going to kill themselves, the POST failed in a tunnel, and
   * the screen said "Could not reach Stillpoint. Check your connection and try
   * again." — a connection error, to a person who had just said that.
   *
   * So on a failure, and only on a failure, the local screen's `high` is
   * enough to put a phone number on the screen. It does not end the session,
   * does not raise a flag and does not claim to have read anything: the answer
   * stays in the box and the retry goes through the server, which does all
   * three. `high` and not `medium`, to match the level the server stops on, so
   * this cannot appear on an ordinary bad day.
   *
   * And its silence means nothing. The phrase screen misses whole languages —
   * `quiero morirme` normalises cleanly and matches nothing — so an empty list
   * here is not evidence of safety, exactly as a `none` from that screen is
   * not.
   */
  const [unsentCrisis, setUnsentCrisis] = useState<readonly ApiHelpline[] | null>(null);
  const [exhausted, setExhausted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [lastSaid, setLastSaid] = useState('');
  const [feelings, setFeelings] = useState<readonly FeelingId[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [voice, setVoice] = useState<VoiceLoop | null>(null);
  const started = useRef(false);
  const spoken = useRef<string | null>(null);
  /**
   * The question, so an advance can be announced.
   *
   * This screen replaces its question in place. A sighted user sees that; a
   * screen reader is told nothing, because nothing here moves focus and the
   * question is not in a live region. Measured: after the server ended a
   * session for safety, `document.activeElement` was `<body>` — the button
   * that had been pressed was gone, the whole screen had been replaced by the
   * pause, and focus had fallen to the top of the document with no
   * announcement.
   *
   * A live region on the question would be the other way to do it, and is
   * worse here: the guide speaks its question aloud when the account is in
   * voice mode, so the text would be said twice. Moving focus announces the
   * new question once and leaves the next Tab on the answer box, which is
   * where a keyboard user was going anyway.
   */
  const questionRef = useRef<HTMLParagraphElement>(null);
  /** False until the first question has been rendered; see the effect below. */
  const arrived = useRef(false);
  /** The question focus was last moved to, which is not what was spoken. */
  const spokenQuestion = useRef<string>('');
  const router = useRouter();
  const search = useSearchParams();
  // `?kind=quick` — the home screen offers both, and a quick session is the one
  // that is always available whatever the plan allows.
  const kind = search.get('kind') === 'quick' ? 'quick' : 'full';
  // `?resume=1` carries on the open session instead of starting one. Starting
  // one ends whatever was open, so the difference matters: on a free plan it is
  // the difference between spending one of three and spending two.
  const resuming = search.get('resume') === '1';

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!hasToken()) {
      router.push('/welcome');
      return;
    }

    // The voice loop is bound from the account's talk mode. Listening is not
    // built — see `lib/voice/user-ear.ts` — so this only decides whether the
    // guide speaks its question aloud.
    api
      .me()
      .then((profile) => {
        setVoice(browserVoiceLoop(profile.talkMode));
        setCountry(profile.country);
      })
      .catch(() => {
        // A session without a voice is a typed session, which works.
        setVoice(browserVoiceLoop('type'));
      });

    // Resuming asks for the open session; starting asks for a new one, which
    // ends whatever was open. Both land in the same place from here.
    (resuming
      ? api.currentSession().then((open) => open ?? api.startSession(kind))
      : api.startSession(kind)
    )
      .then(setSession)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) {
          router.push('/welcome');
          return;
        }
        if (e instanceof ApiError && e.status === 403) {
          router.push('/welcome/consent');
          return;
        }
        if (e instanceof ApiError && e.status === 402) {
          // The plan's full-session allowance is spent. A quick session is
          // always available, so offer that rather than a dead end.
          setExhausted(e.message);
          return;
        }
        setError(describe(e));
      });
  }, [router, kind, resuming]);

  /**
   * Says the step's question aloud, once per question.
   *
   * Keyed on the text rather than the step, because the guide may ask a backup
   * question without the step changing — and tracked in a ref so a re-render
   * does not repeat it. Only the protocol's own copy is ever spoken; the user's
   * words are never read back out.
   */
  useEffect(() => {
    if (voice === null || session === null) return;
    // No `?? ''`: an empty string is not `GuideCopy`, and nothing should be
    // cast into it to paper over a session with nothing to say.
    const say = session.say;
    if (say === null || say === '' || say === spoken.current) return;

    spoken.current = say;
    void voice.guide.speak(say);
  }, [voice, session]);

  /**
   * Move focus to the question when it changes, and only then.
   *
   * Arriving at the first question is not a change — the person came here, they
   * were not moved — so the first render is recorded and skipped. Every later
   * one is: the screen swapped the question out from under them, and before
   * this nothing said so.
   */
  useEffect(() => {
    if (session === null) return;
    const say = session.say ?? '';
    if (!arrived.current) {
      arrived.current = true;
      spokenQuestion.current = say;
      return;
    }
    if (say === spokenQuestion.current) return;
    spokenQuestion.current = say;
    questionRef.current?.focus();
  }, [session]);

  // Stop mid-sentence when the screen goes away, so a question is not still
  // being spoken over whatever comes next.
  useEffect(() => {
    if (voice === null) return;
    return () => {
      voice.guide.stop();
    };
  }, [voice]);

  const send = useCallback(
    /**
     * `utterance` is what the server screens and records; `said` is what this
     * screen echoes back. They differ at step 3, where the answer is a
     * selection: the server is sent feeling ids, which are domain, and the user
     * is shown their labels, which are not.
     */
    async (utterance: string, said: string = utterance) => {
      if (session === null || busy) return;
      setBusy(true);
      setError(null);
      // The user has answered, so the question no longer needs saying.
      voice?.guide.stop();
      try {
        // The step goes with the answer. Without it, a reply lost on the way
        // back and then sent again is recorded against the *next* step, whose
        // question is then never answered by anybody.
        const next = await api.takeTurn(session.id, utterance, session.step?.id ?? null);
        setSession(next);
        // It arrived, so the server has screened it and this screen has no
        // business second-guessing what it decided.
        setUnsentCrisis(null);
        setLastSaid(said);
        setAnswer('');
        setFeelings([]);
      } catch (e: unknown) {
        if (e instanceof ApiError && e.isConflict) {
          // The session ended, or this answer was for a step that has moved
          // on. Either way the server knows where this session is and this
          // screen does not, so take its word for it — and clear the box,
          // because what is in it is not an answer to whatever is asked next.
          setSession(await api.session(session.id));
          setAnswer('');
          setFeelings([]);
        } else {
          setError(describe(e));
          // The server never saw this one. See `unsentCrisis` above for why
          // the browser's screen gets to speak here and nowhere else.
          setUnsentCrisis(
            baselineRiskScreen.assess(utterance).level === 'high' ? helplinesFor(country) : null,
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [session, busy, voice],
  );

  const stop = useCallback(async () => {
    if (session === null) return;
    voice?.guide.stop();
    try {
      setSession(await api.stopSession(session.id));
    } catch (e: unknown) {
      setError(describe(e));
    }
  }, [session, voice]);

  const rate = useCallback(
    async (rating: (typeof RATINGS)[number]['value']) => {
      if (session === null) return;
      try {
        setSession(await api.rateSession(session.id, rating));
      } catch (e: unknown) {
        setError(describe(e));
      }
    },
    [session],
  );

  if (exhausted !== null) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.question}>That is this week’s full sessions</h1>
        <p className={styles.missing}>{exhausted}</p>
        <div className={styles.actions}>
          <Link href="/session?kind=quick" className={`${styles.button} ${styles.primary}`}>
            Start a quick session
          </Link>
          <Link href="/pricing" className={`${styles.button} ${styles.secondary}`}>
            See the plans
          </Link>
          <Link href="/app" className={`${styles.button} ${styles.secondary}`}>
            Back
          </Link>
        </div>
      </div>
    );
  }

  if (error !== null && session === null) {
    return (
      <div className={styles.screen}>
        <p className={styles.missing} role="alert">
          {error}
        </p>
        <div className={styles.actions}>
          <Link href="/app" className={`${styles.button} ${styles.secondary}`}>
            Back
          </Link>
        </div>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className={styles.screen}>
        <p className={styles.hint}>Starting…</p>
      </div>
    );
  }

  if (session.ended) {
    return session.safety !== null ? (
      <SafetyPause safety={session.safety} />
    ) : (
      <Summary
        session={session}
        onRate={(r) => {
          void rate(r);
        }}
        onFinish={() => {
          router.push('/app/journal');
        }}
      />
    );
  }

  /**
   * What the session already holds, for someone coming back to it.
   *
   * Built from what the server sent, not from anything this screen remembered:
   * a resumed session has no local history, and before this a person carried on
   * with no sign of what they had already told it. The step's own echo
   * ("YOU SAID") covers the turn just taken, so this only shows when there is
   * no echo — coming back, rather than mid-flow.
   */
  const recap = [
    { label: 'What happened', value: session.data.whatHappened },
    {
      label: 'What you felt',
      value:
        session.data.feelings.length === 0
          ? null
          : session.data.feelings.map((id) => LABEL.get(id as FeelingId) ?? id).join(', '),
    },
    { label: 'The belief', value: session.data.belief },
  ].filter((line): line is { label: string; value: string } => {
    return line.value !== null && line.value !== '';
  });

  const onFeelStep = session.step?.id === 'feel';
  const canContinue = onFeelStep ? feelings.length > 0 : answer.trim() !== '';

  return (
    <div className={styles.screen}>
      <div className={styles.exits}>
        <button type="button" className={styles.exit} onClick={() => void stop()}>
          <CloseIcon />
          Leave
        </button>
        {/* Asks the server to screen it, exactly like any other answer. */}
        <button
          type="button"
          className={styles.getHelp}
          onClick={() => void send('I need help, I do not feel safe')}
        >
          Get help
        </button>
      </div>

      <div className={styles.progressBlock}>
        <span className={styles.stepLabel}>
          Step {session.step?.ordinal} of {session.stepCount} · {session.step?.name}
        </span>
        <div className={styles.bars} role="presentation">
          {Array.from({ length: session.stepCount }, (_, i) => (
            <div
              key={i}
              className={`${styles.bar} ${i < (session.step?.ordinal ?? 0) ? styles.barDone : ''}`}
            />
          ))}
        </div>
      </div>

      {session.say === null || session.say === '' ? (
        <p className={styles.missing} ref={questionRef} tabIndex={-1}>
          This step has no question yet. Its copy is still owed by the PRD, so the protocol cannot
          be published.
        </p>
      ) : (
        <p className={styles.question} ref={questionRef} tabIndex={-1}>
          {session.say}
        </p>
      )}

      {lastSaid !== '' || recap.length === 0 ? null : (
        <div className={styles.saidCard}>
          <span className={styles.label}>WHERE YOU GOT TO</span>
          {recap.map((line) => (
            <p key={line.label} className={styles.saidText}>
              <strong>{line.label}:</strong> {line.value}
            </p>
          ))}
        </div>
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

      {error === null ? null : (
        <p className={styles.missing} role="alert">
          {error}
        </p>
      )}

      {unsentCrisis === null || unsentCrisis.length === 0 ? null : (
        /*
         * `role="alert"` on the whole block, not on the sentence alone.
         *
         * Measured before this: nothing on this screen was in a live region at
         * all, so somebody using a screen reader typed that they wanted to kill
         * themselves, the POST died, three phone numbers appeared — and they
         * were told none of it. An alert announces its contents, so the
         * sentence and the numbers arrive together, which is the only useful
         * order for them. Assertive is right here and almost nowhere else: a
         * crisis number is the one thing on this screen that should interrupt.
         */
        <div className={styles.safety} role="alert">
          <p className={styles.safetyBody}>
            That answer has not been sent. If you are in danger right now, these do not need the
            internet.
          </p>
          {unsentCrisis.map((h) => (
            <HelplineLink key={h.number} helpline={h} />
          ))}
        </div>
      )}

      <div className={styles.actions}>
        {/*
          `aria-disabled`, not `disabled`, and this is the screen the rule was
          written for and then not applied to. A `disabled` button leaves the
          tab order, so the focus that was on it has nowhere to go: measured
          here, pressing Continue dropped `document.activeElement` to `<body>`
          while the turn was out, and on a **failed** turn it stayed there —
          there is no advance to move it back, so somebody using a keyboard or
          a screen reader is returned to the top of the document with an error
          on screen.

          The console's Publish and "Mark as reviewed" and the journal's "Load
          older" were all fixed this way and the session screen was not, which
          is the one-place rule applied in one place. The label already changes
          to "Sending…", so the announcement is the button's own name; what
          this adds is that the name changes under the user's focus instead of
          the focus disappearing. `send` refuses while `busy`, and the guard
          below is for the other half of the condition.
        */}
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          aria-disabled={!canContinue || busy}
          onClick={() => {
            if (!canContinue || busy) return;
            if (onFeelStep) {
              void send(feelings.join(' '), feelings.map((id) => LABEL.get(id) ?? id).join(', '));
            } else {
              void send(answer.trim());
            }
          }}
        >
          {busy ? 'Sending…' : 'Continue'}
        </button>
      </div>
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
  session: ApiSession;
  onRate: (r: (typeof RATINGS)[number]['value']) => void;
  onFinish: () => void;
}) {
  const { data } = session;
  const rows = [
    { label: 'WHAT HAPPENED', value: data.whatHappened },
    {
      label: 'WHAT YOU FELT',
      value:
        data.feelings.length > 0
          ? data.feelings.map((id) => LABEL.get(id as FeelingId) ?? id).join(', ')
          : null,
    },
    { label: 'OLD BELIEF', value: data.belief === null ? null : `“${data.belief}”` },
    { label: 'FORGIVENESS', value: data.forgiveness },
  ].filter((r): r is { label: string; value: string } => r.value !== null && r.value !== '');

  // The session ending replaces the whole screen too, so the same argument as
  // `SafetyPause` applies: without this, focus falls to `<body>` and nothing
  // says the session is over.
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);

  return (
    <div className={styles.screen}>
      <span className={styles.summaryBadge}>
        <TickIcon />
        {session.endReason === 'completed' ? 'Session complete' : 'Session saved'}
      </span>
      <h1 className={styles.summaryTitle} ref={title} tabIndex={-1}>
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
 * Rendered entirely from what the server sent: the wording and the helplines
 * come from the protocol version the session ran on, so this screen cannot
 * disagree with the rest of the product about which number to call.
 */
function SafetyPause({ safety }: { safety: NonNullable<ApiSession['safety']> }) {
  /*
   * This screen replaces everything, including the button that was pressed to
   * reach it — so focus falls to `<body>` and a screen reader is told nothing
   * at all. Measured before this fix, on the one screen in the product where
   * that matters most: the person had just said they were not safe, and the
   * three numbers that answer that were on screen, unannounced, with focus at
   * the top of the document.
   *
   * Taking focus here is what says the screen changed, and it reads the title
   * out as it lands. `tabIndex={-1}` keeps the heading out of the tab order —
   * it is a target for this, not a control.
   */
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);

  return (
    <div className={styles.screen}>
      <div className={styles.safety}>
        <h1 className={styles.safetyTitle} ref={title} tabIndex={-1}>
          {safety.title}
        </h1>
        <p className={styles.safetyBody}>{safety.body}</p>

        {safety.helplines.map((h) => (
          <HelplineLink key={h.number} helpline={h} />
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
