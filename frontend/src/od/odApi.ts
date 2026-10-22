import { odQuery, toOdView } from './odTypes';
import type { OdCoverage, OdFilters, OdResultDto, OdView } from './odTypes';

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, signal === undefined ? {} : { signal });
  if (!response.ok) {
    throw new Error(`Flux O/D indisponibles (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function liveOd(filters: OdFilters, signal?: AbortSignal): Promise<OdView> {
  return toOdView(await getJson<OdResultDto>(`/api/v1/od?${odQuery(filters)}`, signal));
}

export interface OdCoverageDto {
  readonly coverage: OdCoverage;
  readonly stationExits: number;
  readonly gap: number;
  readonly gapRatio: number;
  readonly originKnownRatio: number | null;
}

export function odCoverage(signal?: AbortSignal): Promise<OdCoverageDto> {
  return getJson<OdCoverageDto>('/api/v1/od/coverage', signal);
}
