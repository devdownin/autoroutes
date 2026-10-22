import type { OdFlow } from '../realtime/protocol';

export type OdLevel = 'STATION' | 'DEPARTMENT';
export type OdRole = 'ANY' | 'ORIGIN' | 'DESTINATION';

/** Filtres de lecture des flux O/D. Chaîne vide = pas de filtre. */
export interface OdFilters {
  readonly level: OdLevel;
  readonly department: string;
  readonly axis: string;
  readonly role: OdRole;
}

export const DEFAULT_OD_FILTERS: OdFilters = { level: 'STATION', department: '', axis: '', role: 'ANY' };

export interface OdNode {
  readonly id: string;
  readonly name: string;
  readonly longitude: number;
  readonly latitude: number;
}

/** Issues des sorties sur la fenêtre, en véhicules : leur somme égale les sorties de toutes les gares. */
export interface OdCoverage {
  readonly recorded: number;
  readonly openSystem: number;
  readonly entryMissing: number;
  readonly entryUnknown: number;
}

/**
 * Flux diffusables : le seuil de 3 véhicules est appliqué par le serveur, après agrégation.
 * Les flux masqués ne sont connus que par leur nombre et leur volume.
 */
export interface OdView {
  readonly level: OdLevel;
  readonly flows: readonly OdFlow[];
  readonly nodes: readonly OdNode[];
  readonly maskedFlows: number;
  readonly maskedVehicles: number;
  readonly totalVehicles: number;
  readonly truncated: boolean;
  readonly coverage: OdCoverage | null;
}

export const EMPTY_OD_VIEW: OdView = {
  level: 'STATION', flows: [], nodes: [], maskedFlows: 0, maskedVehicles: 0, totalVehicles: 0, truncated: false, coverage: null,
};

export const isDefaultFilters = (filters: OdFilters): boolean =>
  filters.level === DEFAULT_OD_FILTERS.level && filters.department === '' && filters.axis === '' && filters.role === 'ANY';

export function odQuery(filters: OdFilters): string {
  const params = new URLSearchParams({ level: filters.level, role: filters.role, limit: '500' });
  if (filters.department !== '') {
    params.set('department', filters.department);
  }
  if (filters.axis !== '') {
    params.set('axis', filters.axis);
  }
  return params.toString();
}

/** Résultat du serveur (`OdResult`) vers la vue de l'interface. */
export interface OdResultDto {
  readonly level: OdLevel;
  readonly flows: readonly OdFlow[];
  readonly nodes: readonly OdNode[];
  readonly masked: { readonly flows: number; readonly vehicles: number };
  readonly totalVehicles: number;
  readonly truncated: boolean;
  readonly coverage: OdCoverage;
}

export function toOdView(dto: OdResultDto): OdView {
  return {
    level: dto.level,
    flows: dto.flows,
    nodes: dto.nodes,
    maskedFlows: dto.masked.flows,
    maskedVehicles: dto.masked.vehicles,
    totalVehicles: dto.totalVehicles,
    truncated: dto.truncated,
    coverage: dto.coverage,
  };
}

/** Flux du flux SSE (sans filtre ni couverture) : mode démonstration et repli. */
export function streamOdView(flows: readonly OdFlow[]): OdView {
  return { ...EMPTY_OD_VIEW, flows, totalVehicles: flows.reduce((sum, f) => sum + f.vehicles, 0) };
}
