import type { QualityLevel } from '../animation/frameLoop';
import type { StationAnimator } from '../animation/stationAnimator';
import type { StationStore } from '../state/stationStore';
import { SOURCE } from './layers';
import { percentile, pulseStrength, radiusFor } from './scales';

/** Seule méthode de la carte utilisée : permet de tester le pont sans WebGL. */
export interface FeatureStateTarget {
  setFeatureState(feature: { source: string; id: number }, state: Record<string, unknown>): void;
}

/** Fréquence maximale des écritures vers la carte selon le niveau de qualité (ms entre deux lots). */
const FLUSH_INTERVAL_MS: Record<QualityLevel, number> = { 0: 33, 1: 50, 2: 250 };

/**
 * Pont état → animation → carte. Les deltas fixent des cibles ; chaque image ne pousse vers MapLibre
 * que les gares dont la valeur visuelle a changé, par lots à fréquence plafonnée.
 */
export class StationLayerRenderer {
  private readonly pending = new Set<number>();
  private lastFlush = Number.NEGATIVE_INFINITY;
  private stale = new Set<number>();
  private selected: number | null = null;

  constructor(
    private readonly map: FeatureStateTarget,
    private readonly store: StationStore,
    private readonly animator: StationAnimator,
  ) {}

  /** À appeler après un snapshot ou un delta (≤ 1 Hz). */
  onData(now: number): void {
    const totals = new Float64Array(this.store.size);
    for (let i = 0; i < this.store.size; i++) {
      totals[i] = (this.store.entries1h[i] ?? 0) + (this.store.exits1h[i] ?? 0);
    }
    const reference = Math.max(1, percentile(totals, 0.95));
    for (const i of this.store.drainChanged()) {
      this.animator.setTarget(i, radiusFor(totals[i] ?? 0, reference), now);
      const strength = pulseStrength(this.store.increment[i] ?? 0);
      if (strength > 0) {
        this.animator.pulse(i, strength, now);
      }
    }
  }

  /** @returns vrai tant qu'il reste des images à produire */
  renderFrame(now: number, quality: QualityLevel): boolean {
    for (const i of this.animator.step(now)) {
      this.pending.add(i);
    }
    if (this.pending.size > 0 && now - this.lastFlush >= FLUSH_INTERVAL_MS[quality]) {
      for (const i of this.pending) {
        this.map.setFeatureState(
          { source: SOURCE.stations, id: i },
          { r: this.animator.radius[i] ?? 0, halo: quality >= 1 ? 0 : this.animator.halo[i] ?? 0 },
        );
      }
      this.pending.clear();
      this.lastFlush = now;
    }
    return this.animator.animating || this.pending.size > 0;
  }

  setStale(indices: ReadonlySet<number>): void {
    for (const i of this.stale) {
      if (!indices.has(i)) {
        this.map.setFeatureState({ source: SOURCE.stations, id: i }, { stale: false });
      }
    }
    for (const i of indices) {
      this.map.setFeatureState({ source: SOURCE.stations, id: i }, { stale: true });
    }
    this.stale = new Set(indices);
  }

  setSelected(index: number | null): void {
    if (this.selected !== null) {
      this.map.setFeatureState({ source: SOURCE.stations, id: this.selected }, { selected: false });
    }
    if (index !== null) {
      this.map.setFeatureState({ source: SOURCE.stations, id: index }, { selected: true });
    }
    this.selected = index;
  }
}
