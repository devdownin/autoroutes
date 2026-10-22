import { describe, expect, it } from 'vitest';
import { axisLabel, buildAxisGroups, formatAxes, labelCount, layoutLabels, pickSpread, stationsOnAxes } from './axes';
import type { StationCollection } from './referentiel';

const feature = (axes: string, lon: number, lat: number) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [lon, lat] },
  properties: { id: `${axes}-${lon}`, name: 'g', kind: 'ECHANGEUR' as const, axes, dept: '01', lanes: 2 },
});

const collection = (...features: ReturnType<typeof feature>[]): StationCollection => ({ type: 'FeatureCollection', features });

describe('axisLabel and formatAxes', () => {
  it('turns referential codes into the names drivers know', () => {
    expect(axisLabel('A0007')).toBe('A7');
    expect(axisLabel('A0007N')).toBe('A7');
    expect(axisLabel('A0016')).toBe('A16');
    expect(axisLabel('N0159')).toBe('N159');
    expect(axisLabel('A0500')).toBe('A500');
    expect(axisLabel('Z-spécial')).toBe('Z-spécial');
  });

  it('lists a station\'s axes once each', () => {
    expect(formatAxes('A0016, A0017')).toBe('A16, A17');
    expect(formatAxes('A0007, A0007N')).toBe('A7');
    expect(formatAxes('')).toBe('');
  });
});

describe('buildAxisGroups', () => {
  const stations = collection(
    feature('A0007', 4.8, 45.7), feature('A0007N', 4.8, 45.0), feature('A0006', 4.8, 46.0),
    feature('A0010', 1, 47), feature('A0016, A0001', 2.3, 49), feature('N0159', 5, 44), feature(''.padEnd(0), 0, 0),
  );

  it('groups codes of the same motorway and sorts them numerically, national roads last', () => {
    const groups = buildAxisGroups(stations);

    expect(groups.map((g) => g.id)).toEqual(['A1', 'A6', 'A7', 'A10', 'A16', 'N159']);
    expect(groups.find((g) => g.id === 'A7')).toMatchObject({ codes: ['A0007', 'A0007N'], value: 'A0007,A0007N', stations: [0, 1] });
  });

  it('puts a multi-axis station in every one of its axes', () => {
    const groups = buildAxisGroups(stations);

    expect(groups.find((g) => g.id === 'A16')?.stations).toEqual([4]);
    expect(groups.find((g) => g.id === 'A1')?.stations).toEqual([4]);
  });

  it('finds the stations of the selected axes', () => {
    expect(stationsOnAxes(stations, 'A0007,A0007N')).toEqual([0, 1]);
    expect(stationsOnAxes(stations, 'A0016')).toEqual([4]);
    expect(stationsOnAxes(stations, '')).toEqual([]);
  });
});

describe('pickSpread', () => {
  const along = Array.from({ length: 10 }, (_, i) => ({ position: [0, i] as const }));

  it('returns everything when there are few points', () => {
    expect(pickSpread(along.slice(0, 2), 3)).toHaveLength(2);
  });

  it('spreads the picks along the longest dimension', () => {
    const picked = pickSpread(along, 2).map((p) => p.position[1]);

    expect(picked).toEqual([2, 7]);
  });

  it('works on east-west axes too', () => {
    const picked = pickSpread(along.map((p) => ({ position: [p.position[1], 0] as const })), 2).map((p) => p.position[0]);

    expect(picked).toEqual([2, 7]);
  });
});

describe('labelCount', () => {
  it('grows with the zoom', () => {
    expect([5, 6, 7, 8, 10].map(labelCount)).toEqual([1, 2, 3, 5, 8]);
  });
});

describe('layoutLabels', () => {
  const viewport = { width: 1000, height: 800 };
  // Projection simple : 100 px par degré.
  const project = ([lon, lat]: readonly [number, number]) => [lon * 100, lat * 100] as const;
  const positions = [[1, 1], [1.02, 1.01], [5, 5], [5, 6], [20, 20]] as const;
  const groups = [
    { id: 'A1', codes: ['A0001'], value: 'A0001', stations: [0, 1] },
    { id: 'A2', codes: ['A0002'], value: 'A0002', stations: [2, 3] },
    { id: 'A3', codes: ['A0003'], value: 'A0003', stations: [4] },
  ];

  it('labels each axis once at the country scale and skips axes outside the view', () => {
    const labels = layoutLabels(groups, positions, project, 5, viewport);

    expect(labels.map((l) => l.text)).toEqual(['A1', 'A2']);
    expect(labels[0]).toMatchObject({ value: 'A0001', key: 'A1#0' });
  });

  it('keeps the axis with the most stations when two labels collide', () => {
    const crowded = [
      { id: 'A1', codes: ['A0001'], value: 'A0001', stations: [0] },
      { id: 'A9', codes: ['A0009'], value: 'A0009', stations: [1, 2, 3] },
    ];
    // A1 et A9 tombent à 2 px l'un de l'autre.
    const close = [[1, 1], [1.02, 1], [9, 9], [9, 9.5]] as const;

    const labels = layoutLabels(crowded, close, project, 5, viewport);

    expect(labels.map((l) => l.text)).toEqual(['A9']);
  });

  it('shows more labels per axis as the map is zoomed in', () => {
    const long = [{ id: 'A5', codes: ['A0005'], value: 'A0005', stations: Array.from({ length: 12 }, (_, i) => i) }];
    const line = Array.from({ length: 12 }, (_, i) => [i * 0.7, 1] as const);

    expect(layoutLabels(long, line, project, 5, viewport)).toHaveLength(1);
    expect(layoutLabels(long, line, project, 7, viewport).length).toBeGreaterThan(1);
  });
});
