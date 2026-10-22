import { sparklinePath, trend } from './sparkline';
import type { Trend } from './sparkline';
import { formatCount } from './format';

const WIDTH = 64;
const HEIGHT = 20;
const TREND_LABEL: Record<Trend, string> = { up: 'en hausse', down: 'en baisse', flat: 'stable' };

/** Tendance d'une série en 64 × 20 px, de 0 au maximum ; le texte accessible donne l'ordre de grandeur et le sens, pas les points. */
export function Sparkline({ values, unit }: { readonly values: readonly number[]; readonly unit: string }) {
  if (values.length < 2) {
    return <span className="sparkline sparkline-empty" aria-hidden="true" />;
  }
  const label = `${unit} : ${formatCount(Math.max(...values))} au plus haut, ${TREND_LABEL[trend(values)]}`;
  return (
    <svg className={`sparkline sparkline-${trend(values)}`} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
      <path d={sparklinePath(values, WIDTH, HEIGHT)} />
    </svg>
  );
}
