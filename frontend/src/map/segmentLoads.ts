import type { SegmentLoad } from '../realtime/protocol';
import { percentile } from './scales';

export interface SegmentDiff {
  /** Charge normalisée (0 à 1) après la mise à jour, par segmentId. */
  readonly next: ReadonlyMap<string, number>;
  readonly set: readonly (readonly [string, number])[];
  readonly clear: readonly string[];
}

/**
 * Charges ESTIMÉES → intensité 0 à 1, référence au 95e centile (un tronçon exceptionnel n'écrase pas les autres).
 * Ne retourne que les écarts avec l'état précédent : MapLibre n'est écrit que pour les tronçons dont l'intensité change.
 */
export function diffSegmentLoads(previous: ReadonlyMap<string, number>, loads: readonly SegmentLoad[]): SegmentDiff {
  const reference = percentile(loads.map((l) => l.vehicles), 0.95);
  const next = new Map<string, number>();
  const set: [string, number][] = [];
  for (const { segmentId, vehicles } of loads) {
    const intensity = reference > 0 ? Math.round(Math.min(1, vehicles / reference) * 100) / 100 : 0;
    next.set(segmentId, intensity);
    if (previous.get(segmentId) !== intensity) {
      set.push([segmentId, intensity]);
    }
  }
  const clear = [...previous.keys()].filter((id) => !next.has(id));
  return { next, set, clear };
}
