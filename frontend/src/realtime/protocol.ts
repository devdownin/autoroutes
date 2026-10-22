/** Messages du flux SSE (protocole de la phase 2, section 8). Types en lecture seule : l'état n'est modifié que par les stores. */

export interface WindowCounts {
  readonly entries: number;
  readonly exits: number;
}

export interface StationMetrics {
  readonly stationId: string;
  readonly last5m: WindowCounts;
  readonly last15m: WindowCounts;
  readonly last1h: WindowCounts;
  readonly today: WindowCounts;
  readonly lastEventTime: string | null;
}

export interface OdFlow {
  readonly originId: string;
  readonly destinationId: string;
  readonly vehicles: number;
}

export interface SegmentLoad {
  readonly segmentId: string;
  readonly vehicles: number;
}

export type FreshnessStatus = 'LIVE' | 'CATCHING_UP' | 'STALE';

interface Envelope<T extends string, P> {
  readonly type: T;
  readonly epoch: string;
  readonly sentAt: string;
  readonly watermark?: string | null;
  readonly payload: P;
}

interface Sequenced<T extends string, P> extends Envelope<T, P> {
  readonly seq: number;
}

export type SnapshotMessage = Sequenced<'snapshot', { readonly stations: readonly StationMetrics[]; readonly referentielVersion: string }>;
export type DeltaMessage = Sequenced<'delta', { readonly stations: readonly StationMetrics[] }>;
export type OdMessage = Envelope<'od', { readonly window: string; readonly nature: 'OBSERVED'; readonly minVehicles: number; readonly flows: readonly OdFlow[] }>;
export type SegmentsMessage = Envelope<'segments', {
  readonly window: string;
  readonly nature: 'ESTIMATED';
  readonly graphVersion: string;
  readonly algorithm: string;
  readonly loads: readonly SegmentLoad[];
}>;
export type FreshnessMessage = Envelope<'freshness', {
  readonly status: FreshnessStatus;
  readonly consumerLag: number;
  readonly watermarkLagSeconds: number;
  readonly staleStations: readonly string[];
}>;
export type HeartbeatMessage = Envelope<'heartbeat', Record<string, never>>;
export type ResyncMessage = Envelope<'resync', { readonly reason: string }>;
export type ReferentielChangedMessage = Envelope<'referentielChanged', { readonly version: string }>;

export type StreamMessage =
  | SnapshotMessage
  | DeltaMessage
  | OdMessage
  | SegmentsMessage
  | FreshnessMessage
  | HeartbeatMessage
  | ResyncMessage
  | ReferentielChangedMessage;

export const STREAM_EVENT_TYPES = [
  'snapshot',
  'delta',
  'od',
  'segments',
  'freshness',
  'heartbeat',
  'resync',
  'referentielChanged',
] as const satisfies readonly StreamMessage['type'][];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * Validation structurelle minimale : un message mal formé est ignoré (et compté) plutôt que d'interrompre le flux.
 * La validation exhaustive relève des tests de contrat côté backend.
 */
export function parseStreamMessage(raw: string): StreamMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(value) || typeof value.type !== 'string' || typeof value.epoch !== 'string' || !isObject(value.payload)) {
    return null;
  }
  if (!(STREAM_EVENT_TYPES as readonly string[]).includes(value.type)) {
    return null;
  }
  if ((value.type === 'snapshot' || value.type === 'delta')
    && (typeof value.seq !== 'number' || !Array.isArray(value.payload.stations))) {
    return null;
  }
  return value as unknown as StreamMessage;
}
