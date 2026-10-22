import { describe, expect, it } from 'vitest';
import { arc, buildOdFeatures, selectFlows } from './odGeometry';

describe('OD geometry', () => {
  it('bends A→B and B→A on opposite sides', () => {
    const forward = arc([0, 0], [10, 0]);
    const backward = arc([10, 0], [0, 0]);

    expect(forward[0]).toEqual([0, 0]);
    expect(forward.at(-1)).toEqual([10, 0]);
    expect(Math.sign(forward[8]?.[1] ?? 0)).toBe(-Math.sign(backward[8]?.[1] ?? 0));
  });

  it('skips flows whose stations are unknown or identical', () => {
    const coordinates = new Map<string, readonly [number, number]>([['A', [0, 0]], ['B', [1, 1]]]);
    const collection = buildOdFeatures([
      { originId: 'A', destinationId: 'B', vehicles: 10 },
      { originId: 'A', destinationId: 'X', vehicles: 10 },
      { originId: 'A', destinationId: 'A', vehicles: 10 },
    ], coordinates);

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.properties.width).toBe(6);
  });

  it('keeps the largest flows nationally and all flows of the selected station', () => {
    const flows = [
      { originId: 'A', destinationId: 'B', vehicles: 5 },
      { originId: 'C', destinationId: 'D', vehicles: 50 },
      { originId: 'B', destinationId: 'C', vehicles: 1 },
    ];

    expect(selectFlows(flows, null, 1)).toEqual([flows[1]]);
    expect(selectFlows(flows, 'B', 1)).toEqual([flows[0], flows[2]]);
  });
});
