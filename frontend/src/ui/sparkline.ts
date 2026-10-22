export interface SparklinePoint {
  readonly x: number;
  readonly y: number;
}

/** Valeurs régulièrement espacées → points d'un graphe de `width` × `height` pixels ; l'échelle va de 0 au maximum de la série. */
export function sparklinePoints(values: readonly number[], width: number, height: number, padding = 2): SparklinePoint[] {
  if (values.length === 0) {
    return [];
  }
  const max = Math.max(...values, 0);
  const inner = height - 2 * padding;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, i) => ({
    x: Math.round(i * step * 10) / 10,
    y: Math.round((padding + (max > 0 ? inner * (1 - value / max) : inner)) * 10) / 10,
  }));
}

export function sparklinePath(values: readonly number[], width: number, height: number): string {
  return sparklinePoints(values, width, height).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

export type Trend = 'up' | 'down' | 'flat';

/** Tendance entre la première et la seconde moitié de la série, avec une tolérance de 10 % pour ne pas qualifier le bruit. */
export function trend(values: readonly number[]): Trend {
  if (values.length < 2) {
    return 'flat';
  }
  const half = Math.floor(values.length / 2);
  const sum = (part: readonly number[]) => part.reduce((total, v) => total + v, 0);
  const before = sum(values.slice(0, half)) / half;
  const after = sum(values.slice(values.length - half)) / half;
  if (before === 0 && after === 0) {
    return 'flat';
  }
  const ratio = after / Math.max(before, 1e-9);
  return ratio > 1.1 ? 'up' : ratio < 0.9 ? 'down' : 'flat';
}
