import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OD_POLL_MS, OdPoller } from './odPoller';
import { DEFAULT_OD_FILTERS, EMPTY_OD_VIEW } from './odTypes';
import type { OdFilters, OdView } from './odTypes';

const view = (total: number): OdView => ({ ...EMPTY_OD_VIEW, totalVehicles: total });

describe('OdPoller', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fetches at start then every interval, and stops cleanly', async () => {
    const fetch = vi.fn(() => Promise.resolve(view(1)));
    const onView = vi.fn();
    const poller = new OdPoller({ fetch, onView, onError: vi.fn() });

    poller.start(DEFAULT_OD_FILTERS);
    await vi.advanceTimersByTimeAsync(OD_POLL_MS * 2);
    poller.stop();
    await vi.advanceTimersByTimeAsync(OD_POLL_MS * 2);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onView).toHaveBeenCalledTimes(3);
  });

  it('never applies a late response of previous filters', async () => {
    const resolvers: { filters: OdFilters; resolve: (v: OdView) => void }[] = [];
    const fetch = vi.fn((filters: OdFilters) => new Promise<OdView>((resolve) => { resolvers.push({ filters, resolve }); }));
    const onView = vi.fn();
    const poller = new OdPoller({ fetch, onView, onError: vi.fn() });

    poller.start(DEFAULT_OD_FILTERS);
    poller.start({ ...DEFAULT_OD_FILTERS, department: '69' });
    resolvers[0]?.resolve(view(1));
    resolvers[1]?.resolve(view(2));
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith(view(2));
  });

  it('reports errors of the current request only', async () => {
    const onError = vi.fn();
    const poller = new OdPoller({ fetch: () => Promise.reject(new Error('503')), onView: vi.fn(), onError });

    poller.start(DEFAULT_OD_FILTERS);
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
