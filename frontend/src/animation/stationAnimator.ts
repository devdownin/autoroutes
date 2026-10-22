import { clamp01, easeOutCubic } from './easing';

export interface AnimatorOptions {
  readonly transitionMs: number;
  readonly pulseMs: number;
  /** Intervalle minimal entre deux impulsions d'une même gare : empêche tout clignotement permanent d'une gare très active. */
  readonly pulseCooldownMs: number;
}

export const DEFAULT_ANIMATOR_OPTIONS: AnimatorOptions = { transitionMs: 800, pulseMs: 1_400, pulseCooldownMs: 6_000 };

/**
 * Valeurs visuelles des gares calculées à partir de l'horodatage de l'image, jamais par incrément par image :
 * la progression est indépendante du rythme des messages et de la fréquence d'affichage.
 */
export class StationAnimator {
  readonly radius: Float32Array;
  readonly halo: Float32Array;

  private readonly from: Float32Array;
  private readonly to: Float32Array;
  private readonly transitionStart: Float64Array;
  private readonly pulseStart: Float64Array;
  private readonly pulseStrength: Float32Array;
  private readonly active = new Set<number>();
  private reducedMotion = false;

  constructor(count: number, private readonly options: AnimatorOptions = DEFAULT_ANIMATOR_OPTIONS) {
    this.radius = new Float32Array(count);
    this.halo = new Float32Array(count);
    this.from = new Float32Array(count);
    this.to = new Float32Array(count);
    this.transitionStart = new Float64Array(count).fill(Number.NEGATIVE_INFINITY);
    this.pulseStart = new Float64Array(count).fill(Number.NEGATIVE_INFINITY);
    this.pulseStrength = new Float32Array(count);
  }

  get animating(): boolean {
    return this.active.size > 0;
  }

  /** Mouvement réduit : valeurs appliquées immédiatement, aucune impulsion. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) {
      for (const i of this.active) {
        this.radius[i] = this.to[i] ?? 0;
        this.halo[i] = 0;
      }
    }
  }

  setTarget(index: number, radius: number, now: number): void {
    if (this.to[index] === radius) {
      return;
    }
    // Une nouvelle cible en cours de transition repart de la valeur affichée : pas de saut visuel.
    this.from[index] = this.radius[index] ?? 0;
    this.to[index] = radius;
    this.transitionStart[index] = now;
    if (this.reducedMotion || this.options.transitionMs === 0) {
      this.radius[index] = radius;
      this.from[index] = radius;
    }
    this.active.add(index);
  }

  /** @returns vrai si l'impulsion est déclenchée (hors délai de garde et hors mouvement réduit) */
  pulse(index: number, strength: number, now: number): boolean {
    if (this.reducedMotion || now - (this.pulseStart[index] ?? Number.NEGATIVE_INFINITY) < this.options.pulseCooldownMs) {
      return false;
    }
    this.pulseStart[index] = now;
    this.pulseStrength[index] = clamp01(strength);
    this.active.add(index);
    return true;
  }

  /** Calcule l'image `now` ; renvoie les indices dont la valeur visuelle a changé. */
  step(now: number): number[] {
    const dirty: number[] = [];
    for (const i of this.active) {
      const transition = this.options.transitionMs === 0
        ? 1
        : clamp01((now - (this.transitionStart[i] ?? 0)) / this.options.transitionMs);
      const from = this.from[i] ?? 0;
      const to = this.to[i] ?? 0;
      this.radius[i] = from + (to - from) * easeOutCubic(transition);

      const pulseProgress = clamp01((now - (this.pulseStart[i] ?? Number.NEGATIVE_INFINITY)) / this.options.pulseMs);
      this.halo[i] = this.reducedMotion ? 0 : (this.pulseStrength[i] ?? 0) * (1 - pulseProgress) ** 2;

      dirty.push(i);
      if (transition >= 1 && pulseProgress >= 1) {
        this.halo[i] = 0;
        this.active.delete(i);
      }
    }
    return dirty;
  }
}
