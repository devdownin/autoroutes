import type { OdFlow } from '../realtime/protocol';

export interface StationFlow {
  readonly otherId: string;
  /** « out » : la gare est l'origine (le véhicule en est entré) ; « in » : elle est la destination. */
  readonly direction: 'out' | 'in';
  readonly vehicles: number;
}

/** Flux de la liste qui touchent la gare, du plus important au plus petit ; les flux d'une gare vers elle-même sont ignorés. */
export function flowsOfStation(flows: readonly OdFlow[], stationId: string, count: number): StationFlow[] {
  return flows.flatMap((flow): StationFlow[] => {
    if (flow.originId === flow.destinationId) {
      return [];
    }
    if (flow.originId === stationId) {
      return [{ otherId: flow.destinationId, direction: 'out', vehicles: flow.vehicles }];
    }
    if (flow.destinationId === stationId) {
      return [{ otherId: flow.originId, direction: 'in', vehicles: flow.vehicles }];
    }
    return [];
  }).sort((a, b) => b.vehicles - a.vehicles).slice(0, count);
}
