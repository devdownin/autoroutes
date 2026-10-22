import { useMemo } from 'react';
import { buildAxisGroups } from '../map/axes';
import type { AxisGroup } from '../map/axes';
import { visibleFlows } from '../od/odList';
import { config } from '../config';
import type { StationCollection } from '../map/referentiel';
import { DEFAULT_OD_FILTERS, isDefaultFilters } from '../od/odTypes';
import type { OdLevel, OdRole } from '../od/odTypes';
import { useUiStore } from '../state/uiStore';
import type { FlowKey } from '../state/uiStore';
import { EmptyState } from './EmptyState';
import { Section } from './Section';
import { formatCount } from './format';

const LEVELS: readonly { readonly value: OdLevel; readonly label: string }[] = [
  { value: 'STATION', label: 'Gares' },
  { value: 'DEPARTMENT', label: 'Départements' },
];

const ROLES: readonly { readonly value: OdRole; readonly label: string }[] = [
  { value: 'ANY', label: 'Origine ou destination' },
  { value: 'ORIGIN', label: 'Origine' },
  { value: 'DESTINATION', label: 'Destination' },
];

const TOP = 10;

/** Départements et axes proposés par le référentiel chargé ; les axes sont regroupés (A0007 et A0007N sont « A7 »). */
export function filterOptions(stations: StationCollection): { departments: string[]; axes: AxisGroup[] } {
  const departments = new Set<string>();
  for (const { properties } of stations.features) {
    if (properties.dept !== '') departments.add(properties.dept);
  }
  return { departments: [...departments].sort(), axes: buildAxisGroups(stations) };
}

export function OdPanel({ stations, onFocusFlow }: {
  readonly stations: StationCollection;
  /** Cadre la carte sur le flux choisi dans la liste. */
  readonly onFocusFlow: (flow: FlowKey) => void;
}) {
  const view = useUiStore((s) => s.odView);
  const filters = useUiStore((s) => s.odFilters);
  const setFilters = useUiStore((s) => s.setOdFilters);
  const includeInternal = useUiStore((s) => s.odIncludeInternal);
  const setIncludeInternal = useUiStore((s) => s.setOdIncludeInternal);
  const highlight = useUiStore((s) => s.setHighlightedFlow);
  const error = useUiStore((s) => s.odError);
  const mode = useUiStore((s) => s.mode);
  const options = useMemo(() => filterOptions(stations), [stations]);
  const names = useMemo(() => {
    const map = new Map(stations.features.map((f) => [f.properties.id, f.properties.name]));
    view.nodes.forEach((n) => { map.set(n.id, n.name); });
    return map;
  }, [stations, view.nodes]);
  const { shown, hiddenInternal } = useMemo(() => visibleFlows(view.flows, includeInternal), [view.flows, includeInternal]);
  const label = (id: string) => names.get(id) ?? id;
  const filtered = !config.demo;
  const departments = filters.level === 'DEPARTMENT';

  return (
    <Section id="od" title="Flux O/D" label="Panneau des flux O/D" badge={<span className="tag section-tag">observé</span>}>
      {filtered && (
        <div className="od-filters">
          <label>Niveau
            <select aria-label="Niveau des flux" value={filters.level} onChange={(e) => { setFilters({ level: e.target.value as OdLevel }); }}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <label>Département
            <select aria-label="Département" value={filters.department} onChange={(e) => { setFilters({ department: e.target.value }); }}>
              <option value="">Tous</option>
              {options.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label>Axe
            <select aria-label="Axe" value={filters.axis} onChange={(e) => { setFilters({ axis: e.target.value }); }}>
              <option value="">Tous</option>
              {options.axes.map((a) => <option key={a.id} value={a.value}>{a.id}</option>)}
            </select>
          </label>
          <label>Le filtre porte sur
            <select aria-label="Côté du filtre" value={filters.role} onChange={(e) => { setFilters({ role: e.target.value as OdRole }); }}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
        </div>
      )}
      {departments && (
        <label className="check-row">
          <input type="checkbox" checked={includeInternal} onChange={(e) => { setIncludeInternal(e.target.checked); }} /> Inclure les flux internes à un département
        </label>
      )}
      {error !== null && (
        <EmptyState tone="error" title="Flux O/D indisponibles" actions={[{ label: 'Réessayer', onClick: () => { setFilters({}); } }]}>
          {error}. La lecture reprend seule toutes les 10 s.
        </EmptyState>
      )}
      {error === null && shown.length === 0 && (
        <EmptyState title="Aucun flux à afficher" actions={emptyActions()}>
          {hiddenInternal > 0
            ? `${formatCount(hiddenInternal)} flux internes sont masqués.`
            : 'Les flux de moins de 3 véhicules sur l’heure ne sont jamais affichés (protection des données personnelles).'}
        </EmptyState>
      )}
      {shown.length > 0 && (
        <ol className="od-top" aria-label="Principaux flux">
          {shown.slice(0, TOP).map((f) => {
            const key = { originId: f.originId, destinationId: f.destinationId };
            return (
              <li key={`${f.originId}>${f.destinationId}`}>
                <button type="button" className="od-row" onMouseEnter={() => { highlight(key); }} onMouseLeave={() => { highlight(null); }}
                  onFocus={() => { highlight(key); }} onBlur={() => { highlight(null); }} onClick={() => { onFocusFlow(key); }}>
                  <span className="od-route">{f.originId === f.destinationId ? `${label(f.originId)} (interne)` : `${label(f.originId)} → ${label(f.destinationId)}`}</span>
                  <span className="od-count">{formatCount(f.vehicles)} véh.</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {departments && hiddenInternal > 0 && shown.length > 0 && (
        <p className="note">{formatCount(hiddenInternal)} flux internes masqués.</p>
      )}
      {view.maskedFlows > 0 && (
        <p className="note" data-testid="od-masked">
          {formatCount(view.maskedFlows)} flux de moins de 3 véhicules non affichés ({formatCount(view.maskedVehicles)} véh.), protection des données personnelles.
        </p>
      )}
      {view.truncated && <p className="note">Liste tronquée aux flux les plus importants.</p>}
      {mode === 'replay' && <p className="note">Relecture : flux de l’heure écoulée, mêmes filtres.</p>}
    </Section>
  );

  /** Issues concrètes selon la cause probable du vide : filtres trop étroits, flux internes écartés, ou niveau trop fin. */
  function emptyActions() {
    if (hiddenInternal > 0) {
      return [{ label: 'Afficher les flux internes', onClick: () => { setIncludeInternal(true); } }];
    }
    if (!isDefaultFilters(filters)) {
      return [{ label: 'Retirer les filtres', onClick: () => { setFilters(DEFAULT_OD_FILTERS); } }];
    }
    if (!departments && filtered) {
      return [{ label: 'Voir par départements', onClick: () => { setFilters({ level: 'DEPARTMENT' }); } }];
    }
    return [];
  }
}
