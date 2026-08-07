import { describe, it, expect } from 'vitest';
import {
  buildLineItems, lineItemsTotal, computeSettlementSchedule, computeCommission, SETTLEMENT_MATRIX, dueTranches,
} from '../src/utils/settlement.js';

describe('settlement — line items (§04)', () => {
  it('builds service + registration_fee (pass-through, no commission) + add-on lines', () => {
    const lines = buildLineItems({
      serviceName: 'Little Steps Ballet', serviceAmount: 3200, registrationFee: 500,
      addOns: [{ label: 'Face painting', amount: 2500, vendor: 'vendor_x' }],
    });
    expect(lines.map((l) => l.type)).toEqual(['service', 'registration_fee', 'addon']);
    const reg = lines.find((l) => l.type === 'registration_fee');
    expect(reg.passThrough).toBe(true);
    expect(reg.commissionable).toBe(false);
    expect(reg.refundableBeforeSession1Only).toBe(true);
    expect(lines.find((l) => l.type === 'addon').vendor).toBe('vendor_x'); // 3rd-party settles to its own vendor
    expect(lineItemsTotal(lines)).toBe(6200);
  });

  it('drops zero/absent add-ons and omits a zero registration fee', () => {
    const lines = buildLineItems({ serviceName: 'X', serviceAmount: 1000, registrationFee: 0, addOns: [{ label: 'z', amount: 0 }] });
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('service');
  });
});

describe('settlement — schedule matrix (§04)', () => {
  it('Bloom: 100% at T+3 from payment', () => {
    const s = computeSettlementSchedule('bloom', 3200, { payment: '2026-08-10' });
    expect(s).toHaveLength(1);
    expect(s[0].amount).toBe(3200);
    expect(s[0].releaseDate).toBe('2026-08-13');
  });

  it('Adventure: 50% at booking+3, 50% at event+3', () => {
    const s = computeSettlementSchedule('adventure', 8500, { booking: '2026-08-10', event: '2026-09-01' });
    expect(s).toHaveLength(2);
    expect(s[0].amount + s[1].amount).toBe(8500); // exact, no lost paise
    expect(s[0].releaseDate).toBe('2026-08-13');
    expect(s[1].releaseDate).toBe('2026-09-04');
  });

  it('Care: 100% at T+1 after confirmation', () => {
    const s = computeSettlementSchedule('care', 1200, { confirmation: '2026-08-10' });
    expect(s[0].amount).toBe(1200);
    expect(s[0].releaseDate).toBe('2026-08-11');
  });

  it('odd totals split without losing a rupee (last tranche absorbs remainder)', () => {
    const s = computeSettlementSchedule('adventure', 4501, { booking: '2026-08-10', event: '2026-08-20' });
    expect(s[0].amount + s[1].amount).toBe(4501);
    expect(s[0].amount).toBe(2251); // round(4501*0.5)=2251 (banker-free Math.round)
    expect(s[1].amount).toBe(2250);
  });

  it('pilot commission is 0% → net to provider equals the tranche amount', () => {
    expect(computeCommission(3200)).toBe(0);
    const s = computeSettlementSchedule('bloom', 3200, { payment: '2026-08-10' });
    expect(s[0].netToProvider).toBe(3200);
  });

  it('commission knob flips settlement without touching the flow', () => {
    const s = computeSettlementSchedule('bloom', 1000, { payment: '2026-08-10' }, { commissionRate: 0.1 });
    expect(s[0].commission).toBe(100);
    expect(s[0].netToProvider).toBe(900);
  });

  it('unknown category returns no schedule', () => {
    expect(computeSettlementSchedule('nope', 100, {})).toEqual([]);
    expect(Object.keys(SETTLEMENT_MATRIX)).toEqual(['bloom', 'adventure', 'care', 'discover']);
  });
});

describe('settlement — payout run selection', () => {
  const rows = [
    { id: 'a', status: 'scheduled', release_date: '2026-08-05' }, // due
    { id: 'b', status: 'scheduled', release_date: '2026-08-08' }, // due (== asOf)
    { id: 'c', status: 'scheduled', release_date: '2026-09-01' }, // future
    { id: 'd', status: 'released', release_date: '2026-08-01' },  // already released
    { id: 'e', status: 'scheduled', release_date: null },          // no date
  ];
  it('releases only scheduled tranches on or before the run date', () => {
    const due = dueTranches(rows, '2026-08-08');
    expect(due.map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('nothing is due before the earliest release date', () => {
    expect(dueTranches(rows, '2026-08-04')).toHaveLength(0);
  });
});
