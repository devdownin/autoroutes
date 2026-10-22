import type { FeatureCollection, LineString } from 'geojson';
import type { OdFlow } from '../realtime/protocol';
import { flowWidth, percentile } from './scales';

export interface OdProperties {
  readonly originId: string;
  readonly destinationId: string;
  readonly vehicles: number;
  readonly width: number;
}

const ARC_SEGMENTS = 16;
const ARC_BEND = 0.18;

/**
 * Arc de Bézier quadratique courbé vers la droite du sens de parcours :
 * A→B et B→A ne se superposent pas, le sens se lit sans flèche.
 */
export function arc(origin: readonly [number, number], destination: readonly [number, number]): [number, number][] {
  const [x0, y0] = origin;
  const [x1, y1] = destination;
  const cx = (x0 + x1) / 2 + (y1 - y0) * ARC_BEND;
  const cy = (y0 + y1) / 2 - (x1 - x0) * ARC_BEND;
  const points: [number, number][] = [];
  for (let s = 0; s <= ARC_SEGMENTS; s++) {
    const t = s / ARC_SEGMENTS;
    const u = 1 - t;
    points.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  return points;
}

export const OD_NATIONAL_LIMIT = 60;

/**
 * Lisibilité : sans gare sélectionnée, seuls les flux les plus importants sont tracés ;
 * avec une gare sélectionnée, tous ses flux entrants et sortants.
 */
export function selectFlows(flows: readonly OdFlow[], selectedId: string | null, limit = OD_NATIONAL_LIMIT): OdFlow[] {
  if (selectedId !== null) {
    return flows.filter((f) => f.originId === selectedId || f.destinationId === selectedId);
  }
  return [...flows].sort((a, b) => b.vehicles - a.vehicles).slice(0, limit);
}

export function buildOdFeatures(
  flows: readonly OdFlow[],
  coordinates: ReadonlyMap<string, readonly [number, number]>,
): FeatureCollection<LineString, OdProperties> {
  const reference = percentile(flows.map((f) => f.vehicles), 0.95);
  const features = flows.flatMap((flow, index) => {
    const origin = coordinates.get(flow.originId);
    const destination = coordinates.get(flow.destinationId);
    if (origin === undefined || destination === undefined || flow.originId === flow.destinationId) {
      return [];
    }
    return [{
      type: 'Feature' as const,
      id: index,
      geometry: { type: 'LineString' as const, coordinates: arc(origin, destination) },
      properties: { ...flow, width: flowWidth(flow.vehicles, reference) },
    }];
  });
  return { type: 'FeatureCollection', features };
}
