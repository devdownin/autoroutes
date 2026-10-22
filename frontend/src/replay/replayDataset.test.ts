import { describe, expect, it } from 'vitest';
import { ReplayDataset } from './replayDataset';

const T0 = Date.parse('2026-10-22T06:00:00Z') / 60_000;

const row = (stationId: string, minute: number, entries: number, exits: number) => ({ stationId, t: minute * 60, entries, exits });

describe('ReplayDataset', () => {
  it('computes sliding windows from cumulative sums', () => {
    const dataset = new ReplayDataset(['A', 'B'], T0, T0 + 120, T0 - 600);
    dataset.addRows([row('A', T0, 1, 0), row('A', T0 + 10, 2, 1), row('A', T0 + 59, 4, 4), row('B', T0 + 59, 0, 3), row('X', T0, 9, 9)]);
    dataset.build();

    const [a, b] = dataset.metricsAt(T0 + 59, T0 - 600);

    expect(a?.last5m).toEqual({ entries: 4, exits: 4 });
    expect(a?.last1h).toEqual({ entries: 7, exits: 5 });
    expect(b?.last15m).toEqual({ entries: 0, exits: 3 });
  });

  it('adds the baseline from midnight when the day started before the loaded range', () => {
    const midnight = T0 - 600;
    const dataset = new ReplayDataset(['A'], T0, T0 + 60, midnight);
    dataset.setBaseline([{ stationId: 'A', entries: 100, exits: 90 }]);
    dataset.addRows([row('A', T0 + 1, 1, 1)]);
    dataset.build();

    expect(dataset.metricsAt(T0 + 5, midnight)[0]?.today).toEqual({ entries: 101, exits: 91 });
  });

  it('restarts the daily total when midnight falls inside the replay', () => {
    const midnight = T0 + 30;
    const dataset = new ReplayDataset(['A'], T0, T0 + 60, T0 - 600);
    dataset.addRows([row('A', T0 + 10, 5, 0), row('A', T0 + 40, 2, 0)]);
    dataset.build();

    expect(dataset.metricsAt(T0 + 45, midnight)[0]?.today).toEqual({ entries: 2, exits: 0 });
  });

  it('requires build before reading', () => {
    expect(() => new ReplayDataset(['A'], T0, T0 + 1, T0).metricsAt(T0, T0)).toThrow();
  });
});
