import { describe, expect, it } from 'vitest';
import { sparklinePath, sparklinePoints, trend } from './sparkline';

describe('sparklinePoints', () => {
  it('spreads the values over the width and scales from zero to the maximum', () => {
    expect(sparklinePoints([0, 5, 10], 60, 20)).toEqual([{ x: 0, y: 18 }, { x: 30, y: 10 }, { x: 60, y: 2 }]);
  });

  it('draws a flat line at the bottom when every value is zero, and nothing without data', () => {
    expect(sparklinePoints([0, 0], 10, 20).map((p) => p.y)).toEqual([18, 18]);
    expect(sparklinePoints([], 10, 20)).toEqual([]);
  });

  it('builds an SVG path', () => {
    expect(sparklinePath([0, 10], 10, 20)).toBe('M0,18 L10,2');
  });
});

describe('trend', () => {
  it('compares the two halves of the series with a 10 % tolerance', () => {
    expect(trend([1, 1, 5, 5])).toBe('up');
    expect(trend([5, 5, 1, 1])).toBe('down');
    expect(trend([10, 10, 10.5, 10])).toBe('flat');
  });

  it('is flat for a series that is too short or empty', () => {
    expect(trend([])).toBe('flat');
    expect(trend([4])).toBe('flat');
    expect(trend([0, 0, 0, 0])).toBe('flat');
  });
});
