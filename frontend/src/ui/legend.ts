import { percentile } from '../map/scales';
import type { LayerVisibility } from '../state/uiStore';

export type LegendRowId = 'echangeur' | 'pleine-voie' | 'stale' | 'od' | 'segments' | 'axes';

/** La légende ne décrit que ce qui est affiché : une ligne par couche active, dans l'ordre de lecture. */
export function legendRows(layers: LayerVisibility, kinds: { echangeur: boolean; pleineVoie: boolean }): LegendRowId[] {
  const rows: LegendRowId[] = [];
  if (layers.stations) {
    if (kinds.echangeur) rows.push('echangeur');
    if (kinds.pleineVoie) rows.push('pleine-voie');
    rows.push('stale');
  }
  if (layers.axes) rows.push('axes');
  if (layers.od) rows.push('od');
  if (layers.segments) rows.push('segments');
  return rows;
}

export interface SegmentScale {
  /** Charge (véhicules sur 1 h) à laquelle la couleur atteint son maximum : 95e centile des tronçons, comme sur la carte. */
  readonly reference: number;
  /** Repères de l'échelle, du plus faible au plus fort, arrondis. */
  readonly ticks: readonly number[];
}

/** Arrondit à 2 chiffres significatifs : « 1 372 » devient « 1 400 », un repère lisible plutôt qu'une fausse précision. */
export function roundSignificant(value: number): number {
  if (!(value > 0)) {
    return 0;
  }
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
}

/** Échelle de la légende des tronçons, à partir des mêmes charges que la carte (voir `diffSegmentLoads`). */
export function segmentScale(loads: readonly { readonly vehicles: number }[]): SegmentScale | null {
  const vehicles = loads.map((l) => l.vehicles).filter((v) => v > 0);
  if (vehicles.length === 0) {
    return null;
  }
  const reference = percentile(vehicles, 0.95);
  const top = roundSignificant(reference);
  return { reference: top, ticks: [0, roundSignificant(top / 2), top] };
}
