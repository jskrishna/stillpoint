import Link from 'next/link';
import { STEP_COUNT, STEP_LIST, helplinesFor, step } from '@stillpoint/protocol';
import styles from './page.module.css';

/**
 * The landing page.
 *
 * "How it works" and the crisis numbers are read from @stillpoint/protocol
 * rather than retyped, so the marketing claim and the running product cannot
 * disagree about the steps or about which helpline to call.
 */
export default function Landing() {
  const helplines = helplinesFor('IN');
  const first = step('notice');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}>
          Stillpoint
        </Link>
        <nav className={styles.nav}>
          <a href="#how" className={styles.navLink}>
            How it works
          </a>
          <a href="#safety" className={styles.navLink}>
            Safety
          </a>
          <Link href="/pricing" className={styles.navLink}>
            Pricing
          </Link>
          <Link href="/session" className={`${styles.button} ${styles.primary} ${styles.compact}`}>
            Start free
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>Upset about something? Talk it through.</h1>
          <p className={styles.heroLead}>
            Stillpoint is a voice guide that helps you calm down and understand why something hurt,
            in {STEP_COUNT} simple steps.
          </p>
          <Link href="/session" className={`${styles.button} ${styles.primary}`}>
            Start a free session
          </Link>
          <span className={styles.disclaimer}>
            Not therapy or medical advice. You can stop any time.
          </span>
        </div>

        <div className={styles.phoneWrap}>
          <div className={styles.phone} aria-hidden="true">
            <span className={styles.stepLabel}>
              Step 1 of {STEP_COUNT} · {first.name}
            </span>
            <div className={styles.progress}>
              <div className={styles.progressFill} style={{ flexGrow: 1 }} />
              <div className={styles.progressRest} style={{ flexGrow: STEP_COUNT - 1 }} />
            </div>
            <p className={styles.stepQuestion}>{first.prompts.main}</p>
            <div className={styles.mic}>
              <span className={styles.micDot}>
                <MicIcon />
              </span>
              <span className={styles.micLabel}>Hold to talk</span>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className={`${styles.section} ${styles.onPanel}`}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <div className={styles.steps}>
          {STEP_LIST.map((s) => (
            <div key={s.id} className={styles.step}>
              <span className={styles.stepNumber}>{s.ordinal}</span>
              <strong className={styles.stepName}>{s.name}</strong>
              <span className={styles.stepSummary}>{s.summary}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="safety" className={styles.section}>
        <h2 className={styles.sectionTitle}>Your safety comes first</h2>
        <p className={styles.safetyBody}>
          If you say something that shows you may be in danger, the session stops and we show
          helplines right away. We never store your voice.
        </p>
        <ul className={styles.helplines}>
          {helplines.map((h) => (
            <li key={h.number} className={styles.helpline}>
              <span>{h.name}</span>
              <a href={`tel:${h.number}`} className={styles.helplineNumber}>
                {h.number}
              </a>
              <span className={styles.disclaimer}>{h.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className={styles.footer}>
        <span>© Stillpoint · Not medical advice.</span>
        <span>{helplines.map((h) => `${h.name}: ${h.number}`).join(' · ')}</span>
      </footer>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: 'var(--sp-color-accent-ink)' }}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}
