import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_OD_FILTERS, EMPTY_OD_VIEW } from '../od/odTypes';
import type { OdFilters } from '../od/odTypes';
import { StationStore } from '../state/stationStore';
import { ReplaySession } from './replaySession';
import type { HistoryApi } from './replaySession';

const NOW = Date.parse('2026-10-22T10:00:00Z');
const FROM = new Date('2026-10-22T08:00:00Z');

const api = (): HistoryApi & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    totals: vi.fn((from: Date, to: Date) => {
      calls.push(`totals ${from.toISOString()} ${to.toISOString()}`);
      return Promise.resolve([{ stationId: 'A', entries: 50, exits: 40 }]);
    }),
    minutes: vi.fn((from: Date, to: Date) => {
      calls.push(`minutes ${from.toISOString()} ${to.toISOString()}`);
      const minute = FROM.getTime() / 1000 + 120;
      return Promise.resolve(from.getTime() <= minute * 1000 && minute * 1000 < to.getTime()
        ? [{ stationId: 'A', t: minute, entries: 3, exits: 1 }] : []);
    }),
    odFlows: vi.fn((from: Date, to: Date, filters: OdFilters) => {
      calls.push(`od ${to.getTime() - from.getTime()} ${filters.level} ${filters.department}`);
      return Promise.resolve(EMPTY_OD_VIEW);
    }),
  };
};

describe('ReplaySession', () => {
  it('rejects ranges outside the minute retention or not yet finished', () => {
    expect(ReplaySession.validate({ from: new Date(NOW - 8 * 86_400_000), durationMinutes: 60, speed: 60 }, NOW)).toMatch(/7 derniers jours/);
    expect(ReplaySession.validate({ from: new Date(NOW - 30 * 60_000), durationMinutes: 60, speed: 60 }, NOW)).toMatch(/passée/);
    expect(ReplaySession.validate({ from: FROM, durationMinutes: 60, speed: 60 }, NOW)).toBeNull();
  });

  it('loads in bounded chunks with a midnight baseline and replays into the store', async () => {
    const store = new StationStore(['A']);
    const history = api();
    const statuses: string[] = [];
    const session = new ReplaySession(store, {
      onData: vi.fn(), onTime: vi.fn(), onOd: vi.fn(), odFilters: () => DEFAULT_OD_FILTERS, onStatus: (s) => statuses.push(s),
    }, history, () => NOW);

    await session.load({ from: FROM, durationMinutes: 90, speed: 60 });

    expect(history.calls[0]).toBe('totals 2026-10-21T22:00:00.000Z 2026-10-22T07:00:00.000Z');
    expect(history.calls.filter((c) => c.startsWith('minutes'))).toHaveLength(2);
    expect(store.entriesToday[0]).toBe(50);
    expect(statuses).toEqual(['loading', 'paused']);
  });

  it('reloads the O/D flows of the elapsed hour with the current filters on demand', async () => {
    const store = new StationStore(['A']);
    const history = api();
    let filters: OdFilters = DEFAULT_OD_FILTERS;
    const session = new ReplaySession(store, {
      onData: vi.fn(), onTime: vi.fn(), onOd: vi.fn(), odFilters: () => filters, onStatus: vi.fn(),
    }, history, () => NOW);
    await session.load({ from: FROM, durationMinutes: 90, speed: 60 });
    session.play();
    await vi.waitFor(() => { expect(history.calls.some((c) => c.startsWith('od '))).toBe(true); });

    filters = { ...DEFAULT_OD_FILTERS, level: 'DEPARTMENT', department: '69' };
    session.refreshOd();

    expect(history.calls.at(-1)).toBe(`od ${60 * 60_000} DEPARTMENT 69`);
    session.dispose();
  });
});
