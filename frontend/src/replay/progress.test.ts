import { describe, expect, it } from 'vitest';
import { replayProgress } from './progress';

const FROM = '2026-10-22T08:00:00Z';
const TO = '2026-10-22T10:00:00Z';

describe('replayProgress', () => {
  it('is the fraction of the period elapsed', () => {
    expect(replayProgress('2026-10-22T09:00:00Z', FROM, TO)).toBe(0.5);
  });

  it('is clamped to the period', () => {
    expect(replayProgress('2026-10-22T07:00:00Z', FROM, TO)).toBe(0);
    expect(replayProgress('2026-10-22T12:00:00Z', FROM, TO)).toBe(1);
  });

  it('is zero while the period or the time is unknown', () => {
    expect(replayProgress(null, FROM, TO)).toBe(0);
    expect(replayProgress('2026-10-22T09:00:00Z', null, TO)).toBe(0);
    expect(replayProgress('2026-10-22T09:00:00Z', TO, FROM)).toBe(0);
  });
});
