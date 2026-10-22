import { useEffect, useState } from 'react';
import { stationSeries } from '../history/historyApi';
import type { SeriesPoint } from '../history/historyApi';
import { parisMidnight } from '../history/parisTime';
import { formatCount } from './format';

const WIDTH = 276;
const HEIGHT = 72;
const DAY_SECONDS = 86_400;
const REFRESH_MS = 60_000;

interface Comparison {
  readonly today: readonly SeriesPoint[];
  readonly lastWeek: readonly SeriesPoint[];
  readonly todayStart: number;
  readonly lastWeekStart: number;
}

const total = (points: readonly SeriesPoint[]) => points.reduce((sum, p) => sum + p.entries + p.exits, 0);

function path(points: readonly SeriesPoint[], dayStart: number, max: number): string {
  return points.map((p, i) => {
    const x = ((p.t - dayStart) / DAY_SECONDS) * WIDTH;
    const y = HEIGHT - ((p.entries + p.exits) / max) * (HEIGHT - 4);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/** Passages par quart d'heure depuis minuit (Paris) : aujourd'hui (trait plein) et même jour la semaine précédente (tirets). */
export function HistoryChart({ stationId }: { readonly stationId: string }) {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    const load = () => {
      const now = new Date();
      const midnight = parisMidnight(now);
      const weekAgo = new Date(now.getTime() - 7 * DAY_SECONDS * 1000);
      const midnightWeekAgo = parisMidnight(weekAgo);
      Promise.all([
        stationSeries(stationId, midnight, now, 'PT15M', abort.signal),
        stationSeries(stationId, midnightWeekAgo, weekAgo, 'PT15M', abort.signal),
      ]).then(([today, lastWeek]) => {
        setData({ today, lastWeek, todayStart: midnight.getTime() / 1000, lastWeekStart: midnightWeekAgo.getTime() / 1000 });
        setError(null);
      }, (e: unknown) => {
        if (!abort.signal.aborted) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { abort.abort(); window.clearInterval(timer); };
  }, [stationId]);

  if (error !== null) {
    return <p className="note">{error}</p>;
  }
  if (data === null) {
    return <p className="note">Chargement de l’historique…</p>;
  }
  const max = Math.max(1, ...data.today.map((p) => p.entries + p.exits), ...data.lastWeek.map((p) => p.entries + p.exits));
  return (
    <figure className="history-chart">
      <svg width={WIDTH} height={HEIGHT} role="img"
        aria-label={`Passages par quart d’heure : ${formatCount(total(data.today))} aujourd’hui, ${formatCount(total(data.lastWeek))} à la même heure il y a 7 jours`}>
        <path d={path(data.lastWeek, data.lastWeekStart, max)} className="series-last-week" />
        <path d={path(data.today, data.todayStart, max)} className="series-today" />
      </svg>
      <figcaption className="note">
        <span className="legend-today">— aujourd’hui {formatCount(total(data.today))}</span>{' '}
        <span className="legend-last-week">- - J-7 même heure {formatCount(total(data.lastWeek))}</span>
      </figcaption>
    </figure>
  );
}
