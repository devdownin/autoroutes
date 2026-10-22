import { describe, expect, it } from 'vitest';
import { StationStore } from '../state/stationStore';
import type { StationMetrics } from '../realtime/protocol';
import { flowsOfStation } from './stationFlows';
import { topStations } from './topStations';

const metrics = (stationId: string, entries: number, exits: number): StationMetrics => ({
  stationId,
  last5m: { entries: 0, exits: 0 }, last15m: { entries: 0, exits: 0 },
  last1h: { entries, exits }, today: { entries, exits }, lastEventTime: null,
});

describe('topStations', () => {
  it('ranks stations by passages over the last hour and leaves out the silent ones', () => {
    const store = new StationStore(['A', 'B', 'C', 'D']);
    store.replaceAll([metrics('A', 10, 5), metrics('B', 100, 20), metrics('C', 0, 0), metrics('D', 15, 0)]);

    expect(topStations(store, 3)).toEqual([
      { index: 1, id: 'B', passages: 120 }, { index: 0, id: 'A', passages: 15 }, { index: 3, id: 'D', passages: 15 },
    ]);
    expect(topStations(store, 1)).toHaveLength(1);
  });
});

describe('flowsOfStation', () => {
  const flows = [
    { originId: 'A', destinationId: 'B', vehicles: 10 },
    { originId: 'C', destinationId: 'A', vehicles: 30 },
    { originId: 'A', destinationId: 'A', vehicles: 99 },
    { originId: 'B', destinationId: 'C', vehicles: 50 },
    { originId: 'A', destinationId: 'D', vehicles: 20 },
  ];

  it('keeps the flows that touch the station, with their direction, biggest first', () => {
    expect(flowsOfStation(flows, 'A', 5)).toEqual([
      { otherId: 'C', direction: 'in', vehicles: 30 },
      { otherId: 'D', direction: 'out', vehicles: 20 },
      { otherId: 'B', direction: 'out', vehicles: 10 },
    ]);
  });

  it('limits the list and handles a station without flows', () => {
    expect(flowsOfStation(flows, 'A', 1)).toHaveLength(1);
    expect(flowsOfStation(flows, 'Z', 5)).toEqual([]);
  });
});
