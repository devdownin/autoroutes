import type { StationStore } from '../state/stationStore';

export interface TopStation {
  readonly index: number;
  readonly id: string;
  /** Passages (entrées + sorties) sur l'heure écoulée. */
  readonly passages: number;
}

/** Les `count` gares les plus actives sur l'heure écoulée ; les gares sans passage n'apparaissent pas. */
export function topStations(store: StationStore, count: number): TopStation[] {
  const rows: TopStation[] = [];
  for (let index = 0; index < store.size; index++) {
    const passages = (store.entries1h[index] ?? 0) + (store.exits1h[index] ?? 0);
    if (passages > 0) {
      rows.push({ index, id: store.ids[index] ?? '', passages });
    }
  }
  return rows.sort((a, b) => b.passages - a.passages || a.index - b.index).slice(0, count);
}
