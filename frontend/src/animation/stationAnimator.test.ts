import { describe, expect, it } from 'vitest';
import { StationAnimator } from './stationAnimator';

const options = { transitionMs: 1_000, pulseMs: 1_000, pulseCooldownMs: 5_000 };

describe('StationAnimator', () => {
  it('produces the same value whatever the frame rate', () => {
    const fast = new StationAnimator(1, options);
    const slow = new StationAnimator(1, options);
    fast.setTarget(0, 10, 0);
    slow.setTarget(0, 10, 0);
    for (let t = 0; t <= 500; t += 16) fast.step(t);
    fast.step(500);
    slow.step(500);

    expect(fast.radius[0]).toBeCloseTo(slow.radius[0] ?? Number.NaN, 5);
    expect(slow.radius[0]).toBeCloseTo(8.75, 2);
  });

  it('restarts from the displayed value when retargeted mid-transition', () => {
    const animator = new StationAnimator(1, options);
    animator.setTarget(0, 10, 0);
    animator.step(500);
    const shown = animator.radius[0] ?? 0;
    animator.setTarget(0, 2, 500);
    animator.step(500);

    expect(animator.radius[0]).toBeCloseTo(shown, 5);
  });

  it('stops animating once transition and pulse are over', () => {
    const animator = new StationAnimator(1, options);
    animator.setTarget(0, 4, 0);
    animator.pulse(0, 1, 0);
    expect(animator.step(500)).toEqual([0]);
    expect(animator.halo[0]).toBeCloseTo(0.25, 5);

    animator.step(1_000);
    expect(animator.animating).toBe(false);
    expect(animator.halo[0]).toBe(0);
    expect(animator.step(1_100)).toEqual([]);
  });

  it('enforces a cooldown between pulses of the same station', () => {
    const animator = new StationAnimator(1, options);
    expect(animator.pulse(0, 1, 0)).toBe(true);
    expect(animator.pulse(0, 1, 4_999)).toBe(false);
    expect(animator.pulse(0, 1, 5_000)).toBe(true);
  });

  it('applies targets immediately and suppresses pulses with reduced motion', () => {
    const animator = new StationAnimator(1, options);
    animator.setReducedMotion(true);
    animator.setTarget(0, 12, 0);

    expect(animator.radius[0]).toBe(12);
    expect(animator.pulse(0, 1, 0)).toBe(false);
  });
});
