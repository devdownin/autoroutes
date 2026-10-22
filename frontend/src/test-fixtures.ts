import type { DeltaMessage, SnapshotMessage, StationMetrics } from './realtime/protocol';

export function metrics(stationId: string, entries1h = 10, exits1h = 8, today = 100): StationMetrics {
  return {
    stationId,
    last5m: { entries: 1, exits: 1 },
    last15m: { entries: 3, exits: 2 },
    last1h: { entries: entries1h, exits: exits1h },
    today: { entries: today, exits: today },
    lastEventTime: '2026-10-22T08:00:00Z',
  };
}

export function snapshot(seq: number, stations: StationMetrics[], epoch = 'e1'): SnapshotMessage {
  return { type: 'snapshot', epoch, seq, sentAt: '2026-10-22T08:00:00Z', watermark: '2026-10-22T08:00:00Z', payload: { stations, referentielVersion: 'v1' } };
}

export function delta(seq: number, stations: StationMetrics[], epoch = 'e1'): DeltaMessage {
  return { type: 'delta', epoch, seq, sentAt: '2026-10-22T08:00:01Z', watermark: '2026-10-22T08:00:01Z', payload: { stations } };
}
