import type { StationMetrics } from '../realtime/protocol';
import type { MinuteRow, StationTotal } from '../history/historyApi';

/**
 * Données de relecture minute par minute, en sommes cumulées par gare : chaque fenêtre (5 min, 15 min, 1 h, jour)
 * se calcule en O(1). Couvre [startMinute, endMinute) ; {@code baseline} = cumul de minuit à startMinute.
 */
export class ReplayDataset {
  private readonly index: ReadonlyMap<string, number>;
  private readonly prefixEntries: Float64Array[];
  private readonly prefixExits: Float64Array[];
  private readonly baselineEntries: Float64Array;
  private readonly baselineExits: Float64Array;
  private built = false;

  constructor(
    private readonly stationIds: readonly string[],
    readonly startMinute: number,
    readonly endMinute: number,
    private readonly baselineMidnightMinute: number,
  ) {
    this.index = new Map(stationIds.map((id, i) => [id, i]));
    const length = endMinute - startMinute + 1;
    this.prefixEntries = stationIds.map(() => new Float64Array(length));
    this.prefixExits = stationIds.map(() => new Float64Array(length));
    this.baselineEntries = new Float64Array(stationIds.length);
    this.baselineExits = new Float64Array(stationIds.length);
  }

  addRows(rows: readonly MinuteRow[]): void {
    for (const row of rows) {
      const i = this.index.get(row.stationId);
      const m = Math.floor(row.t / 60) - this.startMinute;
      if (i === undefined || m < 0 || m >= this.endMinute - this.startMinute) {
        continue;
      }
      // Valeurs brutes stockées à m + 1 ; la passe build() les transforme en sommes cumulées.
      const entries = this.prefixEntries[i] as Float64Array;
      const exits = this.prefixExits[i] as Float64Array;
      entries[m + 1] = (entries[m + 1] ?? 0) + row.entries;
      exits[m + 1] = (exits[m + 1] ?? 0) + row.exits;
    }
  }

  setBaseline(rows: readonly StationTotal[]): void {
    for (const row of rows) {
      const i = this.index.get(row.stationId);
      if (i !== undefined) {
        this.baselineEntries[i] = row.entries;
        this.baselineExits[i] = row.exits;
      }
    }
  }

  build(): void {
    for (const arrays of [this.prefixEntries, this.prefixExits]) {
      for (const prefix of arrays) {
        for (let m = 1; m < prefix.length; m++) {
          prefix[m] = (prefix[m] ?? 0) + (prefix[m - 1] ?? 0);
        }
      }
    }
    this.built = true;
  }

  /** Indicateurs de toutes les gares à la fin de la minute {@code minute} (temps virtuel), journée commençant à {@code midnightMinute}. */
  metricsAt(minute: number, midnightMinute: number): StationMetrics[] {
    if (!this.built) {
      throw new Error('ReplayDataset.build() doit être appelé avant metricsAt()');
    }
    const m = Math.min(Math.max(minute, this.startMinute - 1), this.endMinute - 1) - this.startMinute + 1;
    return this.stationIds.map((stationId, i) => {
      const entries = this.prefixEntries[i] as Float64Array;
      const exits = this.prefixExits[i] as Float64Array;
      const window = (minutes: number) => {
        const from = Math.max(0, m - minutes);
        return { entries: (entries[m] ?? 0) - (entries[from] ?? 0), exits: (exits[m] ?? 0) - (exits[from] ?? 0) };
      };
      const today = midnightMinute >= this.startMinute
        ? window(m - (midnightMinute - this.startMinute))
        : midnightMinute === this.baselineMidnightMinute
          ? { entries: (this.baselineEntries[i] ?? 0) + (entries[m] ?? 0), exits: (this.baselineExits[i] ?? 0) + (exits[m] ?? 0) }
          : window(m);
      return { stationId, last5m: window(5), last15m: window(15), last1h: window(60), today, lastEventTime: null };
    });
  }
}
