import { describe, expect, it } from 'vitest';
import { parisMidnight, parisOffsetMs } from './parisTime';

describe('heure de Paris', () => {
  it('gives the summer and winter offsets', () => {
    expect(parisOffsetMs(new Date('2026-07-01T12:00:00Z'))).toBe(2 * 3_600_000);
    expect(parisOffsetMs(new Date('2026-12-01T12:00:00Z'))).toBe(3_600_000);
  });

  it('finds midnight in Paris, including across the UTC date line and on DST days', () => {
    expect(parisMidnight(new Date('2026-10-22T08:00:00Z')).toISOString()).toBe('2026-10-21T22:00:00.000Z');
    expect(parisMidnight(new Date('2026-10-22T23:30:00Z')).toISOString()).toBe('2026-10-22T22:00:00.000Z');
    // 25/10/2026 : passage à l'heure d'hiver ; minuit est encore à l'heure d'été (UTC+2).
    expect(parisMidnight(new Date('2026-10-25T20:00:00Z')).toISOString()).toBe('2026-10-24T22:00:00.000Z');
    // 29/03/2026 : passage à l'heure d'été ; minuit est encore à l'heure d'hiver (UTC+1).
    expect(parisMidnight(new Date('2026-03-29T20:00:00Z')).toISOString()).toBe('2026-03-28T23:00:00.000Z');
  });
});
