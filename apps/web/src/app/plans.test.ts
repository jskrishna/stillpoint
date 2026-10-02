import { describe, expect, it } from 'vitest';
import { PLANS, priceLabel, type Plan } from './plans.js';

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

  it('prices in rupees, as the designs do', () => {
    expect(PLANS.every((p) => p.currency === 'INR')).toBe(true);
  });
});

describe('priceLabel', () => {
  it('shows Free as ₹0', () => {
    expect(priceLabel(PLANS[0]!)).toBe('₹0');
  });

  it('shows the designs’ placeholder for a price nobody has set', () => {
    // Deliberate: a placeholder rendered as a number would be a price the
    // product never agreed to.
    expect(priceLabel(PLANS[1]!)).toBe('[PRICE]/mo');
    expect(priceLabel(PLANS[2]!)).toBe('[PRICE]/mo');
  });

  it('formats a set price in rupees once one exists', () => {
    const plan: Plan = { ...PLANS[1]!, priceMinor: 49900 };
    expect(priceLabel(plan)).toBe('₹499/mo');
  });

  it('groups large amounts the Indian way', () => {
    const plan: Plan = { ...PLANS[2]!, priceMinor: 250000 };
    expect(priceLabel(plan)).toBe('₹2,500/mo');
  });
});
