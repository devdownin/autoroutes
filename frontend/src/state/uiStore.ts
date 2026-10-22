import { create } from 'zustand';
import type { Me } from '../auth/session';
import type { OdFilters, OdView } from '../od/odTypes';
import { DEFAULT_OD_FILTERS, EMPTY_OD_VIEW, streamOdView } from '../od/odTypes';
import type { FreshnessStatus, OdFlow, SegmentLoad } from '../realtime/protocol';
import type { ConnectionStatus } from '../realtime/streamClient';
import type { QualityLevel } from '../animation/frameLoop';
import type { StationKind } from '../map/referentiel';
import type { ReplayStatus } from '../replay/replaySession';

export interface LayerVisibility {
  readonly stations: boolean;
  readonly labels: boolean;
  readonly od: boolean;
  readonly segments: boolean;
  /** Noms des autoroutes posés sur la carte (cliquables : filtre « Axe » des flux O/D). */
  readonly axes: boolean;
}

export interface Freshness {
  readonly status: FreshnessStatus;
  readonly watermarkLagSeconds: number;
  readonly consumerLag: number;
  readonly staleStations: readonly string[];
}

export type Mode = 'live' | 'replay';

export interface ReplayState {
  readonly status: ReplayStatus;
  readonly speed: number;
  readonly time: string | null;
  readonly error: string | null;
  /** Bornes de la période relue (ISO) : sert à la barre de progression. */
  readonly from: string | null;
  readonly to: string | null;
}

/** Sections du panneau latéral : une seule est ouverte à la fois. */
export type SectionId = 'layers' | 'activity' | 'od' | 'segments' | 'legend';

export interface HoveredStation {
  readonly index: number;
  /** Position du pointeur dans le conteneur de la carte, en pixels. */
  readonly x: number;
  readonly y: number;
}

export interface FlowKey {
  readonly originId: string;
  readonly destinationId: string;
}

export interface SegmentsState {
  readonly graphVersion: string;
  readonly algorithm: string;
  readonly loads: readonly SegmentLoad[];
}

export interface UiState {
  readonly selectedIndex: number | null;
  readonly layers: LayerVisibility;
  readonly kinds: ReadonlySet<StationKind>;
  readonly connection: ConnectionStatus;
  readonly freshness: Freshness | null;
  readonly watermark: string | null;
  readonly odView: OdView;
  readonly odFilters: OdFilters;
  /** « rest » : le serveur filtre (flux O/D lus par l'API) ; « stream » : flux SSE brut (démonstration). */
  readonly odSource: 'rest' | 'stream';
  readonly odError: string | null;
  /** Identité connectée (null : démonstration ou chargement en cours). */
  readonly me: Me | null;
  /** Dernière charge ESTIMÉE des tronçons reçue (null : graphe routier non configuré ou premier calcul en cours). */
  readonly segments: SegmentsState | null;
  readonly openSection: SectionId | null;
  /** Petit écran : le panneau latéral est un tiroir, ouvert ou fermé. Sans effet au-delà de 900 px. */
  readonly drawerOpen: boolean;
  readonly aboutOpen: boolean;
  readonly tourActive: boolean;
  /** Les flux d'une gare ou d'un département vers lui-même (« internes ») sont masqués par défaut : ils dominent les listes sans s'y tracer. */
  readonly odIncludeInternal: boolean;
  /** Flux survolé ou ciblé dans la liste : son arc est mis en évidence sur la carte. */
  readonly highlightedFlow: FlowKey | null;
  readonly hover: HoveredStation | null;
  /** Axe survolé sur la carte (valeur du filtre « Axe ») : ses gares sont mises en évidence tant que le pointeur y reste. */
  readonly hoverAxis: string | null;
  readonly quality: QualityLevel;
  readonly reducedMotion: boolean;
  readonly diagnosticOpen: boolean;
  readonly resyncCount: number;
  readonly mode: Mode;
  readonly replay: ReplayState;
  readonly select: (index: number | null) => void;
  readonly toggleLayer: (layer: keyof LayerVisibility) => void;
  readonly setOpenSection: (section: SectionId | null) => void;
  readonly setDrawerOpen: (open: boolean) => void;
  readonly setAboutOpen: (open: boolean) => void;
  readonly setTourActive: (active: boolean) => void;
  readonly setOdIncludeInternal: (include: boolean) => void;
  readonly setHighlightedFlow: (flow: FlowKey | null) => void;
  readonly setHover: (hover: HoveredStation | null) => void;
  readonly setHoverAxis: (axis: string | null) => void;
  /** Clic sur le nom d'une autoroute : applique (ou retire, au second clic) le filtre « Axe » et montre les flux. */
  readonly chooseAxis: (value: string) => void;
  readonly toggleKind: (kind: StationKind) => void;
  readonly setConnection: (status: ConnectionStatus) => void;
  readonly setFreshness: (freshness: Freshness) => void;
  readonly setWatermark: (watermark: string | null) => void;
  readonly setOdFlows: (flows: readonly OdFlow[]) => void;
  readonly setOdView: (view: OdView) => void;
  readonly setOdFilters: (filters: Partial<OdFilters>) => void;
  readonly setOdSource: (source: 'rest' | 'stream') => void;
  readonly setOdError: (message: string | null) => void;
  readonly setMe: (me: Me | null) => void;
  readonly setSegments: (segments: SegmentsState) => void;
  readonly setQuality: (level: QualityLevel) => void;
  readonly setReducedMotion: (reduced: boolean) => void;
  readonly toggleDiagnostic: () => void;
  readonly countResync: () => void;
  readonly setMode: (mode: Mode) => void;
  readonly setReplay: (replay: Partial<ReplayState>) => void;
}

/** État d'interface uniquement (sélection, filtres, statuts) : les métriques des gares restent hors React, dans StationStore. */
export const useUiStore = create<UiState>()((set, get) => ({
  selectedIndex: null,
  layers: { stations: true, labels: true, od: false, segments: false, axes: true },
  kinds: new Set<StationKind>(['ECHANGEUR', 'PLEINE_VOIE']),
  connection: 'connecting',
  freshness: null,
  watermark: null,
  odView: EMPTY_OD_VIEW,
  odFilters: DEFAULT_OD_FILTERS,
  odSource: 'stream',
  odError: null,
  me: null,
  segments: null,
  quality: 0,
  reducedMotion: false,
  diagnosticOpen: false,
  resyncCount: 0,
  mode: 'live',
  openSection: 'layers',
  drawerOpen: false,
  aboutOpen: false,
  tourActive: false,
  odIncludeInternal: false,
  highlightedFlow: null,
  hover: null,
  hoverAxis: null,
  replay: { status: 'paused', speed: 60, time: null, error: null, from: null, to: null },
  select: (selectedIndex) => { set({ selectedIndex }); },
  // Activer une couche à section propre l'ouvre : ses réglages sont ce que l'on cherche juste après.
  toggleLayer: (layer) => {
    set((s) => {
      const enabled = !s.layers[layer];
      const opens = enabled && (layer === 'od' || layer === 'segments');
      return { layers: { ...s.layers, [layer]: enabled }, ...(opens ? { openSection: layer } : {}) };
    });
  },
  setOpenSection: (openSection) => { set({ openSection }); },
  setDrawerOpen: (drawerOpen) => { set({ drawerOpen }); },
  setAboutOpen: (aboutOpen) => { set({ aboutOpen }); },
  setTourActive: (tourActive) => { set({ tourActive }); },
  setOdIncludeInternal: (odIncludeInternal) => { set({ odIncludeInternal }); },
  setHighlightedFlow: (highlightedFlow) => { set({ highlightedFlow }); },
  setHover: (hover) => { set({ hover }); },
  setHoverAxis: (hoverAxis) => { set({ hoverAxis }); },
  chooseAxis: (value) => {
    set((s) => {
      const same = s.odFilters.axis === value;
      return {
        odFilters: { ...s.odFilters, axis: same ? '' : value },
        // Sans la couche des flux, le filtre ne se verrait pas : elle s'active et sa section s'ouvre.
        ...(same ? {} : { layers: { ...s.layers, od: true }, openSection: 'od' as const }),
      };
    });
  },
  toggleKind: (kind) => {
    set((s) => {
      const kinds = new Set(s.kinds);
      if (kinds.has(kind)) {
        kinds.delete(kind);
      } else {
        kinds.add(kind);
      }
      return { kinds };
    });
  },
  setConnection: (connection) => { set({ connection }); },
  setFreshness: (freshness) => { set({ freshness }); },
  setWatermark: (watermark) => { set({ watermark }); },
  // Le flux SSE ne contient ni filtres ni couverture : il n'alimente la vue que sans lecture par l'API.
  setOdFlows: (flows) => { if (get().odSource === 'stream') set({ odView: streamOdView(flows) }); },
  setOdView: (odView) => { set({ odView, odError: null }); },
  setOdFilters: (filters) => { set((s) => ({ odFilters: { ...s.odFilters, ...filters } })); },
  setOdSource: (odSource) => { set({ odSource }); },
  setOdError: (odError) => { set({ odError }); },
  setMe: (me) => { set({ me }); },
  setSegments: (segments) => { set({ segments }); },
  setQuality: (quality) => { set({ quality }); },
  setReducedMotion: (reducedMotion) => { set({ reducedMotion }); },
  toggleDiagnostic: () => { set((s) => ({ diagnosticOpen: !s.diagnosticOpen })); },
  countResync: () => { set((s) => ({ resyncCount: s.resyncCount + 1 })); },
  setMode: (mode) => { set({ mode }); },
  setReplay: (replay) => { set((s) => ({ replay: { ...s.replay, ...replay } })); },
}));
