import { describe, expect, it, vi } from 'vitest';
import { StationAnimator } from '../animation/stationAnimator';
import { StationStore } from '../state/stationStore';
import { metrics } from '../test-fixtures';
import { StationLayerRenderer } from './stationLayerRenderer';

const setup = () => {
  const store = new StationStore(['A', 'B']);
  const animator = new StationAnimator(2, { transitionMs: 100, pulseMs: 100, pulseCooldownMs: 1_000 });
  const map = { setFeatureState: vi.fn() };
  return { store, animator, map, renderer: new StationLayerRenderer(map, store, animator) };
};

describe('StationLayerRenderer', () => {
  it('pushes only animated stations, batched at a capped rate', () => {
    const { store, map, renderer } = setup();
    store.replaceAll([metrics('A', 50, 50), metrics('B', 0, 0)]);
    renderer.onData(0);

    renderer.renderFrame(0, 0);
    expect(map.setFeatureState).toHaveBeenCalledTimes(2);
    renderer.renderFrame(10, 0);
    expect(map.setFeatureState).toHaveBeenCalledTimes(2);
    renderer.renderFrame(40, 0);
    expect(map.setFeatureState).toHaveBeenCalledTimes(4);
  });

  it('pulses only stations with new passages and hides halos when quality drops', () => {
    const { store, map, renderer } = setup();
    store.replaceAll([metrics('A', 10, 10, 100), metrics('B', 10, 10, 100)]);
    renderer.onData(0);
    renderer.renderFrame(200, 0);
    map.setFeatureState.mockClear();

    store.applyDelta([metrics('A', 10, 10, 110)]);
    renderer.onData(300);
    renderer.renderFrame(300, 0);
    expect(map.setFeatureState).toHaveBeenCalledWith({ source: 'stations', id: 0 }, expect.objectContaining({ halo: expect.any(Number) as number }));
    const firstHalo = (map.setFeatureState.mock.calls[0]?.[1] as { halo: number }).halo;
    expect(firstHalo).toBeGreaterThan(0);

    renderer.renderFrame(350, 1);
    expect((map.setFeatureState.mock.calls.at(-1)?.[1] as { halo: number }).halo).toBe(0);
  });

  it('keeps rendering while animations are running', () => {
    const { store, renderer } = setup();
    store.replaceAll([metrics('A', 50, 50)]);
    renderer.onData(0);

    expect(renderer.renderFrame(0, 0)).toBe(true);
    expect(renderer.renderFrame(500, 0)).toBe(false);
  });
});
