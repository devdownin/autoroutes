import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { formatCount, formatTime } from './format';
import { useStoreVersion } from './useStoreVersion';

const sum = (array: Float64Array): number => array.reduce((total, value) => total + value, 0);

function ConnectionBadge() {
  const connection = useUiStore((s) => s.connection);
  const freshness = useUiStore((s) => s.freshness);
  const mode = useUiStore((s) => s.mode);
  const speed = useUiStore((s) => s.replay.speed);
  const [label, tone] = mode === 'replay'
    ? [`Relecture ×${speed}`, 'status-replay']
    : connection !== 'open'
    ? [connection === 'closed' ? 'Déconnecté' : 'Reconnexion…', 'status-danger']
    : freshness?.status === 'STALE'
      ? ['Données périmées', 'status-danger']
      : freshness?.status === 'CATCHING_UP'
        ? ['Rattrapage', 'status-warn']
        : ['Temps réel', 'status-ok'];
  return <span className={`status ${tone}`} role="status" aria-live="polite" data-tour="status">{label}</span>;
}

function Account() {
  const me = useUiStore((s) => s.me);
  if (me?.authenticated !== true) {
    return null;
  }
  return (
    <form method="post" action="/logout" className="account">
      <span className="account-name" title={me.roles.join(', ')}>{me.name}</span>
      <button type="submit" className="icon-button">Déconnexion</button>
    </form>
  );
}

/** Ouvre ou ferme le tiroir du panneau latéral ; visible seulement sur petit écran (feuille de style). */
function DrawerToggle() {
  const open = useUiStore((s) => s.drawerOpen);
  const setOpen = useUiStore((s) => s.setDrawerOpen);
  return (
    <button id="drawer-toggle" type="button" className="icon-button drawer-toggle" aria-expanded={open} aria-controls="side-panel"
      aria-label="Panneau des couches et des filtres" onClick={() => { setOpen(!open); }}>☰</button>
  );
}

function HelpButton() {
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  return <button type="button" className="icon-button help-button" data-tour="help" aria-label="Aide et à propos des données" onClick={() => { setAboutOpen(true); }}>? Aide</button>;
}

export function TopBar({ store }: { readonly store: StationStore }) {
  useStoreVersion(store);
  const watermark = useUiStore((s) => s.watermark);
  let active = 0;
  for (let i = 0; i < store.size; i++) {
    if ((store.entries15m[i] ?? 0) + (store.exits15m[i] ?? 0) > 0) {
      active++;
    }
  }
  return (
    <header className="topbar">
      <DrawerToggle />
      <h1>Supervision des gares de péage</h1>
      <div className="kpi"><span className="kpi-label">Entrées 1 h</span><span className="kpi-value">{formatCount(sum(store.entries1h))}</span></div>
      <div className="kpi"><span className="kpi-label">Sorties 1 h</span><span className="kpi-value">{formatCount(sum(store.exits1h))}</span></div>
      <div className="kpi kpi-secondary"><span className="kpi-label">Passages aujourd’hui</span><span className="kpi-value">{formatCount(sum(store.entriesToday) + sum(store.exitsToday))}</span></div>
      <div className="kpi kpi-secondary"><span className="kpi-label">Gares actives (15 min)</span><span className="kpi-value">{formatCount(active)} / {formatCount(store.size)}</span></div>
      <span className="topbar-spacer" />
      <div className="kpi"><span className="kpi-label">Données à</span><span className="kpi-value">{formatTime(watermark)}</span></div>
      <ConnectionBadge />
      <HelpButton />
      <Account />
    </header>
  );
}
