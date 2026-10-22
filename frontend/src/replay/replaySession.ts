import * as historyApi from '../history/historyApi';
import { parisMidnight } from '../history/parisTime';
import type { OdFilters, OdView } from '../od/odTypes';
import type { StationStore } from '../state/stationStore';
import { ReplayClock } from './replayClock';
import { ReplayDataset } from './replayDataset';

export type ReplayStatus = 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface ReplayOptions {
  readonly from: Date;
  readonly durationMinutes: number;
  readonly speed: number;
}

export interface ReplayCallbacks {
  readonly onData: () => void;
  readonly onTime: (time: Date) => void;
  readonly onStatus: (status: ReplayStatus, error?: string) => void;
  readonly onOd: (view: OdView) => void;
  /** Filtres courants de l'interface : relus à chaque rechargement des flux O/D. */
  readonly odFilters: () => OdFilters;
}

export type HistoryApi = Pick<typeof historyApi, 'minutes' | 'totals' | 'odFlows'>;

const MINUTE = 60_000;
const LOOKBACK_MINUTES = 60;
const CHUNK_MINUTES = 120;
const TICK_MS = 200;
const OD_EVERY_MINUTES = 15;
export const MAX_AGE_MS = 7 * 24 * 3_600_000;

/**
 * Relecture de l'historique OBSERVÉ dans le même store que le temps réel : la carte, l'animation et les panneaux
 * fonctionnent à l'identique, sur une horloge virtuelle accélérée. Le flux temps réel doit être suspendu pendant la relecture.
 */
export class ReplaySession {
  private dataset: ReplayDataset | null = null;
  private clock: ReplayClock | null = null;
  private timer: number | null = null;
  private lastMinute = Number.NaN;
  private lastOdMinute = Number.NEGATIVE_INFINITY;
  private readonly abort = new AbortController();

  constructor(
    private readonly store: StationStore,
    private readonly callbacks: ReplayCallbacks,
    private readonly api: HistoryApi = historyApi,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Plage valide : dans la rétention minute (7 jours, marge d'une heure pour les fenêtres glissantes) et terminée. */
  static validate(options: ReplayOptions, now: number): string | null {
    const start = options.from.getTime();
    if (Number.isNaN(start)) {
      return 'Date de début invalide';
    }
    if (start - LOOKBACK_MINUTES * MINUTE < now - MAX_AGE_MS) {
      return 'Relecture limitée aux 7 derniers jours';
    }
    if (start + options.durationMinutes * MINUTE > now) {
      return 'La période doit être entièrement passée';
    }
    return null;
  }

  async load(options: ReplayOptions): Promise<void> {
    const error = ReplaySession.validate(options, this.now());
    if (error !== null) {
      this.callbacks.onStatus('error', error);
      throw new Error(error);
    }
    this.callbacks.onStatus('loading');
    const fromMinute = Math.floor(options.from.getTime() / MINUTE);
    const startMinute = fromMinute - LOOKBACK_MINUTES;
    const endMinute = fromMinute + options.durationMinutes + 1;
    const midnight = parisMidnight(options.from);
    const midnightMinute = Math.floor(midnight.getTime() / MINUTE);
    const dataset = new ReplayDataset(this.store.ids, startMinute, endMinute, midnightMinute);
    try {
      if (midnightMinute < startMinute) {
        dataset.setBaseline(await this.api.totals(midnight, new Date(startMinute * MINUTE), this.abort.signal));
      }
      for (let chunk = startMinute; chunk < endMinute; chunk += CHUNK_MINUTES) {
        const chunkEnd = Math.min(chunk + CHUNK_MINUTES, endMinute);
        dataset.addRows(await this.api.minutes(new Date(chunk * MINUTE), new Date(chunkEnd * MINUTE), this.abort.signal));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.callbacks.onStatus('error', message);
      throw e;
    }
    dataset.build();
    this.dataset = dataset;
    this.clock = new ReplayClock(fromMinute * MINUTE, options.speed);
    this.store.replaceAll(dataset.metricsAt(fromMinute - 1, this.midnightOf(fromMinute * MINUTE)));
    this.lastMinute = fromMinute - 1;
    this.callbacks.onTime(new Date(fromMinute * MINUTE));
    this.callbacks.onData();
    this.callbacks.onStatus('paused');
  }

  play(): void {
    if (this.clock === null) {
      return;
    }
    this.clock.play();
    this.timer ??= window.setInterval(() => { this.tick(); }, TICK_MS);
    this.callbacks.onStatus('playing');
  }

  pause(): void {
    this.clock?.pause();
    this.callbacks.onStatus('paused');
  }

  setSpeed(speed: number): void {
    this.clock?.setSpeed(speed);
  }

  dispose(): void {
    this.abort.abort();
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Avance au temps virtuel courant ; exposé pour les tests (horloge simulée). */
  tick(): void {
    if (this.clock === null || this.dataset === null) {
      return;
    }
    const time = this.clock.time();
    const minute = Math.floor(time / MINUTE);
    const last = this.dataset.endMinute - 1;
    if (minute >= last) {
      this.clock.pause();
      this.apply(last - 1);
      this.callbacks.onTime(new Date(last * MINUTE));
      this.callbacks.onStatus('ended');
      return;
    }
    this.callbacks.onTime(new Date(time));
    if (minute !== this.lastMinute) {
      this.apply(minute);
    }
  }

  private apply(minute: number): void {
    if (this.dataset === null || minute === this.lastMinute) {
      return;
    }
    this.lastMinute = minute;
    this.store.applyDelta(this.dataset.metricsAt(minute, this.midnightOf(minute * MINUTE)));
    this.callbacks.onData();
    if (minute - this.lastOdMinute >= OD_EVERY_MINUTES) {
      this.loadOd(minute);
    }
  }

  /** Recharge les flux O/D de l'heure écoulée avec les filtres courants (changement de filtre pendant la relecture). */
  refreshOd(): void {
    if (Number.isFinite(this.lastMinute)) {
      this.loadOd(this.lastMinute);
    }
  }

  private loadOd(minute: number): void {
    this.lastOdMinute = minute;
    const to = new Date((minute + 1) * MINUTE);
    this.api.odFlows(new Date(to.getTime() - 60 * MINUTE), to, this.callbacks.odFilters(), this.abort.signal)
      .then((view) => { this.callbacks.onOd(view); }, () => { /* flux O/D facultatifs pendant la relecture */ });
  }

  private midnightOf(time: number): number {
    return Math.floor(parisMidnight(new Date(time)).getTime() / MINUTE);
  }
}
