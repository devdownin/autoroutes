import { describe, expect, it } from 'vitest';
import { tooltipPosition } from './tooltipPosition';

const container = { width: 800, height: 600 };
const box = { width: 230, height: 80 };

describe('tooltipPosition', () => {
  it('sits below and to the right of the pointer', () => {
    expect(tooltipPosition({ x: 100, y: 100 }, container, box)).toEqual({ left: 114, top: 114 });
  });

  it('flips to the left and above near the right and bottom edges', () => {
    expect(tooltipPosition({ x: 780, y: 590 }, container, box)).toEqual({ left: 780 - 14 - 230, top: 590 - 14 - 80 });
  });

  it('never leaves the container on the left or top', () => {
    expect(tooltipPosition({ x: 5, y: 5 }, { width: 100, height: 60 }, box)).toEqual({ left: 0, top: 0 });
  });
});
