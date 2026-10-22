import { useLayoutEffect, useRef } from 'react';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { formatAxes } from '../map/axes';
import { formatCount, formatTime } from './format';
import { tooltipPosition } from './tooltipPosition';
import { useStoreVersion } from './useStoreVersion';

/** Aperçu d'une gare au survol, sans clic : nom, passages sur 15 min et fraîcheur. Le détail complet reste dans le panneau. */
export function StationTooltip({ stations, store }: { readonly stations: StationCollection; readonly store: StationStore }) {
  useStoreVersion(store);
  const hover = useUiStore((s) => s.hover);
  const staleIds = useUiStore((s) => s.freshness?.staleStations);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const container = element?.offsetParent;
    if (element !== null && container instanceof HTMLElement && hover !== null) {
      const { left, top } = tooltipPosition(hover, { width: container.clientWidth, height: container.clientHeight },
        { width: element.offsetWidth, height: element.offsetHeight });
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    }
  });

  const feature = hover === null ? undefined : stations.features[hover.index];
  if (hover === null || feature === undefined) {
    return null;
  }
  const p = feature.properties;
  const last = store.lastEventMs[hover.index];
  const stale = staleIds?.includes(p.id) ?? false;
  return (
    <div ref={ref} className="station-tooltip" role="tooltip">
      <strong>{p.name}</strong>
      <span className="tooltip-meta">{p.kind === 'ECHANGEUR' ? 'Gare d’échangeur' : 'Barrière pleine voie'} · {formatAxes(p.axes)}</span>
      <span>15 min : {formatCount(store.entries15m[hover.index] ?? 0)} entrées · {formatCount(store.exits15m[hover.index] ?? 0)} sorties</span>
      <span className={stale ? 'status-warn' : 'tooltip-meta'}>
        {stale ? 'Données périmées' : `Dernier passage ${formatTime(last === undefined || Number.isNaN(last) ? null : last)}`}
      </span>
    </div>
  );
}
