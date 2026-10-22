import type { EventSourceLike } from '../realtime/streamClient';
import type { OdFlow, StationMetrics, StreamMessage } from '../realtime/protocol';

export interface DemoStation {
  readonly id: string;
  readonly lanes: number;
  readonly coordinates: readonly [number, number];
}

/**
 * Flux SSE SIMULÉ, exécuté dans le navigateur pour la démonstration hors backend.
 * Il emprunte exactement le même chemin (protocole, synchronisation, animation) que le flux réel.
 * Toutes les valeurs sont fictives ; l'interface affiche en permanence un bandeau « données simulées ».
 */
export class DemoEventSource implements EventSourceLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  private readonly timers: number[] = [];
  private readonly epoch = crypto.randomUUID();
  private readonly entriesToday: Float64Array;
  private readonly exitsToday: Float64Array;
  private readonly rate1h: Float64Array;
  private seq = 0;

  constructor(private readonly stations: readonly DemoStation[], private readonly random: () => number = Math.random) {
    this.entriesToday = new Float64Array(stations.length);
    this.exitsToday = new Float64Array(stations.length);
    this.rate1h = new Float64Array(stations.length);
    stations.forEach((station, i) => {
      const base = station.lanes * 40 * (0.5 + random());
      this.rate1h[i] = base;
      this.entriesToday[i] = Math.round(base * 6);
      this.exitsToday[i] = Math.round(base * 6 * (0.9 + random() * 0.2));
    });
    this.timers.push(window.setTimeout(() => { this.open(); }, 50));
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = 2;
    this.timers.forEach((id) => { window.clearTimeout(id); window.clearInterval(id); });
  }

  private open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
    this.emit({ ...this.envelope('snapshot'), seq: this.seq, payload: { stations: this.allMetrics(), referentielVersion: 'demo' } });
    this.emitFreshness();
    this.emitOd();
    this.timers.push(window.setInterval(() => { this.tick(); }, 1_000));
    this.timers.push(window.setInterval(() => { this.emitOd(); this.emitFreshness(); }, 10_000));
    this.timers.push(window.setInterval(() => { this.emit({ ...this.envelope('heartbeat'), payload: {} }); }, 15_000));
  }

  private tick(): void {
    const changed: StationMetrics[] = [];
    this.stations.forEach((station, i) => {
      // Activité aléatoire proportionnelle au nombre de voies : une gare sur six environ reçoit des passages à chaque seconde.
      if (this.random() > 0.17) {
        return;
      }
      const passages = 1 + Math.floor(this.random() * station.lanes);
      const entries = Math.round(passages * this.random());
      this.entriesToday[i] = (this.entriesToday[i] ?? 0) + entries;
      this.exitsToday[i] = (this.exitsToday[i] ?? 0) + passages - entries;
      this.rate1h[i] = (this.rate1h[i] ?? 0) * 0.98 + passages * 6;
      changed.push(this.metrics(i));
    });
    if (changed.length > 0) {
      this.emit({ ...this.envelope('delta'), seq: ++this.seq, payload: { stations: changed } });
    }
  }

  private emitOd(): void {
    const flows: OdFlow[] = [];
    for (let k = 0; k < 120; k++) {
      const origin = this.stations[Math.floor(this.random() * this.stations.length)];
      const destination = this.stations[Math.floor(this.random() * this.stations.length)];
      if (origin !== undefined && destination !== undefined && origin.id !== destination.id) {
        flows.push({ originId: origin.id, destinationId: destination.id, vehicles: 3 + Math.floor(this.random() ** 3 * 400) });
      }
    }
    this.emit({ ...this.envelope('od'), payload: { window: 'PT1H', nature: 'OBSERVED', minVehicles: 3, flows } });
  }

  private emitFreshness(): void {
    this.emit({
      ...this.envelope('freshness'),
      payload: { status: 'LIVE', consumerLag: 0, watermarkLagSeconds: 1, staleStations: [] },
    });
  }

  private allMetrics(): StationMetrics[] {
    return this.stations.map((_, i) => this.metrics(i));
  }

  private metrics(i: number): StationMetrics {
    const hour = this.rate1h[i] ?? 0;
    const split = (total: number) => ({ entries: Math.round(total * 0.5), exits: Math.round(total * 0.5) });
    return {
      stationId: this.stations[i]?.id ?? '',
      last5m: split(hour / 12),
      last15m: split(hour / 4),
      last1h: split(hour),
      today: { entries: this.entriesToday[i] ?? 0, exits: this.exitsToday[i] ?? 0 },
      lastEventTime: new Date().toISOString(),
    };
  }

  private envelope<T extends StreamMessage['type']>(type: T) {
    const now = new Date().toISOString();
    return { type, epoch: this.epoch, sentAt: now, watermark: now };
  }

  private emit(message: StreamMessage): void {
    const event = new MessageEvent<string>(message.type, { data: JSON.stringify(message), lastEventId: `${message.epoch}:${this.seq}` });
    for (const listener of this.listeners.get(message.type) ?? []) {
      listener(event);
    }
  }
}
