import { odQuery, toOdView } from '../od/odTypes';
import type { OdFilters, OdResultDto, OdView } from '../od/odTypes';

/** Historique OBSERVÉ (backend, incrément 2). Les données couvrent jusqu'au dernier point de reprise (≤ 60 s). */

export interface SeriesPoint {
  readonly t: number;
  readonly entries: number;
  readonly exits: number;
}

export interface MinuteRow {
  readonly stationId: string;
  readonly t: number;
  readonly entries: number;
  readonly exits: number;
}

export interface StationTotal {
  readonly stationId: string;
  readonly entries: number;
  readonly exits: number;
}

export type Step = 'PT1M' | 'PT15M' | 'PT1H';

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, signal === undefined ? {} : { signal });
  if (!response.ok) {
    throw new Error(`Historique indisponible (${response.status})`);
  }
  return (await response.json()) as T;
}

const range = (from: Date, to: Date): string => `from=${from.toISOString()}&to=${to.toISOString()}`;

export async function stationSeries(stationId: string, from: Date, to: Date, step: Step, signal?: AbortSignal): Promise<SeriesPoint[]> {
  const body = await getJson<{ points: SeriesPoint[] }>(
    `/api/v1/stations/${encodeURIComponent(stationId)}/history?${range(from, to)}&step=${step}`, signal);
  return body.points;
}

export function minutes(from: Date, to: Date, signal?: AbortSignal): Promise<MinuteRow[]> {
  return getJson<MinuteRow[]>(`/api/v1/history/minutes?${range(from, to)}`, signal);
}

export function totals(from: Date, to: Date, signal?: AbortSignal): Promise<StationTotal[]> {
  return getJson<StationTotal[]>(`/api/v1/history/totals?${range(from, to)}`, signal);
}

export async function odFlows(from: Date, to: Date, filters: OdFilters, signal?: AbortSignal): Promise<OdView> {
  const body = await getJson<{ result: OdResultDto }>(`/api/v1/history/od?${range(from, to)}&${odQuery(filters)}`, signal);
  return toOdView(body.result);
}
