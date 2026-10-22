import { describe, expect, it, vi } from 'vitest';
import { FrameLoop } from './frameLoop';

const fakeRaf = () => {
  let pending: ((now: number) => void) | null = null;
  return {
    requestFrame: (cb: (now: number) => void) => { pending = cb; return 1; },
    cancelFrame: () => { pending = null; },
    run: (now: number) => { const cb = pending; pending = null; cb?.(now); },
    get pending() { return pending !== null; },
  };
};

describe('FrameLoop', () => {
  it('stops requesting frames when nothing animates and wakes on demand', () => {
    const raf = fakeRaf();
    let frames = 2;
    const loop = new FrameLoop(() => --frames > 0, raf);
    loop.wake();
    raf.run(0);
    expect(raf.pending).toBe(true);
    raf.run(16);
    expect(raf.pending).toBe(false);
    expect(loop.running).toBe(false);
  });

  it('degrades quality after sustained slow frames, then recovers', () => {
    const raf = fakeRaf();
    const onQualityChange = vi.fn();
    const loop = new FrameLoop(() => true, { ...raf, budgetMs: 20, windowFrames: 5, degradeAfterWindows: 2, recoverAfterWindows: 3, onQualityChange });
    loop.wake();
    let now = 0;
    raf.run(now);
    for (let i = 0; i < 10; i++) raf.run((now += 50));
    expect(loop.quality).toBe(1);

    for (let i = 0; i < 15; i++) raf.run((now += 10));
    expect(loop.quality).toBe(0);
    expect(onQualityChange.mock.calls).toEqual([[1], [0]]);
  });
});
