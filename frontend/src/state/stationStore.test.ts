import { describe, expect, it, vi } from 'vitest';
import { metrics } from '../test-fixtures';
import { StationStore } from './stationStore';

describe('StationStore', () => {
  it('writes columns by referential index and marks changed stations', () => {
    const store = new StationStore(['A', 'B', 'C']);
    store.replaceAll([metrics('B', 40, 30, 500)]);

    expect(store.entries1h[1]).toBe(40);
    expect(store.exits1h[1]).toBe(30);
    expect(store.drainChanged().sort()).toEqual([0, 1, 2]);
    expect(store.drainChanged()).toEqual([]);
  });

  it('computes new passages from the daily total, never from a snapshot', () => {
    const store = new StationStore(['A']);
    store.replaceAll([metrics('A', 10, 10, 100)]);
    expect(store.increment[0]).toBe(0);

    store.applyDelta([metrics('A', 10, 10, 103)]);
    expect(store.increment[0]).toBe(6);
  });

  it('treats the midnight reset as no activity', () => {
    const store = new StationStore(['A']);
    store.replaceAll([metrics('A', 10, 10, 100)]);
    store.applyDelta([metrics('A', 10, 10, 1)]);

    expect(store.increment[0]).toBe(0);
  });

  it('counts station ids missing from the loaded referential', () => {
    const store = new StationStore(['A']);
    store.applyDelta([metrics('Z')]);

    expect(store.unknownStationCount).toBe(1);
    expect(store.drainChanged()).toEqual([]);
  });

  it('notifies subscribers once per snapshot or delta', () => {
    const store = new StationStore(['A']);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.replaceAll([]);
    store.applyDelta([metrics('A')]);
    unsubscribe();
    store.applyDelta([metrics('A')]);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.version).toBe(3);
  });
});
