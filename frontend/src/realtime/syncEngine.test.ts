import { describe, expect, it } from 'vitest';
import { StationStore } from '../state/stationStore';
import { delta, metrics, snapshot } from '../test-fixtures';
import { SyncEngine } from './syncEngine';

const setup = () => {
  const store = new StationStore(['A', 'B']);
  return { store, sync: new SyncEngine(store) };
};

describe('SyncEngine', () => {
  it('applies contiguous deltas after the snapshot', () => {
    const { store, sync } = setup();
    sync.onSnapshot(snapshot(10, [metrics('A', 1)]));

    expect(sync.onDelta(delta(11, [metrics('A', 2)]))).toEqual({ kind: 'applied' });
    expect(sync.onDelta(delta(12, [metrics('B', 5)]))).toEqual({ kind: 'applied' });
    expect(store.entries1h[0]).toBe(2);
    expect(store.entries1h[1]).toBe(5);
    expect(sync.lastEventId).toBe('e1:12');
  });

  it('ignores deltas already applied (replay after reconnection)', () => {
    const { store, sync } = setup();
    sync.onSnapshot(snapshot(10, [metrics('A', 7)]));

    expect(sync.onDelta(delta(10, [metrics('A', 99)]))).toEqual({ kind: 'ignored' });
    expect(store.entries1h[0]).toBe(7);
  });

  it.each([
    ['gap', delta(13, []), 'gap'],
    ['other epoch', delta(11, [], 'e2'), 'epoch'],
  ] as const)('requires a snapshot on %s', (_, message, reason) => {
    const { sync } = setup();
    sync.onSnapshot(snapshot(10, []));

    expect(sync.onDelta(message)).toEqual({ kind: 'resync', reason });
    expect(sync.lastEventId).toBeNull();
  });

  it('requires a snapshot when a delta arrives first', () => {
    const { sync } = setup();
    expect(sync.onDelta(delta(1, []))).toEqual({ kind: 'resync', reason: 'no-snapshot' });
  });
});
