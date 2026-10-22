import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LOGIN_URL, checkSession } from './auth/session';
import { config } from './config';
import { DemoEventSource } from './demo/demoEventSource';
import type { AxisGroup } from './map/axes';
import type { MapController } from './map/mapController';
import { loadStations } from './map/referentiel';
import { liveOd } from './od/odApi';
import { OdPoller } from './od/odPoller';
import type { StationCollection } from './map/referentiel';
import { startRealtime } from './realtime/runtime';
import { ReplaySession } from './replay/replaySession';
import type { EventSourceFactory } from './realtime/streamClient';
import { StationStore } from './state/stationStore';
import { useUiStore } from './state/uiStore';
import { DiagnosticPanel } from './ui/DiagnosticPanel';
import { MapView } from './ui/MapView';
import { SidePanel } from './ui/SidePanel';
import { StationDetail } from './ui/StationDetail';
import { formatTime } from './ui/format';
import { ReplayBar } from './ui/ReplayBar';
import type { ReplayControls } from './ui/ReplayBar';
import { StationTooltip } from './ui/StationTooltip';
import { ABOUT_HASH, AboutDialog } from './ui/AboutDialog';
import { Tour } from './ui/Tour';
import { hasSeenTour } from './ui/tourStorage';
import { useCompact } from './ui/useCompact';
import { TopBar } from './ui/TopBar';

function streamFactory(stations: StationCollection): EventSourceFactory {
  if (config.demo) {
    const demoStations = stations.features.map((f) => ({
      id: f.properties.id,
      lanes: f.properties.lanes,
      coordinates: f.geometry.coordinates as [number, number],
    }));
    return () => new DemoEventSource(demoStations);
  }
  return (url) => new EventSource(url, { withCredentials: true });
}

function Dashboard({ stations }: { readonly stations: StationCollection }) {
  const store = useMemo(() => new StationStore(stations.features.map((f) => f.properties.id)), [stations]);
  const controller = useRef<MapController | null>(null);
  const onReady = useCallback((c: MapController | null) => { controller.current = c; }, []);
  const stopLive = useRef<(() => void) | null>(null);
  const session = useRef<ReplaySession | null>(null);
  const mode = useUiStore((s) => s.mode);
  const replay = useUiStore((s) => s.replay);
  const connection = useUiStore((s) => s.connection);
  const compact = useCompact();
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const aboutOpen = useUiStore((s) => s.aboutOpen);
  const odLayer = useUiStore((s) => s.layers.od);
  const odFilters = useUiStore((s) => s.odFilters);

  /** Flux O/D filtrés par le serveur (hors démonstration) : relus toutes les 10 s, et aussitôt à chaque changement de filtre. */
  useEffect(() => {
    const ui = useUiStore.getState;
    if (config.demo) {
      return undefined;
    }
    ui().setOdSource('rest');
    if (mode !== 'live' || !odLayer) {
      return undefined;
    }
    const poller = new OdPoller({
      fetch: liveOd,
      onView: (view) => { ui().setOdView(view); },
      onError: (error) => { ui().setOdError(error instanceof Error ? error.message : 'erreur inconnue'); },
    });
    poller.start(odFilters);
    return () => { poller.stop(); };
  }, [mode, odLayer, odFilters]);

  useEffect(() => { session.current?.refreshOd(); }, [odFilters]);

  /** Tiroir (petit écran) : Échap le ferme et rend le focus au bouton ; à l'ouverture, le focus va à la recherche ; il se ferme au retour en grand écran. */
  useEffect(() => {
    if (!compact) {
      useUiStore.getState().setDrawerOpen(false);
      return undefined;
    }
    if (!drawerOpen) {
      return undefined;
    }
    document.getElementById('station-search')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !useUiStore.getState().tourActive) {
        useUiStore.getState().setDrawerOpen(false);
        document.getElementById('drawer-toggle')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [compact, drawerOpen]);

  /** L'aide a une adresse (#a-propos) : lien partageable, et le bouton « précédent » la referme. */
  useEffect(() => {
    const sync = () => { useUiStore.getState().setAboutOpen(window.location.hash === ABOUT_HASH); };
    sync();
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('hashchange', sync); };
  }, []);
  const previousAbout = useRef(aboutOpen);
  useEffect(() => {
    // Seulement aux changements : au montage, l'adresse peut déjà porter #a-propos avant que l'état l'ait lue.
    if (previousAbout.current === aboutOpen) {
      return;
    }
    previousAbout.current = aboutOpen;
    const here = window.location.pathname + window.location.search;
    if (aboutOpen && window.location.hash !== ABOUT_HASH) {
      window.history.pushState(null, '', here + ABOUT_HASH);
    } else if (!aboutOpen && window.location.hash === ABOUT_HASH) {
      window.history.replaceState(null, '', here);
    }
  }, [aboutOpen]);

  /** Première visite : proposer la visite guidée une fois l'écran posé (jamais si l'aide est déjà ouverte par son adresse). */
  useEffect(() => {
    if (hasSeenTour() || window.location.hash === ABOUT_HASH) {
      return undefined;
    }
    const timer = setTimeout(() => { useUiStore.getState().setTourActive(true); }, 1_200);
    return () => { clearTimeout(timer); };
  }, []);

  /** Flux coupé durablement : si la session a expiré (401), on relance la connexion plutôt que de reconnecter indéfiniment. */
  useEffect(() => {
    if (config.demo || connection === 'open') {
      return undefined;
    }
    const timer = setTimeout(() => {
      checkSession().then((result) => { if (result.kind === 'login') window.location.assign(LOGIN_URL); }, () => { /* serveur injoignable : la reconnexion continue */ });
    }, 15_000);
    return () => { clearTimeout(timer); };
  }, [connection]);

  const startLive = useCallback(() => {
    stopLive.current = startRealtime({
      url: config.streamUrl,
      store,
      factory: streamFactory(stations),
      onData: () => { controller.current?.onData(); },
      onReferentielChanged: () => { window.location.reload(); },
    });
  }, [stations, store]);

  useEffect(() => {
    startLive();
    return () => {
      stopLive.current?.();
      session.current?.dispose();
    };
  }, [startLive]);

  /** Relecture : le flux temps réel est suspendu (le store ne sert qu'une source à la fois), puis repris par un snapshot. */
  const replayControls = useMemo<ReplayControls>(() => {
    const ui = useUiStore.getState;
    const backToLive = () => {
      session.current?.dispose();
      session.current = null;
      ui().setMode('live');
      ui().setReplay({ status: 'paused', time: null, error: null, from: null, to: null });
      startLive();
    };
    return {
      start: (from, durationMinutes, speed) => {
        const error = ReplaySession.validate({ from, durationMinutes, speed }, Date.now());
        if (error !== null) {
          ui().setReplay({ status: 'error', error });
          return;
        }
        stopLive.current?.();
        stopLive.current = null;
        ui().setMode('replay');
        ui().setReplay({ speed, error: null, from: from.toISOString(), to: new Date(from.getTime() + durationMinutes * 60_000).toISOString() });
        const replaySession = new ReplaySession(store, {
          onData: () => { controller.current?.onData(); },
          onTime: (time) => { ui().setWatermark(time.toISOString()); ui().setReplay({ time: time.toISOString() }); },
          onStatus: (status, message) => { ui().setReplay({ status, error: message ?? null }); },
          onOd: (view) => { ui().setOdView(view); },
          odFilters: () => ui().odFilters,
        });
        session.current = replaySession;
        replaySession.load({ from, durationMinutes, speed }).then(() => { replaySession.play(); }, () => {
          backToLive();
          ui().setReplay({ status: 'error' });
        });
      },
      playPause: () => {
        if (ui().replay.status === 'playing') {
          session.current?.pause();
        } else if (ui().replay.status !== 'ended') {
          session.current?.play();
        }
      },
      setSpeed: (speed) => {
        session.current?.setSpeed(speed);
        ui().setReplay({ speed });
      },
      backToLive,
    };
  }, [store, startLive]);

  const focus = useCallback((index: number) => {
    useUiStore.getState().setDrawerOpen(false);
    useUiStore.getState().select(index);
    controller.current?.setSelected(index, true);
  }, []);

  const focusAxis = useCallback((group: AxisGroup) => {
    const ui = useUiStore.getState();
    ui.setDrawerOpen(false);
    // Le filtre « Axe » se pose, sans jamais se retirer : chercher deux fois la même autoroute ne doit pas l'annuler.
    if (ui.odFilters.axis !== group.value) {
      ui.chooseAxis(group.value);
    }
    controller.current?.focusAxis(group.stations);
  }, []);

  /** « / » met le focus sur la recherche (et ouvre le tiroir sur petit écran), sauf pendant une saisie ou devant une fenêtre ouverte. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
      const ui = useUiStore.getState();
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || typing || ui.aboutOpen || ui.tourActive) {
        return;
      }
      event.preventDefault();
      if (compact && !ui.drawerOpen) {
        ui.setDrawerOpen(true);
      } else {
        document.getElementById('station-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [compact]);

  return (
    <div className="app">
      {config.demo && <div className="simulated-banner" role="note">DONNÉES SIMULÉES — démonstration, aucune valeur réelle</div>}
      {mode === 'replay' && (
        <div className="replay-banner" role="note">
          RELECTURE — données historiques observées · {formatTime(replay.time)} (heure de Paris) · ×{replay.speed}
        </div>
      )}
      <TopBar store={store} />
      <SidePanel stations={stations} store={store} onFocus={focus} onFocusAxis={focusAxis} onFocusFlow={(flow) => { useUiStore.getState().setDrawerOpen(false); controller.current?.focusFlow(flow); }}
        onResetView={() => { controller.current?.resetView(); }} />
      {compact && drawerOpen && <div className="drawer-backdrop" aria-hidden="true" onClick={() => { useUiStore.getState().setDrawerOpen(false); }} />}
      <main className="map-area" data-tour="map">
        <MapView stations={stations} store={store} onReady={onReady} />
        <StationTooltip stations={stations} store={store} />
        <StationDetail stations={stations} store={store}
          onFocusFlow={(flow) => { controller.current?.focusFlow(flow); }} />
        {!config.demo && <ReplayBar controls={replayControls} />}
        <DiagnosticPanel store={store} />
      </main>
      <AboutDialog />
      <Tour />
    </div>
  );
}

export function App() {
  const [stations, setStations] = useState<StationCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    const fail = (e: unknown) => {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    // Hors démonstration, l'identité est vérifiée avant toute donnée : sans session, on lance la connexion OIDC.
    const session = config.demo ? Promise.resolve(null) : checkSession(fetch, abort.signal);
    session.then((result) => {
      if (result?.kind === 'login') {
        setRedirecting(true);
        window.location.assign(LOGIN_URL);
        return undefined;
      }
      useUiStore.getState().setMe(result?.me ?? null);
      return loadStations(config.stationsUrl, abort.signal).then(setStations);
    }).catch(fail);
    return () => { abort.abort(); };
  }, []);

  if (error !== null) {
    return <div className="error" role="alert">{error}</div>;
  }
  if (redirecting) {
    return <div className="loading">Redirection vers la connexion…</div>;
  }
  return stations === null ? <div className="loading">Chargement du référentiel…</div> : <Dashboard stations={stations} />;
}
