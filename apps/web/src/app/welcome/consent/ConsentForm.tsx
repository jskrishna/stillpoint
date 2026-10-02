'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CONSENT_ITEMS,
  hasRequiredConsent,
  helplinesFor,
  missingConsent,
  type ConsentId,
} from '@stillpoint/protocol';
import { browserPreferences } from '../../../lib/preferences-store';
import styles from '../welcome.module.css';

/**
 * The consent gate.
 *
 * Whether the user may continue is decided by hasRequiredConsent(), not by this
 * screen: the rule about which items are required belongs to the product, not
 * to whichever component happens to render the checkboxes.
 */
export default function ConsentForm() {
  const [accepted, setAccepted] = useState<readonly ConsentId[]>([]);
  const router = useRouter();

  const emergency = helplinesFor('IN').find((h) => h.kind === 'emergency');
  const helpline = helplinesFor('IN').find((h) => h.kind === 'helpline');

  const toggle = (id: ConsentId) => {
    setAccepted((current) =>
      current.includes(id) ? current.filter((i) => i !== id) : [...current, id],
    );
  };

  const canContinue = hasRequiredConsent(accepted);
  const outstanding = missingConsent(accepted).length;

  const accept = () => {
    browserPreferences.write((p) => ({ ...p, acceptedConsent: accepted }));
    router.push('/welcome/voice');
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
          onClick={accept}
          disabled={!canContinue}
        >
          Continue
        </button>
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
