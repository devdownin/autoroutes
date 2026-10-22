import { describe, expect, it } from 'vitest';
import { ReplayClock } from './replayClock';

describe('ReplayClock', () => {
  it('advances at the chosen speed and stops on pause', () => {
    let now = 0;
    const clock = new ReplayClock(1_000_000, 60, () => now);
    clock.play();
    now = 1_000;
    expect(clock.time()).toBe(1_060_000);
    clock.pause();
    now = 5_000;
    expect(clock.time()).toBe(1_060_000);
  });

  it('changes speed without a jump', () => {
    let now = 0;
    const clock = new ReplayClock(0, 10, () => now);
    clock.play();
    now = 1_000;
    clock.setSpeed(300);
    expect(clock.time()).toBe(10_000);
    now = 2_000;
    expect(clock.time()).toBe(310_000);
  });
});
