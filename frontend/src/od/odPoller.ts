import type { OdFilters, OdView } from './odTypes';

export const OD_POLL_MS = 10_000;

export interface OdPollerOptions {
  readonly fetch: (filters: OdFilters, signal: AbortSignal) => Promise<OdView>;
  readonly onView: (view: OdView) => void;
  readonly onError: (error: unknown) => void;
}

/**
 * Lecture périodique des flux O/D filtrés (le serveur les recalcule toutes les 10 s).
 * Un changement de filtre relance aussitôt la lecture et abandonne celle en cours : une réponse tardive
 * d'anciens filtres ne remplace jamais la vue courante.
 */
export class OdPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private abort: AbortController | null = null;
  private filters: OdFilters | null = null;

  constructor(private readonly options: OdPollerOptions) {}

  start(filters: OdFilters): void {
    this.stop();
    this.filters = filters;
    this.poll();
    this.timer = setInterval(() => { this.poll(); }, OD_POLL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.abort?.abort();
    this.abort = null;
    this.filters = null;
  }

  private poll(): void {
    const filters = this.filters;
    if (filters === null) {
      return;
    }
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.options.fetch(filters, abort.signal).then(
      (view) => { if (!abort.signal.aborted) this.options.onView(view); },
      (error: unknown) => { if (!abort.signal.aborted) this.options.onError(error); },
    );
  }
}
