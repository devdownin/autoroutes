import type { StationMetrics } from '../realtime/protocol';

type Listener = () => void;

/**
 * État courant des gares, en colonnes typées indexées par l'ordre du référentiel.
 * Hors React : les deltas l'alimentent directement ; React ne lit qu'une version agrégée (1 notification par delta, ≤ 1 Hz).
 */
export class StationStore {
  readonly ids: readonly string[];
  readonly entries1h: Float64Array;
  readonly exits1h: Float64Array;
  readonly entries15m: Float64Array;
  readonly exits15m: Float64Array;
  readonly entries5m: Float64Array;
  readonly exits5m: Float64Array;
  readonly entriesToday: Float64Array;
  readonly exitsToday: Float64Array;
  readonly lastEventMs: Float64Array;
  /** Passages observés depuis la mise à jour précédente (variation du cumul du jour, ≥ 0). */
  readonly increment: Float64Array;

  private readonly indexById: ReadonlyMap<string, number>;
  private readonly changed = new Set<number>();
  private readonly listeners = new Set<Listener>();
  private unknownIds = 0;
  private versionCounter = 0;

  constructor(ids: readonly string[]) {
    this.ids = ids;
    this.indexById = new Map(ids.map((id, index) => [id, index]));
    const n = ids.length;
    this.entries1h = new Float64Array(n);
    this.exits1h = new Float64Array(n);
    this.entries15m = new Float64Array(n);
    this.exits15m = new Float64Array(n);
    this.entries5m = new Float64Array(n);
    this.exits5m = new Float64Array(n);
    this.entriesToday = new Float64Array(n);
    this.exitsToday = new Float64Array(n);
    this.lastEventMs = new Float64Array(n).fill(Number.NaN);
    this.increment = new Float64Array(n);
  }

  get size(): number {
    return this.ids.length;
  }

  get version(): number {
    return this.versionCounter;
  }

  /** Identifiants reçus mais absents du référentiel chargé : signal de référentiel désynchronisé. */
  get unknownStationCount(): number {
    return this.unknownIds;
  }

  indexOf(stationId: string): number | undefined {
    return this.indexById.get(stationId);
  }

  replaceAll(stations: readonly StationMetrics[]): void {
    for (const array of [this.entries1h, this.exits1h, this.entries15m, this.exits15m, this.entries5m, this.exits5m,
      this.entriesToday, this.exitsToday, this.increment]) {
      array.fill(0);
    }
    this.lastEventMs.fill(Number.NaN);
    this.unknownIds = 0;
    // Un snapshot n'est pas une activité nouvelle : pas d'incrément, donc pas d'impulsion visuelle.
    this.write(stations, false);
    for (let i = 0; i < this.size; i++) {
      this.changed.add(i);
    }
    this.publish();
  }

  applyDelta(stations: readonly StationMetrics[]): void {
    this.write(stations, true);
    this.publish();
  }

  /** Indices modifiés depuis le dernier appel ; consommé par le moteur d'animation. */
  drainChanged(): number[] {
    const drained = [...this.changed];
    this.changed.clear();
    return drained;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private write(stations: readonly StationMetrics[], trackIncrement: boolean): void {
    for (const metrics of stations) {
      const i = this.indexById.get(metrics.stationId);
      if (i === undefined) {
        this.unknownIds++;
        continue;
      }
      const previousToday = (this.entriesToday[i] ?? 0) + (this.exitsToday[i] ?? 0);
      const today = metrics.today.entries + metrics.today.exits;
      // Au passage de minuit le cumul repart de zéro : la baisse n'est pas une activité.
      this.increment[i] = trackIncrement ? Math.max(0, today - previousToday) : 0;
      this.entries1h[i] = metrics.last1h.entries;
      this.exits1h[i] = metrics.last1h.exits;
      this.entries15m[i] = metrics.last15m.entries;
      this.exits15m[i] = metrics.last15m.exits;
      this.entries5m[i] = metrics.last5m.entries;
      this.exits5m[i] = metrics.last5m.exits;
      this.entriesToday[i] = metrics.today.entries;
      this.exitsToday[i] = metrics.today.exits;
      this.lastEventMs[i] = metrics.lastEventTime === null ? Number.NaN : Date.parse(metrics.lastEventTime);
      this.changed.add(i);
    }
  }

  private publish(): void {
    this.versionCounter++;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
