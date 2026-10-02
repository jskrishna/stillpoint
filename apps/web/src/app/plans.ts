/**
 * The three plans, as the pricing page states them.
 *
 * Prices are `null`: the designs show "[PRICE]/mo" placeholders for Plus and
 * Coach, so the real figures are not yet set. A placeholder rendered as a
 * number would be a price the product never agreed to.
 */

export interface Plan {
  readonly id: 'free' | 'plus' | 'coach';
  readonly name: string;
  /** Amount in the smallest currency unit, or `null` when not yet set. */
  readonly priceMinor: number | null;
  readonly currency: 'INR';
  readonly tagline: string;
  readonly features: readonly string[];
  readonly cta: string;
  /** The plan the pricing page highlights. */
  readonly featured: boolean;
}

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceMinor: 0,
    currency: 'INR',
    tagline: 'For trying it out',
    features: ['3 full sessions a week', 'Unlimited quick sessions', 'Journal'],
    cta: 'Start free',
    featured: false,
  },
  {
    id: 'plus',
    name: 'Plus',
    priceMinor: null,
    currency: 'INR',
    tagline: 'For regular use',
    features: ['Unlimited sessions', 'Insights', 'Better voices'],
    cta: 'Try 7 days free',
    featured: true,
  },
  {
    id: 'coach',
    name: 'Coach',
    priceMinor: null,
    currency: 'INR',
    tagline: 'For coaches',
    features: ['Everything in Plus', 'Up to 25 clients', 'Shared sessions and notes'],
    cta: 'Start coach trial',
    featured: false,
  },
];

/** Formats a plan's price, or the placeholder the designs show. */
export function priceLabel(plan: Plan): string {
  if (plan.priceMinor === null) return '[PRICE]/mo';
  if (plan.priceMinor === 0) return '₹0';
  return `₹${(plan.priceMinor / 100).toLocaleString('en-IN')}/mo`;
}
