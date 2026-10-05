import { describe, expect, it } from 'vitest';
import { PLAN_IDS, PLAN_LABEL } from '@stillpoint/protocol';
import { PLANS, priceLabel, yearlyLabel, type Plan } from './plans.js';

describe('plans', () => {
  it('offers the three plans the pricing page shows', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['free', 'plus', 'coach']);
  });

  it('highlights exactly one plan', () => {
    expect(PLANS.filter((p) => p.featured)).toHaveLength(1);
    expect(PLANS.find((p) => p.featured)?.id).toBe('plus');
  });

  it('gives every plan a tagline, a call to action and features', () => {
    for (const plan of PLANS) {
      expect(plan.tagline).not.toBe('');
      expect(plan.cta).not.toBe('');
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });

  it('prices in Canadian dollars, because Canada is the first market', () => {
    expect(PLANS.every((p) => p.currency === 'CAD')).toBe(true);
  });

  it('prices Plus and Coach, and Free at nothing', () => {
    expect(PLANS.find((p) => p.id === 'free')?.priceMinor).toBe(0);
    expect(PLANS.find((p) => p.id === 'plus')?.priceMinor).toBe(599);
    expect(PLANS.find((p) => p.id === 'coach')?.priceMinor).toBe(1999);
  });

  /**
   * Below the band it sits in, which is the point. Measured in CAD against the
   * comparable apps: Sanvello ~$13 a month, Wysa ~$14, Finch ~$14-17. If this
   * ever rises past them, that is a decision somebody should have made on
   * purpose.
   */
  it('undercuts the category it is in', () => {
    const plus = PLANS.find((p) => p.id === 'plus')?.priceMinor ?? 0;
    expect(plus).toBeLessThan(1300);
    // And not so low that the price stops saying the thing is real.
    expect(plus).toBeGreaterThanOrEqual(499);
  });

  it('gives the paid plans a yearly price that saves something', () => {
    for (const plan of PLANS.filter((p) => p.priceMinor !== 0)) {
      expect(plan.priceYearlyMinor, plan.id).not.toBeNull();
      expect(plan.priceYearlyMinor ?? 0, plan.id).toBeLessThan((plan.priceMinor ?? 0) * 12);
    }
  });

  it('gives Free no yearly price, because there is nothing to pay', () => {
    expect(PLANS.find((p) => p.id === 'free')?.priceYearlyMinor).toBeNull();
  });
});

describe('priceLabel', () => {
  it('shows Free as nothing to pay', () => {
    expect(priceLabel(PLANS[0]!)).toBe('$0');
  });

  it('formats the monthly price in Canadian dollars', () => {
    expect(priceLabel(PLANS[1]!)).toBe('$5.99/mo');
    expect(priceLabel(PLANS[2]!)).toBe('$19.99/mo');
  });

  /**
   * The placeholder is still here, because it is still the right answer for a
   * price nobody has set — a placeholder rendered as a number would be a price
   * the product never agreed to. Plus and Coach have figures now; anything
   * added later starts at `null`.
   */
  it('still shows the designs’ placeholder for a price nobody has set', () => {
    const unset: Plan = { ...PLANS[1]!, priceMinor: null };
    expect(priceLabel(unset)).toBe('[PRICE]/mo');
  });

  it('drops the cents on a whole amount', () => {
    const plan: Plan = { ...PLANS[1]!, priceMinor: 1200 };
    expect(priceLabel(plan)).toBe('$12/mo');
  });
});

describe('yearlyLabel', () => {
  it('shows the yearly price and what it saves', () => {
    expect(yearlyLabel(PLANS[1]!)).toBe('$39.99/yr · save 44%');
    expect(yearlyLabel(PLANS[2]!)).toBe('$149.99/yr · save 37%');
  });

  it('has nothing to show for Free', () => {
    expect(yearlyLabel(PLANS[0]!)).toBeNull();
  });

  it('has nothing to show when the monthly price is unset', () => {
    const unset: Plan = { ...PLANS[1]!, priceMinor: null };
    expect(yearlyLabel(unset)).toBeNull();
  });
});

describe('the pricing page’s names', () => {
  /*
   * They are the protocol's, not a second set.
   *
   * `PLAN_LABEL` was added for the settings screens, which had each invented
   * their own mapping from plan id to plan name and each got it wrong. The
   * names it uses are the ones this file has always shown on `/pricing`, and
   * this is what stops the two becoming two answers to "what is this plan
   * called".
   */
  it('match the protocol’s labels', () => {
    for (const plan of PLANS) {
      expect(plan.name).toBe(PLAN_LABEL[plan.id]);
    }
  });

  it('cover every plan the protocol has', () => {
    expect(PLANS.map((p) => p.id).sort()).toEqual([...PLAN_IDS].sort());
  });
});
