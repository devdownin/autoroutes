import { describe, expect, it } from 'vitest';
import { RADIUS_MAX_PX, RADIUS_MIN_PX, flowWidth, percentile, pulseStrength, radiusFor } from './scales';

describe('scales', () => {
  it('interpolates percentiles and ignores non-finite values', () => {
    expect(percentile([1, 2, 3, 4, Number.NaN], 0.5)).toBe(2.5);
    expect(percentile([], 0.95)).toBe(0);
  });

  it('maps volume to area (square root) and caps at the reference', () => {
    expect(radiusFor(0, 100)).toBe(RADIUS_MIN_PX);
    expect(radiusFor(100, 100)).toBe(RADIUS_MAX_PX);
    expect(radiusFor(400, 100)).toBe(RADIUS_MAX_PX);
    expect(radiusFor(25, 100)).toBeCloseTo(RADIUS_MIN_PX + (RADIUS_MAX_PX - RADIUS_MIN_PX) * 0.5);
  });

  it('compresses pulse strength with a perceptible floor', () => {
    expect(pulseStrength(0)).toBe(0);
    expect(pulseStrength(1)).toBe(0.25);
    expect(pulseStrength(20)).toBe(1);
    expect(pulseStrength(500)).toBe(1);
  });

  it('keeps OD flow width within bounds', () => {
    expect(flowWidth(0, 10)).toBe(0.5);
    expect(flowWidth(10, 10)).toBe(6);
  });
});
