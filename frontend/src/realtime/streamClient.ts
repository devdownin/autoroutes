import { STREAM_EVENT_TYPES, parseStreamMessage } from './protocol';
import type { StreamMessage } from './protocol';
import type { SyncResult } from './syncEngine';

/** Sous-ensemble d'EventSource utilisé, pour injecter un double de test ou le flux de démonstration. */
export interface EventSourceLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface StreamClientOptions {
  readonly url: string;
  readonly factory: EventSourceFactory;
  readonly onMessage: (message: StreamMessage) => SyncResult | undefined;
  readonly onStatus: (status: ConnectionStatus) => void;
  readonly heartbeatTimeoutMs?: number;
  readonly backoffMinMs?: number;
  readonly backoffMaxMs?: number;
  readonly random?: () => number;
  readonly setTimer?: (callback: () => void, ms: number) => number;
  readonly clearTimer?: (id: number) => void;
}

const CLOSED = 2;

/**
 * Connexion SSE résiliente.
 * - Coupure transitoire : EventSource se reconnecte seul et renvoie Last-Event-ID → le serveur rejoue les deltas manquants.
 * - Resynchronisation demandée (trou, epoch, serveur) : nouvelle connexion SANS Last-Event-ID → snapshot.
 * - Connexion fermée ou silencieuse (heartbeat absent) : reconnexion avec backoff exponentiel et aléa.
 */
export class StreamClient {
  private source: EventSourceLike | null = null;
  private attempts = 0;
  private reconnectTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private stopped = true;
  private readonly heartbeatTimeoutMs: number;
  private readonly backoffMinMs: number;
  private readonly backoffMaxMs: number;
  private readonly random: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => number;
  private readonly clearTimer: (id: number) => void;

  constructor(private readonly options: StreamClientOptions) {
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 45_000;
    this.backoffMinMs = options.backoffMinMs ?? 1_000;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((callback, ms) => window.setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((id) => { window.clearTimeout(id); });
  }

  start(): void {
    this.stopped = false;
    this.connect('connecting');
  }

  stop(): void {
    this.stopped = true;
    this.cancelTimers();
    this.source?.close();
    this.source = null;
    this.options.onStatus('closed');
  }

  /** Délai de la n-ième tentative : min × 2^n plafonné, avec aléa complet pour étaler les reconnexions simultanées. */
  backoffDelay(attempt: number): number {
    const ceiling = Math.min(this.backoffMaxMs, this.backoffMinMs * 2 ** attempt);
    return Math.round(this.backoffMinMs / 2 + this.random() * (ceiling - this.backoffMinMs / 2));
  }

  private connect(status: ConnectionStatus): void {
    this.source?.close();
    this.options.onStatus(status);
    const source = this.options.factory(this.options.url);
    this.source = source;
    source.onopen = () => {
      this.attempts = 0;
      this.options.onStatus('open');
      this.armWatchdog();
    };
    source.onerror = () => {
      if (source !== this.source || this.stopped) {
        return;
      }
      if (source.readyState === CLOSED) {
        this.scheduleReconnect();
      } else {
        this.options.onStatus('reconnecting');
      }
    };
    for (const type of STREAM_EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        if (source === this.source) {
          this.handle(event.data);
        }
      });
    }
  }

  private handle(data: string): void {
    this.armWatchdog();
    const message = parseStreamMessage(data);
    if (message === null) {
      return;
    }
    const result = this.options.onMessage(message);
    if (result?.kind === 'resync') {
      this.connect('reconnecting');
    }
  }

  private scheduleReconnect(): void {
    this.cancelTimers();
    this.options.onStatus('reconnecting');
    const delay = this.backoffDelay(this.attempts++);
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      if (!this.stopped) {
        this.connect('reconnecting');
      }
    }, delay);
  }

  private armWatchdog(): void {
    if (this.watchdogTimer !== null) {
      this.clearTimer(this.watchdogTimer);
    }
    this.watchdogTimer = this.setTimer(() => {
      this.watchdogTimer = null;
      if (!this.stopped) {
        this.source?.close();
        this.scheduleReconnect();
      }
    }, this.heartbeatTimeoutMs);
  }

  private cancelTimers(): void {
    for (const timer of [this.reconnectTimer, this.watchdogTimer]) {
      if (timer !== null) {
        this.clearTimer(timer);
      }
    }
    this.reconnectTimer = null;
    this.watchdogTimer = null;
  }
}
