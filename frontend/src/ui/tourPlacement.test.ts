import { describe, expect, it } from 'vitest';
import { placeCard } from './tourPlacement';

const viewport = { width: 1000, height: 700 };
const card = { width: 320, height: 160 };

describe('placeCard', () => {
  it('sits below the target when there is room, centred on it', () => {
    const placement = placeCard({ left: 400, top: 20, width: 100, height: 40 }, viewport, card);

    expect(placement).toEqual({ left: 400 + 50 - 160, top: 20 + 40 + 14 });
  });

  it('goes above when the target is at the bottom', () => {
    const placement = placeCard({ left: 400, top: 640, width: 100, height: 40 }, viewport, card);

    expect(placement.top).toBe(640 - 14 - 160);
  });

  it('goes beside a tall target that leaves no room above or below', () => {
    const placement = placeCard({ left: 20, top: 0, width: 300, height: 700 }, viewport, card);

    expect(placement.left).toBe(20 + 300 + 14);
  });

  it('is centred without a target, or when the target is nearly the whole screen', () => {
    const centred = { left: (1000 - 320) / 2, top: (700 - 160) / 2 };

    expect(placeCard(null, viewport, card)).toEqual(centred);
    expect(placeCard({ left: 0, top: 0, width: 990, height: 690 }, viewport, card)).toEqual(centred);
  });

  it('never leaves the screen horizontally', () => {
    expect(placeCard({ left: 0, top: 20, width: 30, height: 30 }, viewport, card).left).toBe(12);
    expect(placeCard({ left: 980, top: 20, width: 20, height: 30 }, viewport, card).left).toBe(1000 - 320 - 12);
  });
});
