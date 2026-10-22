import { describe, expect, it, vi } from 'vitest';
import { delta, metrics } from '../test-fixtures';
import type { EventSourceLike } from './streamClient';
import { StreamClient } from './streamClient';

class FakeEventSource implements EventSourceLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  send(type: string, payload: unknown): void {
    this.listeners.get(type)?.(new MessageEvent(type, { data: JSON.stringify(payload) }));
  }

  fail(closed: boolean): void {
    this.readyState = closed ? 2 : 0;
    this.onerror?.(new Event('error'));
  }
}

const setup = (onMessage = vi.fn()) => {
  vi.useFakeTimers();
  const sources: FakeEventSource[] = [];
  const statuses: string[] = [];
  const client = new StreamClient({
    url: '/stream',
    factory: () => { const s = new FakeEventSource(); sources.push(s); return s; },
    onMessage,
    onStatus: (status) => statuses.push(status),
    random: () => 0.5,
    heartbeatTimeoutMs: 45_000,
    setTimer: (cb, ms) => setTimeout(cb, ms),
    clearTimer: (id) => { clearTimeout(id); },
  });
  client.start();
  return { client, sources, statuses, onMessage };
};

describe('StreamClient', () => {
  it('routes parsed messages and reports the open state', () => {
    const { sources, statuses, onMessage } = setup();
    sources[0]?.open();
    sources[0]?.send('delta', delta(1, [metrics('A')]));

    expect(onMessage).toHaveBeenCalledWith(delta(1, [metrics('A')]));
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('opens a fresh connection (snapshot) when synchronisation requires it', () => {
    const { sources } = setup(vi.fn(() => ({ kind: 'resync', reason: 'gap' })));
    sources[0]?.open();
    sources[0]?.send('delta', delta(5, []));

    expect(sources[0]?.closed).toBe(true);
    expect(sources).toHaveLength(2);
  });

  it('leaves transient errors to EventSource (Last-Event-ID replay)', () => {
    const { sources, statuses } = setup();
    sources[0]?.open();
    sources[0]?.fail(false);

    expect(sources).toHaveLength(1);
    expect(statuses.at(-1)).toBe('reconnecting');
  });

  it('reconnects with backoff when the connection is closed', () => {
    const { sources } = setup();
    sources[0]?.fail(true);
    vi.advanceTimersByTime(749);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
  });

  it('reconnects when the server stays silent beyond the heartbeat timeout', () => {
    const { sources } = setup();
    sources[0]?.open();
    vi.advanceTimersByTime(45_000);
    expect(sources[0]?.closed).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(sources).toHaveLength(2);
  });

  it('bounds the backoff delay', () => {
    const { client } = setup();
    expect(client.backoffDelay(0)).toBe(750);
    expect(client.backoffDelay(10)).toBe(15_250);
  });
});
