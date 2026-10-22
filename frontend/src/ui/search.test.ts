import { describe, expect, it } from 'vitest';
import { buildAxisGroups } from '../map/axes';
import type { StationCollection } from '../map/referentiel';
import { searchTargets } from './search';

const station = (id: string, name: string, axes: string, dept = '69') => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [4.8, 45.7] as [number, number] },
  properties: { id, name, kind: 'ECHANGEUR' as const, axes, dept, lanes: 2 },
});

const stations: StationCollection = {
  type: 'FeatureCollection',
  features: [
    station('1', 'Lyon-Saint-Exupéry', 'A0043'), station('2', 'Villefranche', 'A0006'), station('3', 'Fleury', 'A0006'),
    station('4', 'Marseille Saint-Antoine', 'A0007', '13'), station('5', 'Orange', 'A0007N', '84'), station('6', 'Saint-Jean-de-Vedas', 'A0009', '34'),
    station('7', 'Péage de A71', 'A0071', '45'),
  ],
};
const axes = buildAxisGroups(stations);

describe('searchTargets', () => {
  it('ignores queries shorter than two characters', () => {
    expect(searchTargets(stations, axes, '')).toEqual([]);
    expect(searchTargets(stations, axes, 'a')).toEqual([]);
  });

  it('finds stations without regard to case or accents, names starting with the text first', () => {
    const results = searchTargets(stations, axes, 'saint');

    expect(results.map((r) => r.kind === 'station' && r.name)).toEqual(['Saint-Jean-de-Vedas', 'Lyon-Saint-Exupéry', 'Marseille Saint-Antoine']);
    expect(searchTargets(stations, axes, 'exupery')).toHaveLength(1);
  });

  it('finds a motorway under any spelling, exact match first, with its stations count', () => {
    for (const query of ['a7', 'A 7', 'a007', 'A0007']) {
      const first = searchTargets(stations, axes, query)[0];
      expect(first).toMatchObject({ kind: 'axis', id: 'A7' });
    }
    const [exact, prefix] = searchTargets(stations, axes, 'a7');
    expect(exact).toMatchObject({ kind: 'axis', id: 'A7', detail: 'Autoroute · 2 gares' });
    expect(prefix).toMatchObject({ kind: 'axis', id: 'A71' });
  });

  it('lists the stations of the motorway after the motorway itself', () => {
    const kinds = searchTargets(stations, axes, 'a6').map((r) => (r.kind === 'axis' ? r.id : r.name));

    expect(kinds).toEqual(['A6', 'Fleury', 'Villefranche']);
  });

  it('describes a station by its axes and department', () => {
    expect(searchTargets(stations, axes, 'orange')[0]).toMatchObject({ kind: 'station', detail: 'A7 · dép. 84' });
  });

  it('caps the number of results', () => {
    const many: StationCollection = { type: 'FeatureCollection', features: Array.from({ length: 40 }, (_, i) => station(String(i), `Gare ${i}`, 'A0001')) };

    expect(searchTargets(many, buildAxisGroups(many), 'gare')).toHaveLength(12);
  });
});
