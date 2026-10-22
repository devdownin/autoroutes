import { useSyncExternalStore } from 'react';
import type { StationStore } from '../state/stationStore';

/** Re-rendu des panneaux à chaque version du store (≤ 1 Hz), jamais par événement Kafka. */
export function useStoreVersion(store: StationStore): number {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.version,
  );
}
