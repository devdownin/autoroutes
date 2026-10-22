import { useEffect, useState } from 'react';
import { config } from '../config';
import { stationSeries } from '../history/historyApi';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { EmptyState } from './EmptyState';
import { Section } from './Section';
import { Sparkline } from './Sparkline';
import { formatCount } from './format';
import { topStations } from './topStations';
import { useStoreVersion } from './useStoreVersion';

const TOP = 8;
const HOURS = 3;
const REFRESH_MS = 60_000;
/** Le classement ne se réordonne pas à chaque delta : un seul rafraîchissement toutes les 10 s suffit à le lire. */
const RANK_MS = 10_000;

/** Passages par quart d'heure sur les dernières heures (historique OBSERVÉ) ; vide tant que la réponse n'est pas arrivée ou en relecture. */
function useSeries(stationId: string, enabled: boolean): readonly number[] {
  const [values, setValues] = useState<readonly number[]>([]);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const abort = new AbortController();
    const load = () => {
      const to = new Date();
      stationSeries(stationId, new Date(to.getTime() - HOURS * 3_600_000), to, 'PT15M', abort.signal).then(
        (points) => { setValues(points.map((p) => p.entries + p.exits)); },
        () => { /* tendance facultative : l'absence de courbe suffit */ },
      );
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { abort.abort(); window.clearInterval(timer); };
  }, [stationId, enabled]);
  return enabled ? values : [];
}

function Row({ name, passages, stationId, history, onFocus }: {
  readonly name: string;
  readonly passages: number;
  readonly stationId: string;
  readonly history: boolean;
  readonly onFocus: () => void;
}) {
  const values = useSeries(stationId, history);
  return (
    <li>
      <button type="button" className="activity-row" onClick={onFocus}>
        <span className="activity-name">{name}</span>
        <Sparkline values={values} unit={`Passages par quart d’heure sur ${HOURS} h`} />
        <span className="activity-count">{formatCount(passages)}</span>
      </button>
    </li>
  );
}

/** Gares les plus actives sur l'heure écoulée, avec la tendance des dernières heures. Le chiffre est observé (flux temps réel ou relecture). */
export function ActivityPanel({ stations, store, onFocus }: {
  readonly stations: StationCollection;
  readonly store: StationStore;
  readonly onFocus: (index: number) => void;
}) {
  const version = useStoreVersion(store);
  const mode = useUiStore((s) => s.mode);
  const [rows, setRows] = useState(() => topStations(store, TOP));
  useEffect(() => {
    const refresh = () => { setRows(topStations(store, TOP)); };
    const timer = window.setInterval(refresh, RANK_MS);
    return () => { window.clearInterval(timer); };
  }, [store]);
  // Tant que rien n'est classé, la liste suit le store (premières données) ; ensuite elle est figée entre deux rafraîchissements.
  const ranked = rows.length === 0 && version > 0 ? topStations(store, TOP) : rows;
  // La démonstration n'a pas d'historique, et la relecture montre un autre instant que « maintenant ».
  const history = !config.demo && mode === 'live';
  return (
    <Section id="activity" title="Gares les plus actives" badge={<span className="tag section-tag">observé</span>}>
      {ranked.length === 0
        ? <EmptyState title="Aucun passage sur l’heure">Les gares apparaissent dès les premiers passages observés.</EmptyState>
        : (
          <>
            <p className="note">Passages (entrées + sorties) sur 1 h{history ? `, courbe : ${HOURS} dernières heures par quart d’heure` : ''}.</p>
            <ol className="activity-list" aria-label="Gares les plus actives">
              {ranked.map((row) => (
                <Row key={row.id} name={stations.features[row.index]?.properties.name ?? row.id} passages={row.passages}
                  stationId={row.id} history={history} onFocus={() => { onFocus(row.index); }} />
              ))}
            </ol>
          </>
        )}
    </Section>
  );
}
