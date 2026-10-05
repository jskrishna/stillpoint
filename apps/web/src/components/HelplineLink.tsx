import styles from './HelplineLink.module.css';

/**
 * One crisis number, dialable.
 *
 * **One rendering of a phone number per surface**, which is the rule in
 * `CLAUDE.md` — "two renderings is two places for one of them to stop being a
 * `tel:` link". It lived inside `session/SessionFlow.tsx`, which made that true
 * of one file rather than of the surface: the settings screen could not use it,
 * and so had no crisis numbers at all while the phone's settings screen has had
 * them all along.
 *
 * `tel:` on a desktop hands the number to whatever the operating system has
 * registered, which `apps/desktop` allows on purpose — `tel:` is one of the
 * four schemes its `openExternal` guard passes through, and the reason given
 * there is this component.
 */
export default function HelplineLink({
  helpline,
}: {
  helpline: {
    readonly name: string;
    readonly number: string;
    readonly detail: string;
    readonly kind: string;
  };
}) {
  return (
    <a
      href={`tel:${helpline.number}`}
      className={`${styles.helpline} ${
        helpline.kind === 'emergency' ? styles.helplineEmergency : styles.helplineMain
      }`}
    >
      <span className={styles.helplineText}>
        <span className={styles.helplineName}>{helpline.name}</span>
        <span className={styles.helplineDetail}>{helpline.detail}</span>
      </span>
      <span className={styles.helplineNumber}>{helpline.number}</span>
    </a>
  );
}
