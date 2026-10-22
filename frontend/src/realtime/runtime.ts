import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { StreamClient } from './streamClient';
import type { EventSourceFactory } from './streamClient';
import type { StreamMessage } from './protocol';
import { SyncEngine } from './syncEngine';
import type { SyncResult } from './syncEngine';

export interface RealtimeOptions {
  readonly url: string;
  readonly store: StationStore;
  readonly factory: EventSourceFactory;
  /** Appelé après chaque snapshot ou delta appliqué (≤ 1 Hz). */
  readonly onData: () => void;
  readonly onReferentielChanged: () => void;
}

/** Aiguillage des messages : métriques des gares vers StationStore (hors React), le reste vers l'état d'interface. */
export function startRealtime(options: RealtimeOptions): () => void {
  const ui = useUiStore.getState();
  const sync = new SyncEngine(options.store);

  const route = (message: StreamMessage): SyncResult | undefined => {
    switch (message.type) {
      case 'snapshot':
      case 'delta': {
        const result = message.type === 'snapshot' ? sync.onSnapshot(message) : sync.onDelta(message);
        if (result.kind === 'applied') {
          ui.setWatermark(message.watermark ?? null);
          options.onData();
        } else if (result.kind === 'resync') {
          ui.countResync();
        }
        return result;
      }
      case 'od':
        ui.setOdFlows(message.payload.flows);
        return undefined;
      case 'freshness':
        ui.setFreshness(message.payload);
        return undefined;
      case 'resync':
        ui.countResync();
        return sync.onServerResync();
      case 'referentielChanged':
        options.onReferentielChanged();
        return undefined;
      case 'segments':
        ui.setSegments({ graphVersion: message.payload.graphVersion, algorithm: message.payload.algorithm, loads: message.payload.loads });
        return undefined;
      case 'heartbeat':
        return undefined;
    }
  };

  const client = new StreamClient({
    url: options.url,
    factory: options.factory,
    onMessage: route,
    onStatus: (status) => { ui.setConnection(status); },
  });
  client.start();
  return () => { client.stop(); };
}
