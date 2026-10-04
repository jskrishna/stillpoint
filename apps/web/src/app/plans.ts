/**
 * The three plans, as the pricing page states them.
 *
 * ## The prices
 *
 * **CAD, because Canada is the first market**, and set deliberately at the
 * bottom of the category. Measured against what the comparable apps charge
 * (USD, at 1.43 to the Canadian dollar): Calm ~$24 CAD a month, Headspace
 * ~$19, Wysa ~$14, Finch ~$14-17, Sanvello ~$13. Stillpoint is not Calm or
 * Headspace — those are large content libraries with large brands — it is in
 * the Finch and Sanvello band, and it undercuts the bottom of it.
 *
 * Not lower than this on purpose. In this category a price is also a signal
 * about whether the thing is real, and ₹-equivalent pocket change reads as
 * nothing worth trusting with what somebody types into it.
 *
 * The yearly figures are here and the pricing page does not show them yet: the
 * page is the earlier build and is waiting on a rebuild, and adding a toggle
 * to it now would be work thrown away. The rebuild gets the numbers for free.
 *
 * Pricing lives here and not in `packages/protocol` or `App\Domain\Plan`,
 * which own what a plan *allows*. There is no billing yet, and putting an
 * amount in the domain would imply one.
 */

export interface Plan {
  readonly id: 'free' | 'plus' | 'coach';
  readonly name: string;
  /** Amount in the smallest currency unit, or `null` when not yet set. */
  readonly priceMinor: number | null;
  /** The same per year, for the rebuild to show. `null` when there is none. */
  readonly priceYearlyMinor: number | null;
  readonly currency: 'CAD';
  readonly tagline: string;
  readonly features: readonly string[];
  readonly cta: string;
  /** The plan the pricing page highlights. */
  readonly featured: boolean;
}

/**
 * The three plans, as the pricing page shows them.
 *
 * **`features` is marketing copy, not a capability list, and four of its nine
 * lines are not what the plan controls.** Read against the code: `plan` is
 * consulted in exactly two places in the API — the session allowance and the
 * profile response — and `App\Domain\Plan` decides exactly one thing, full
 * sessions a week.
 *
 * So `Insights` is not gated (`GET /insights` has no plan check, and a Free
 * account has them), `Better voices` is not gated (both voices are offered to
 * everyone), `Up to 25 clients` is deliberately unenforced, and
 * `Shared sessions and notes` is backwards: the coach portal is gated by
 * `role`, so the Coach plan grants nothing and the `coach` role grants the
 * whole portal on Free. The `cta` strings offer a trial that exists in no
 * form.
 *
 * Nobody can be charged — there is no billing — so nothing is mis-sold today,
 * and this is a note rather than a change because both ways of fixing it are
 * product decisions: gating Insights takes something away from everybody who
 * has it, and changing the copy changes what Plus is for. `LAUNCH.md` item 7
 * has the line-by-line and `DECISIONS.md` has the decision. **Do not treat a
 * tick on that page as a rule the server keeps**; `Plan` is where the rules
 * are.
 */
export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceMinor: 0,
    priceYearlyMinor: null,
    currency: 'CAD',
    tagline: 'For trying it out',
    features: ['3 full sessions a week', 'Unlimited quick sessions', 'Journal'],
    cta: 'Start free',
    featured: false,
  },
  {
    id: 'plus',
    name: 'Plus',
    priceMinor: 599,
    priceYearlyMinor: 3999,
    currency: 'CAD',
    tagline: 'For regular use',
    features: ['Unlimited sessions', 'Insights', 'Better voices'],
    cta: 'Try 7 days free',
    featured: true,
  },
  {
    id: 'coach',
    name: 'Coach',
    // A different buyer: a professional tool, and still less than one client
    // session. "Up to 25 clients" is stated by the designs and deliberately
    // not enforced — see `DECISIONS.md`.
    priceMinor: 1999,
    priceYearlyMinor: 14999,
    currency: 'CAD',
    tagline: 'For coaches',
    features: ['Everything in Plus', 'Up to 25 clients', 'Shared sessions and notes'],
    cta: 'Start coach trial',
    featured: false,
  },
];

/**
 * Formats an amount in a plan's currency.
 *
 * Through `Intl`, so the symbol and the separators come from the currency
 * rather than from a template — this file hard-coded `₹` when the first market
 * was India, which is the kind of thing that has to be found by reading rather
 * than by failing.
 */
function money(minor: number, currency: Plan['currency']): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/** Formats a plan's monthly price, or the placeholder when there is none. */
export function priceLabel(plan: Plan): string {
  if (plan.priceMinor === null) return '[PRICE]/mo';
  if (plan.priceMinor === 0) return money(0, plan.currency);

  return `${money(plan.priceMinor, plan.currency)}/mo`;
}

/**
 * Formats a plan's yearly price with what it saves, or `null` for a plan that
 * has no yearly figure. Nothing renders this yet; see the note at the top.
 */
export function yearlyLabel(plan: Plan): string | null {
  if (plan.priceYearlyMinor === null || plan.priceMinor === null || plan.priceMinor === 0) {
    return null;
  }

  const saved = Math.round((1 - plan.priceYearlyMinor / (plan.priceMinor * 12)) * 100);

  return `${money(plan.priceYearlyMinor, plan.currency)}/yr · save ${String(saved)}%`;
}
