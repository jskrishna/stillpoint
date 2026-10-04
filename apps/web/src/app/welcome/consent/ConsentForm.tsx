'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CONSENT_ITEMS,
  hasRequiredConsent,
  DEFAULT_COUNTRY,
  helplinesFor,
  missingConsent,
  type ConsentId,
} from '@stillpoint/protocol';
import { ApiError, api } from '../../../lib/api';
import styles from '../welcome.module.css';

/**
 * The consent gate.
 *
 * Whether the user may continue is decided by hasRequiredConsent(), not by this
 * screen: the rule about which items are required belongs to the product, not
 * to whichever component happens to render the checkboxes.
 *
 * The same rule is enforced again on the server, which refuses to start a
 * session without consent. This screen's job is to ask and to record; it is not
 * what stops an unconsented session, because a screen never can be.
 */
export default function ConsentForm() {
  const [accepted, setAccepted] = useState<readonly ConsentId[]>([]);
  /**
   * Whose crisis numbers to print. It was `helplinesFor('IN')`, written when
   * India was the only market, so after Canada became the first one this
   * screen told a Canadian "If you are in danger, call 112 or Tele-MANAS
   * 14416" — two numbers that do not answer where they are. A wrong crisis
   * number is worse than none, and this is the screen that says it before
   * anybody starts.
   *
   * `DEFAULT_COUNTRY` until the account answers, because that is also what the
   * column defaults to, so the two cannot disagree.
   */
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  const router = useRouter();

  // Someone returning to this screen has already agreed to some of it.
  //
  // The reply is dropped if the user has started ticking boxes: the fetch
  // finishes after the first paint, and applying it then would uncheck what
  // they had just checked.
  useEffect(() => {
    api
      .me()
      .then((profile) => {
        if (touched.current) return;
        // Keep only ids this build still asks about, so a stored id the product
        // has since dropped cannot reappear as a checkbox.
        setAccepted(
          CONSENT_ITEMS.filter((i) => profile.acceptedConsent.includes(i.id)).map((i) => i.id),
        );
        // The country this screen's crisis numbers come from. It was already
        // being fetched here and thrown away.
        setCountry(profile.country);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.isUnauthenticated) router.push('/welcome');
      });
  }, [router]);

  const helplines = helplinesFor(country);
  const emergency = helplines.find((h) => h.kind === 'emergency');
  const helpline = helplines.find((h) => h.kind === 'helpline');

  const toggle = (id: ConsentId) => {
    touched.current = true;
    setAccepted((current) =>
      current.includes(id) ? current.filter((i) => i !== id) : [...current, id],
    );
  };

  const canContinue = hasRequiredConsent(accepted);
  const outstanding = missingConsent(accepted).length;

  const accept = async () => {
    if (!canContinue || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.consent(accepted);
      router.push('/welcome/voice');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.isUnauthenticated) {
        router.push('/welcome');
        return;
      }
      setError('Could not save that. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.screen}>
      <Link href="/welcome" className={styles.back}>
        ← Back
      </Link>
      <h1 className={styles.title}>Before we start</h1>

      <p className={styles.notice}>
        <strong>This is not therapy or medical advice.</strong> If you are in danger, call{' '}
        {emergency?.number} or {helpline?.name.replace(' helpline', '')} {helpline?.number}.
      </p>

      <div className={styles.choices}>
        {CONSENT_ITEMS.map((item) => (
          <label key={item.id} className={styles.check}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={accepted.includes(item.id)}
              onChange={() => {
                toggle(item.id);
              }}
            />
            {item.text}
          </label>
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={() => {
            void accept();
          }}
          disabled={!canContinue || busy}
        >
          {busy ? 'Saving…' : 'Continue'}
        </button>
        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {canContinue ? null : (
          <p className={styles.blocked}>
            {outstanding === 1
              ? 'One more thing to agree to before you can start.'
              : 'Please agree to both before you start.'}
          </p>
        )}
      </div>
    </div>
  );
}
