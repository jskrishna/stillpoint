import Link from 'next/link';
import type { Metadata } from 'next';
import { PLANS, priceLabel } from '../plans';
import styles from './pricing.module.css';

export const metadata: Metadata = {
  title: 'Pricing — Stillpoint',
  description: 'Simple pricing. Help in a crisis is always free.',
};

export default function Pricing() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}>
          Stillpoint
        </Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Simple pricing</h1>
        <p className={styles.lead}>Help in a crisis is always free.</p>

        <div className={styles.plans}>
          {PLANS.map((plan) => {
            const label = priceLabel(plan);
            const unset = plan.priceMinor === null;
            return (
              <section
                key={plan.id}
                className={`${styles.plan} ${plan.featured ? styles.featured : ''}`}
                aria-labelledby={`plan-${plan.id}`}
              >
                <h2 id={`plan-${plan.id}`} className={styles.planName}>
                  {plan.name}
                </h2>
                <span className={`${styles.price} ${unset ? styles.unset : ''}`}>{label}</span>
                <span className={styles.tagline}>{plan.tagline}</span>
                <ul className={styles.features}>
                  {plan.features.map((feature) => (
                    <li key={feature} className={styles.feature}>
                      <TickIcon />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/"
                  className={`${styles.cta} ${plan.featured ? styles.ctaFeatured : ''}`}
                >
                  {plan.cta}
                </Link>
              </section>
            );
          })}
        </div>
      </main>
    </div>
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
      className={styles.tick}
    >
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
