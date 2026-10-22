import { config } from '../config';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import type { FlowKey } from '../state/uiStore';
import { formatAxes } from '../map/axes';
import { formatCount, formatSigned, formatTime } from './format';
import { HistoryChart } from './HistoryChart';
import { flowsOfStation } from './stationFlows';
import { useStoreVersion } from './useStoreVersion';

const TOP_FLOWS = 5;

/** Principaux flux O/D de la gare, lus dans la liste déjà chargée : mêmes filtres, même seuil de 3 véhicules que la section « Flux O/D ». */
function StationFlows({ stationId, stations, onFocusFlow }: {
  readonly stationId: string;
  readonly stations: StationCollection;
  readonly onFocusFlow: (flow: FlowKey) => void;
}) {
  const view = useUiStore((s) => s.odView);
  const odLayer = useUiStore((s) => s.layers.od);
  const toggleLayer = useUiStore((s) => s.toggleLayer);
  const highlight = useUiStore((s) => s.setHighlightedFlow);
  const names = new Map(stations.features.map((f) => [f.properties.id, f.properties.name]));
  view.nodes.forEach((n) => { names.set(n.id, n.name); });
  // Hors démonstration, la liste n'est relue par l'API que si la couche des flux est affichée.
  if (!config.demo && !odLayer) {
    return (
      <div className="detail-flows">
        <h3>Principaux flux</h3>
        <button type="button" className="icon-button" onClick={() => { toggleLayer('od'); }}>Afficher les flux O/D</button>
      </div>
    );
  }
  if (view.level !== 'STATION') {
    return <div className="detail-flows"><h3>Principaux flux</h3><p className="note">Les flux sont regroupés par départements : choisissez le niveau « Gares » pour voir ceux de cette gare.</p></div>;
  }
  const flows = flowsOfStation(view.flows, stationId, TOP_FLOWS);
  return (
    <div className="detail-flows">
      <h3>Principaux flux <span className="tag section-tag">observé</span></h3>
      {flows.length === 0
        ? <p className="note">Aucun flux d’au moins 3 véhicules sur l’heure pour cette gare, avec les filtres actuels.</p>
        : (
          <ol aria-label="Principaux flux de la gare">
            {flows.map((f) => {
              const key = f.direction === 'out' ? { originId: stationId, destinationId: f.otherId } : { originId: f.otherId, destinationId: stationId };
              return (
                <li key={`${f.direction}-${f.otherId}`}>
                  <button type="button" className="od-row" onMouseEnter={() => { highlight(key); }} onMouseLeave={() => { highlight(null); }}
                    onFocus={() => { highlight(key); }} onBlur={() => { highlight(null); }} onClick={() => { onFocusFlow(key); }}>
                    <span className="od-route">{f.direction === 'out' ? 'Vers' : 'Depuis'} {names.get(f.otherId) ?? f.otherId}</span>
                    <span className="od-count">{formatCount(f.vehicles)} véh.</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
    </div>
  );
}

export function StationDetail({ stations, store, onFocusFlow }: {
  readonly stations: StationCollection;
  readonly store: StationStore;
  readonly onFocusFlow: (flow: FlowKey) => void;
}) {
  useStoreVersion(store);
  const index = useUiStore((s) => s.selectedIndex);
  const select = useUiStore((s) => s.select);
  const staleIds = useUiStore((s) => s.freshness?.staleStations);
  const feature = index === null ? undefined : stations.features[index];
  if (index === null || feature === undefined) {
    return null;
  }
  const p = feature.properties;
  const rows: [string, number, number][] = [
    ['5 min', store.entries5m[index] ?? 0, store.exits5m[index] ?? 0],
    ['15 min', store.entries15m[index] ?? 0, store.exits15m[index] ?? 0],
    ['1 h', store.entries1h[index] ?? 0, store.exits1h[index] ?? 0],
    ['Aujourd’hui', store.entriesToday[index] ?? 0, store.exitsToday[index] ?? 0],
  ];
  const stale = staleIds?.includes(p.id) ?? false;
  return (
    <section className="detail" aria-label={`Détail de la gare ${p.name}`}>
      <header>
        <div>
          <h2>{p.name}</h2>
          <span className="tag">{p.kind === 'ECHANGEUR' ? 'Gare d’échangeur' : 'Barrière pleine voie'}</span>{' '}
          <span className="tag">{formatAxes(p.axes)}</span>{' '}
          <span className="tag">Dép. {p.dept}</span>
        </div>
        <button type="button" className="icon-button" onClick={() => { select(null); }} aria-label="Fermer le détail">✕</button>
      </header>
      <table>
        <thead><tr><th>Fenêtre</th><th>Entrées</th><th>Sorties</th><th>Solde</th></tr></thead>
        <tbody>
          {rows.map(([label, entries, exits]) => (
            <tr key={label}><td>{label}</td><td>{formatCount(entries)}</td><td>{formatCount(exits)}</td><td>{formatSigned(entries - exits)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        Dernier passage : {formatTime(Number.isNaN(store.lastEventMs[index] ?? Number.NaN) ? null : store.lastEventMs[index] ?? null)}
        {stale && <strong className="status-warn"> — données périmées</strong>}
      </p>
      {!config.demo && <HistoryChart stationId={p.id} />}
      <StationFlows stationId={p.id} stations={stations} onFocusFlow={onFocusFlow} />
      <p className="note">{formatCount(p.lanes)} voies. Le solde n’est pas un nombre de véhicules présents. La répartition par classe de véhicule n’est pas diffusée par le flux.</p>
    </section>
  );
}
