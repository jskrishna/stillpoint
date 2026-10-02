import { STEP_LIST } from '@stillpoint/protocol';
import { openFlags } from '@stillpoint/protocol';
import { OVERVIEW, RECENT_SESSIONS, SAFETY_FLAGS, STEP_REACH } from '../../lib/admin-data';
import styles from './admin.module.css';

export default function Overview() {
  const open = openFlags(SAFETY_FLAGS).length;

  return (
    <>
      <h1 className={styles.title}>Overview</h1>
      <p className={styles.sub}>Last {OVERVIEW.windowDays} days · sample data</p>

      <div className={styles.stats}>
        <Stat value={OVERVIEW.sessions.toLocaleString('en-IN')} label="sessions" />
        <Stat value={`${String(OVERVIEW.reachedFinalStepPct)}%`} label="reached step 6" />
        <Stat value={`${String(OVERVIEW.feltCalmerPct)}%`} label="felt calmer" />
        <Stat value={String(open)} label="open safety flags" />
      </div>

      <span className={styles.label}>HOW FAR PEOPLE GET</span>
      <div className={styles.funnel}>
        {STEP_LIST.map((step, i) => {
          const reach = STEP_REACH[i] ?? 0;
          return (
            <div key={step.id} className={styles.funnelRow}>
              <span className={styles.funnelName}>Step {step.ordinal}</span>
              <span className={styles.funnelTrack}>
                <span className={styles.funnelFill} style={{ width: `${String(reach)}%` }} />
              </span>
              <span className={styles.funnelCount}>{reach}</span>
            </div>
          );
        })}
      </div>

      <span className={styles.label}>RECENT SESSIONS</span>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>User</th>
            <th className={styles.th}>Type</th>
            <th className={styles.th}>Reached</th>
            <th className={styles.th}>Result</th>
          </tr>
        </thead>
        <tbody>
          {RECENT_SESSIONS.map((s) => (
            <tr key={s.user}>
              <td className={styles.td}>{s.user}</td>
              <td className={styles.td}>
                {s.kind} · {s.minutes} min
              </td>
              <td className={styles.td}>Step {s.reachedStep}</td>
              <td className={styles.td}>
                <span className={`${styles.tag} ${s.result === 'Safety' ? styles.tagHigh : ''}`}>
                  {s.result}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
