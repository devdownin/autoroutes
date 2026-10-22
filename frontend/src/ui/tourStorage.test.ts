import { describe, expect, it } from 'vitest';
import { TOUR_KEY, hasSeenTour, markTourSeen } from './tourStorage';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};

const blocked = {
  getItem: (): string | null => { throw new Error('SecurityError'); },
  setItem: (): void => { throw new Error('SecurityError'); },
};

describe('tourStorage', () => {
  it('remembers a finished tour', () => {
    const storage = memory();
    expect(hasSeenTour(storage)).toBe(false);

    markTourSeen(storage);

    expect(hasSeenTour(storage)).toBe(true);
    expect(storage.getItem(TOUR_KEY)).toBe('done');
  });

  it('offers the tour again, without failing, when storage is unavailable', () => {
    expect(hasSeenTour(blocked)).toBe(false);
    expect(() => { markTourSeen(blocked); }).not.toThrow();
  });
});
