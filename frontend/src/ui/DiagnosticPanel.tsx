import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { formatCount, formatPercent } from './format';
import { useStoreVersion } from './useStoreVersion';

export function DiagnosticPanel({ store }: { readonly store: StationStore }) {
  useStoreVersion(store);
  const open = useUiStore((s) => s.diagnosticOpen);
  const connection = useUiStore((s) => s.connection);
  const freshness = useUiStore((s) => s.freshness);
  const resyncCount = useUiStore((s) => s.resyncCount);
  const quality = useUiStore((s) => s.quality);
  const coverage = useUiStore((s) => s.odView.coverage);
  if (!open) {
    return null;
  }
  return (
    <section className="diagnostic" aria-label="Diagnostic du flux">
      <dl>
        <dt>Connexion</dt><dd>{connection}</dd>
        <dt>Fraîcheur</dt><dd>{freshness?.status ?? '–'}</dd>
        <dt>Retard watermark</dt><dd>{freshness === null ? '–' : `${formatCount(freshness.watermarkLagSeconds)} s`}</dd>
        <dt>Retard consommateur</dt><dd>{freshness === null ? '–' : formatCount(freshness.consumerLag)}</dd>
        <dt>Gares périmées</dt><dd>{formatCount(freshness?.staleStations.length ?? 0)}</dd>
        <dt>Sorties avec origine connue</dt>
        <dd>{coverage === null || coverage.recorded + coverage.entryMissing + coverage.entryUnknown === 0 ? '–'
          : formatPercent(coverage.recorded / (coverage.recorded + coverage.entryMissing + coverage.entryUnknown))}</dd>
        <dt>Sorties sans origine (système ouvert)</dt><dd>{coverage === null ? '–' : formatCount(coverage.openSystem)}</dd>
        <dt>Resynchronisations</dt><dd>{formatCount(resyncCount)}</dd>
        <dt>Gares inconnues reçues</dt><dd>{formatCount(store.unknownStationCount)}</dd>
        <dt>Version d’état</dt><dd>{formatCount(store.version)}</dd>
        <dt>Qualité de rendu</dt><dd>{['complète', 'sans halos', 'réduite'][quality]}</dd>
      </dl>
    </section>
  );
}
