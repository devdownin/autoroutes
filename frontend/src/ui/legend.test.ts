import { describe, expect, it } from 'vitest';
import type { LayerVisibility } from '../state/uiStore';
import { legendRows, roundSignificant, segmentScale } from './legend';

const layers = (overrides: Partial<LayerVisibility>): LayerVisibility => ({ stations: true, labels: true, od: false, segments: false, axes: false, ...overrides });
const both = { echangeur: true, pleineVoie: true };

describe('legendRows', () => {
  it('describes only the displayed layers', () => {
    expect(legendRows(layers({}), both)).toEqual(['echangeur', 'pleine-voie', 'stale']);
    expect(legendRows(layers({ od: true }), both)).toEqual(['echangeur', 'pleine-voie', 'stale', 'od']);
    expect(legendRows(layers({ stations: false, segments: true }), both)).toEqual(['segments']);
  });

  it('adds the motorway names row when they are displayed', () => {
    expect(legendRows(layers({ axes: true }), both)).toEqual(['echangeur', 'pleine-voie', 'stale', 'axes']);
  });

  it('follows the station kinds being shown', () => {
    expect(legendRows(layers({}), { echangeur: false, pleineVoie: true })).toEqual(['pleine-voie', 'stale']);
  });

  it('is empty when nothing is displayed', () => {
    expect(legendRows(layers({ stations: false }), both)).toEqual([]);
  });
});

describe('segmentScale', () => {
  it('has no scale before the first estimate', () => {
    expect(segmentScale([])).toBeNull();
    expect(segmentScale([{ vehicles: 0 }])).toBeNull();
  });

  it('tops out at the 95th percentile of the loads, as the map does, with rounded ticks', () => {
    const loads = Array.from({ length: 100 }, (_, i) => ({ vehicles: (i + 1) * 20 }));

    const scale = segmentScale(loads);

    expect(scale).toEqual({ reference: 1900, ticks: [0, 950, 1900] });
  });

  it('rounds to two significant figures', () => {
    expect(roundSignificant(1372)).toBe(1400);
    expect(roundSignificant(47)).toBe(47);
    expect(roundSignificant(0)).toBe(0);
  });
});
