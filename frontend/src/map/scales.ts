export const RADIUS_MIN_PX = 2.5;
export const RADIUS_MAX_PX = 18;

/** Percentile par interpolation linéaire ; ignore les valeurs non finies. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const sorted = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const rank = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sorted[low] ?? 0;
  return lowValue + ((sorted[high] ?? lowValue) - lowValue) * (rank - low);
}

/**
 * Rayon proportionnel à la racine carrée du volume (surface ∝ volume).
 * La référence est un percentile élevé, pas le maximum : une gare exceptionnelle ne doit pas écraser toutes les autres.
 */
export function radiusFor(volume: number, reference: number): number {
  if (!(volume > 0) || !(reference > 0)) {
    return RADIUS_MIN_PX;
  }
  const ratio = Math.min(1, Math.sqrt(volume / reference));
  return RADIUS_MIN_PX + (RADIUS_MAX_PX - RADIUS_MIN_PX) * ratio;
}

/** Intensité d'impulsion en fonction des passages nouveaux, compressée par logarithme ; plancher pour rester perceptible. */
export function pulseStrength(newPassages: number): number {
  if (!(newPassages > 0)) {
    return 0;
  }
  return Math.min(1, Math.max(0.25, Math.log1p(newPassages) / Math.log1p(20)));
}

/** Largeur d'un flux O/D (px) en racine carrée du volume. */
export function flowWidth(vehicles: number, reference: number): number {
  if (!(vehicles > 0) || !(reference > 0)) {
    return 0.5;
  }
  return 0.5 + 5.5 * Math.min(1, Math.sqrt(vehicles / reference));
}
