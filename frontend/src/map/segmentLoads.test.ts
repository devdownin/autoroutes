import { describe, expect, it } from 'vitest';
import { diffSegmentLoads } from './segmentLoads';

describe('diffSegmentLoads', () => {
  it('normalises on the 95th percentile and caps at 1', () => {
    const { next } = diffSegmentLoads(new Map(), [
      { segmentId: 'a', vehicles: 10 }, { segmentId: 'b', vehicles: 20 }, { segmentId: 'c', vehicles: 1_000 },
    ]);

    expect(next.get('c')).toBe(1);
    expect(next.get('a')).toBeLessThan(next.get('b') ?? 0);
  });

  it('writes only changed segments and clears those that disappeared', () => {
    const first = diffSegmentLoads(new Map(), [{ segmentId: 'a', vehicles: 10 }, { segmentId: 'b', vehicles: 10 }]);
    const second = diffSegmentLoads(first.next, [{ segmentId: 'a', vehicles: 10 }, { segmentId: 'c', vehicles: 10 }]);

    expect(first.set).toHaveLength(2);
    expect(second.set.map(([id]) => id)).toEqual(['c']);
    expect(second.clear).toEqual(['b']);
  });

  it('clears everything for an empty estimate', () => {
    const first = diffSegmentLoads(new Map(), [{ segmentId: 'a', vehicles: 5 }]);

    expect(diffSegmentLoads(first.next, []).clear).toEqual(['a']);
  });
});
