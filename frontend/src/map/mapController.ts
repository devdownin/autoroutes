import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';
import { FrameLoop } from '../animation/frameLoop';
import type { QualityLevel } from '../animation/frameLoop';
import { StationAnimator } from '../animation/stationAnimator';
import { EMPTY_OD_VIEW } from '../od/odTypes';
import type { OdView } from '../od/odTypes';
import type { StationStore } from '../state/stationStore';
import type { FlowKey, HoveredStation, LayerVisibility } from '../state/uiStore';
import { buildAxisGroups, layoutLabels, stationsOnAxes } from './axes';
import { MOTORWAYS_SOURCE_LAYER, SOURCE } from './layers';
import { buildOdFeatures, selectFlows } from './odGeometry';
import { diffSegmentLoads } from './segmentLoads';
import type { SegmentLoad } from '../realtime/protocol';
import type { StationCollection, StationKind } from './referentiel';
import { StationLayerRenderer } from './stationLayerRenderer';
import { buildStyle } from './style';
import type { StyleOptions } from './style';
import { FRANCE_BOUNDS } from './theme';

let pmtilesRegistered = false;

export interface MapControllerOptions {
  readonly style: StyleOptions;
  readonly onSelect: (index: number | null) => void;
  readonly onQualityChange: (level: QualityLevel) => void;
  /** Gare sous le pointeur (null : aucune). Appelé au plus une fois par image. */
  readonly onHover: (hover: HoveredStation | null) => void;
  /** Survol (valeur du filtre « Axe », ou null en sortant) et clic sur le nom d'une autoroute. */
  readonly onAxisHover: (axis: string | null) => void;
  readonly onAxisClick: (axis: string) => void;
}

const STATION_LAYERS = ['stations', 'stations-halo', 'stations-axis', 'stations-selected', 'stations-label'] as const;

interface AxisLabel {
  readonly marker: maplibregl.Marker;
  readonly element: HTMLElement;
  readonly value: string;
}

/** Unique point de contact avec MapLibre : React ne manipule jamais la carte directement. */
export class MapController {
  private readonly map: maplibregl.Map;
  private readonly animator: StationAnimator;
  private readonly renderer: StationLayerRenderer;
  private readonly loop: FrameLoop;
  private readonly coordinates: ReadonlyMap<string, readonly [number, number]>;
  private ready = false;
  private od: OdView = EMPTY_OD_VIEW;
  private selectedId: string | null = null;
  private segmentIntensity: ReadonlyMap<string, number> = new Map();
  private highlighted: FlowKey | null = null;
  private odFeatureKeys: readonly FlowKey[] = [];
  private odCoordinates: ReadonlyMap<string, readonly [number, number]> = new Map();
  private pendingHover: HoveredStation | null | undefined;
  private readonly axisGroups;
  private readonly axisPositions: readonly (readonly [number, number])[];
  private readonly axisLabels = new Map<string, AxisLabel>();
  private axisLabelsOn = true;
  private activeAxis: string | null = null;
  private highlightedStations: ReadonlySet<number> = new Set();
  private readonly options: MapControllerOptions;
  private readonly container: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly stations: StationCollection,
    store: StationStore,
    options: MapControllerOptions,
  ) {
    if (!pmtilesRegistered) {
      // MapLibre 6 résout son worker relativement à son propre module : URL explicite, produite par Vite au build.
      maplibregl.setWorkerUrl(workerUrl);
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      pmtilesRegistered = true;
    }
    this.options = options;
    this.container = container;
    this.axisGroups = buildAxisGroups(stations);
    this.axisPositions = stations.features.map((f) => f.geometry.coordinates as [number, number]);
    this.coordinates = new Map(stations.features.map((f) => [f.properties.id, f.geometry.coordinates as [number, number]]));
    this.map = new maplibregl.Map({
      container,
      style: buildStyle(options.style),
      bounds: FRANCE_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      minZoom: 4,
      maxZoom: 15,
      attributionControl: { compact: false, customAttribution: 'Gares et échangeurs : Ministère de la Transition écologique (data.gouv.fr)' },
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    this.animator = new StationAnimator(store.size);
    this.renderer = new StationLayerRenderer(this.map, store, this.animator);
    this.loop = new FrameLoop((now, quality) => this.renderer.renderFrame(now, quality), {
      onQualityChange: options.onQualityChange,
    });

    this.map.on('load', () => {
      (this.map.getSource(SOURCE.stations) as GeoJSONSource).setData(this.stations).catch(reportError);
      this.ready = true;
      container.dataset.ready = 'true';
      this.onData();
      this.renderOd();
      this.layoutAxisLabels();
    });
    this.map.on('moveend', () => { this.layoutAxisLabels(); });
    this.map.on('resize', () => { this.layoutAxisLabels(); });
    // Exposé pour les tests de bout en bout et la supervision synthétique : nombre de gares effectivement dessinées.
    this.map.on('idle', () => {
      container.dataset.renderedStations = String(this.map.queryRenderedFeatures({ layers: ['stations'] }).length);
    });
    this.map.on('click', 'stations', (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.id;
      options.onSelect(typeof id === 'number' ? id : null);
    });
    this.map.on('mouseenter', 'stations', () => { this.map.getCanvas().style.cursor = 'pointer'; });
    this.map.on('mouseleave', 'stations', () => {
      this.map.getCanvas().style.cursor = '';
      this.emitHover(null, options);
    });
    this.map.on('mousemove', 'stations', (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.id;
      this.emitHover(typeof id === 'number' ? { index: id, x: event.point.x, y: event.point.y } : null, options);
    });
  }

  /** Noms des autoroutes : affichés ou masqués. Quand ils sont affichés, ils remplacent la couche native de références (pas de doublon). */
  setAxisLabelsVisible(visible: boolean): void {
    this.axisLabelsOn = visible;
    this.whenStyleReady(() => {
      if (this.map.getLayer('motorways-ref') !== undefined) {
        this.map.setLayoutProperty('motorways-ref', 'visibility', visible ? 'none' : 'visible');
      }
    });
    this.layoutAxisLabels();
  }

  /**
   * Étiquettes recalculées à chaque fin de déplacement : leur nombre croît avec le zoom et les collisions sont évitées.
   * Les marqueurs existants sont conservés (pas de clignotement), seuls les écarts sont ajoutés ou retirés.
   */
  private layoutAxisLabels(): void {
    if (!this.ready) {
      return;
    }
    const wanted = this.axisLabelsOn
      ? layoutLabels(this.axisGroups, this.axisPositions, ([lon, lat]) => { const p = this.map.project([lon, lat]); return [p.x, p.y]; },
        this.map.getZoom(), { width: this.container.clientWidth, height: this.container.clientHeight })
      : [];
    const keys = new Set(wanted.map((l) => l.key));
    for (const [key, label] of this.axisLabels) {
      if (!keys.has(key)) {
        label.marker.remove();
        this.axisLabels.delete(key);
      }
    }
    for (const candidate of wanted) {
      if (this.axisLabels.has(candidate.key)) {
        continue;
      }
      const element = document.createElement('div');
      element.className = 'axis-label';
      element.textContent = candidate.text;
      element.dataset.axis = candidate.value;
      // Aide visuelle à la souris et au toucher : le clavier et les lecteurs d'écran passent par la liste « Axe » du panneau.
      element.setAttribute('aria-hidden', 'true');
      element.addEventListener('mouseenter', () => { this.options.onAxisHover(candidate.value); });
      element.addEventListener('mouseleave', () => { this.options.onAxisHover(null); });
      element.addEventListener('click', (event) => { event.stopPropagation(); this.options.onAxisClick(candidate.value); });
      const marker = new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -7] })
        .setLngLat([candidate.lon, candidate.lat]).addTo(this.map);
      this.axisLabels.set(candidate.key, { marker, element, value: candidate.value });
    }
    this.styleAxisLabels();
  }

  private styleAxisLabels(): void {
    for (const { element, value } of this.axisLabels.values()) {
      element.classList.toggle('axis-label-active', value === this.activeAxis);
    }
  }

  /**
   * Met en évidence les gares d'un axe (anneau) et estompe les autres ; `null` rétablit l'affichage.
   * Les états sont écrits seulement pour les gares dont l'état change.
   */
  setActiveAxis(value: string | null): void {
    this.activeAxis = value === '' ? null : value;
    this.container.dataset.activeAxis = this.activeAxis ?? '';
    this.styleAxisLabels();
    this.whenStyleReady(() => {
      const next = new Set(this.activeAxis === null ? [] : stationsOnAxes(this.stations, this.activeAxis));
      const dimming = this.activeAxis !== null;
      const wasDimming = this.highlightedStations.size > 0;
      const touched = dimming !== wasDimming ? this.stations.features.keys() : new Set([...this.highlightedStations, ...next]).values();
      for (const index of touched) {
        const active = next.has(index);
        this.map.setFeatureState({ source: SOURCE.stations, id: index }, { axis: active, dim: dimming && !active });
      }
      this.highlightedStations = next;
    });
  }

  /** Un seul appel par image : le pointeur peut émettre bien plus d'événements que l'écran n'affiche d'images. */
  private emitHover(hover: HoveredStation | null, options: MapControllerOptions): void {
    const scheduled = this.pendingHover !== undefined;
    this.pendingHover = hover;
    if (!scheduled) {
      requestAnimationFrame(() => {
        const value = this.pendingHover;
        this.pendingHover = undefined;
        if (value !== undefined) {
          options.onHover(value);
        }
      });
    }
  }

  /** Après chaque snapshot ou delta : nouvelles cibles d'animation, réveil de la boucle d'images. */
  onData(): void {
    if (!this.ready) {
      return;
    }
    this.renderer.onData(performance.now());
    this.loop.wake();
  }

  setOd(view: OdView): void {
    this.od = view;
    this.renderOd();
  }

  private renderOd(): void {
    if (this.ready) {
      // Aux départements, l'extrémité d'un arc est le centre de ses gares ; la gare sélectionnée ne filtre alors rien.
      const departments = this.od.level === 'DEPARTMENT';
      const coordinates = departments
        ? new Map(this.od.nodes.map((n) => [n.id, [n.longitude, n.latitude] as const]))
        : this.coordinates;
      const visible = selectFlows(this.od.flows, departments ? null : this.selectedId);
      const collection = buildOdFeatures(visible, coordinates);
      this.odCoordinates = coordinates;
      this.odFeatureKeys = collection.features.map((f) => ({ originId: f.properties.originId, destinationId: f.properties.destinationId }));
      (this.map.getSource(SOURCE.od) as GeoJSONSource).setData(collection).then(() => { this.applyHighlight(); }, reportError);
    }
  }

  /** Met en évidence l'arc d'un flux (survol ou sélection dans la liste) et atténue les autres. */
  setHighlightedFlow(flow: FlowKey | null): void {
    this.highlighted = flow;
    this.applyHighlight();
  }

  private applyHighlight(): void {
    if (!this.ready) {
      return;
    }
    const flow = this.highlighted;
    this.odFeatureKeys.forEach((key, id) => {
      const active = flow !== null && key.originId === flow.originId && key.destinationId === flow.destinationId;
      this.map.setFeatureState({ source: SOURCE.od, id }, { active, dim: flow !== null && !active });
    });
  }

  /** Cadre la carte sur les deux extrémités d'un flux. */
  focusFlow(flow: FlowKey): void {
    const origin = this.odCoordinates.get(flow.originId);
    const destination = this.odCoordinates.get(flow.destinationId);
    if (origin === undefined || destination === undefined) {
      return;
    }
    this.map.fitBounds([[Math.min(origin[0], destination[0]), Math.min(origin[1], destination[1])],
      [Math.max(origin[0], destination[0]), Math.max(origin[1], destination[1])]], { padding: 80, maxZoom: 9 });
  }

  /** Charge ESTIMÉE : intensité 0 à 1 posée en feature-state sur les tronçons de la couche autoroutes (promoteId segmentId). */
  setSegmentLoads(loads: readonly SegmentLoad[]): void {
    this.whenStyleReady(() => {
      if (this.map.getSource(SOURCE.motorways) === undefined) {
        return;
      }
      const target = (id: string) => ({ source: SOURCE.motorways, sourceLayer: MOTORWAYS_SOURCE_LAYER, id });
      const diff = diffSegmentLoads(this.segmentIntensity, loads);
      diff.set.forEach(([id, load]) => { this.map.setFeatureState(target(id), { load }); });
      diff.clear.forEach((id) => { this.map.removeFeatureState(target(id), 'load'); });
      this.segmentIntensity = diff.next;
    });
  }

  setLayers(visibility: LayerVisibility): void {
    this.whenStyleReady(() => {
      const show = (id: string, visible: boolean) => {
        if (this.map.getLayer(id) !== undefined) {
          this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
      };
      ['stations', 'stations-halo', 'stations-axis', 'stations-selected'].forEach((id) => { show(id, visibility.stations); });
      show('stations-label', visibility.stations && visibility.labels);
      show('od-flows', visibility.od);
      show('segments-load', visibility.segments);
    });
  }

  setKinds(kinds: ReadonlySet<StationKind>): void {
    this.whenStyleReady(() => {
      const filter: maplibregl.FilterSpecification = ['in', ['get', 'kind'], ['literal', [...kinds]]];
      // Les libellés sont absents sans polices auto-hébergées.
      STATION_LAYERS.filter((id) => this.map.getLayer(id) !== undefined).forEach((id) => { this.map.setFilter(id, filter); });
    });
  }

  setSelected(index: number | null, focus: boolean): void {
    this.whenStyleReady(() => {
      this.renderer.setSelected(index);
      const feature = index === null ? undefined : this.stations.features[index];
      this.selectedId = feature?.properties.id ?? null;
      this.renderOd();
      if (focus && feature !== undefined) {
        this.map.flyTo({ center: feature.geometry.coordinates as [number, number], zoom: 11, essential: false });
      }
    });
  }

  setStale(stationIds: readonly string[]): void {
    this.whenStyleReady(() => {
      const indices = new Set<number>();
      this.stations.features.forEach((f, i) => { if (stationIds.includes(f.properties.id)) { indices.add(i); } });
      this.renderer.setStale(indices);
    });
  }

  setReducedMotion(reduced: boolean): void {
    this.animator.setReducedMotion(reduced);
  }

  /** Cadre la carte sur l'ensemble des gares d'une autoroute. */
  focusAxis(stationIndices: readonly number[]): void {
    const points = stationIndices.flatMap((i) => {
      const coordinates = this.stations.features[i]?.geometry.coordinates;
      return coordinates === undefined ? [] : [coordinates as [number, number]];
    });
    if (points.length === 0) {
      return;
    }
    const lons = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    this.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, maxZoom: 9 });
  }

  resetView(): void {
    this.map.fitBounds(FRANCE_BOUNDS, { padding: 24 });
  }

  destroy(): void {
    this.loop.stop();
    this.map.remove();
  }

  private whenStyleReady(action: () => void): void {
    if (this.ready) {
      action();
    } else {
      this.map.once('load', action);
    }
  }
}
