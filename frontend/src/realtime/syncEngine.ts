import type { StationStore } from '../state/stationStore';
import type { DeltaMessage, SnapshotMessage } from './protocol';

export type ResyncReason = 'gap' | 'epoch' | 'no-snapshot' | 'server';

export type SyncResult =
  | { readonly kind: 'applied' }
  | { readonly kind: 'ignored' }
  | { readonly kind: 'resync'; readonly reason: ResyncReason };

/**
 * Applique snapshot et deltas dans l'ordre strict des séquences.
 * Toute incohérence (trou, changement d'epoch, delta sans snapshot) déclenche une resynchronisation par snapshot.
 */
export class SyncEngine {
  private epoch: string | null = null;
  private seq = -1;

  constructor(private readonly store: StationStore) {}

  get lastEventId(): string | null {
    return this.epoch === null ? null : `${this.epoch}:${this.seq}`;
  }

  onSnapshot(message: SnapshotMessage): SyncResult {
    this.store.replaceAll(message.payload.stations);
    this.epoch = message.epoch;
    this.seq = message.seq;
    return { kind: 'applied' };
  }

  onDelta(message: DeltaMessage): SyncResult {
    if (this.epoch === null) {
      return this.invalidate('no-snapshot');
    }
    if (message.epoch !== this.epoch) {
      return this.invalidate('epoch');
    }
    if (message.seq <= this.seq) {
      return { kind: 'ignored' }; // déjà appliqué (rejeu après reconnexion)
    }
    if (message.seq !== this.seq + 1) {
      return this.invalidate('gap');
    }
    this.store.applyDelta(message.payload.stations);
    this.seq = message.seq;
    return { kind: 'applied' };
  }

  onServerResync(): SyncResult {
    return this.invalidate('server');
  }

  private invalidate(reason: ResyncReason): SyncResult {
    this.epoch = null;
    this.seq = -1;
    return { kind: 'resync', reason };
  }
}
