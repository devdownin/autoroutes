import { useEffect, useRef } from 'react';
import { config } from '../config';
import { MapController } from '../map/mapController';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';

/**
 * Monte la carte une seule fois. Les changements d'interface sont relayés au contrôleur par abonnement
 * au store Zustand, sans re-rendu React du composant carte.
 */
export function MapView({ stations, store, onReady }: {
  readonly stations: StationCollection;
  readonly store: StationStore;
  readonly onReady: (controller: MapController | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (container.current === null) {
      return undefined;
    }
    const ui = useUiStore.getState();
    const controller = new MapController(container.current, stations, store, {
      style: {
        basemapUrl: config.basemapUrl,
        motorwaysUrl: config.motorwaysUrl,
        glyphsUrl: config.glyphsUrl,
        spriteUrl: config.spriteUrl,
      },
      onSelect: (index) => { useUiStore.getState().select(index); },
      onQualityChange: (level) => { useUiStore.getState().setQuality(level); },
      onHover: (hover) => { useUiStore.getState().setHover(hover); },
      onAxisHover: (axis) => { useUiStore.getState().setHoverAxis(axis); },
      onAxisClick: (axis) => { useUiStore.getState().chooseAxis(axis); },
    });
    controller.setLayers(ui.layers);
    controller.setKinds(ui.kinds);
    controller.setReducedMotion(ui.reducedMotion);
    controller.setAxisLabelsVisible(ui.layers.axes);
    controller.setActiveAxis(ui.hoverAxis ?? (ui.odFilters.axis || null));
    const unsubscribe = useUiStore.subscribe((state, previous) => {
      if (state.layers !== previous.layers) controller.setLayers(state.layers);
      if (state.layers.axes !== previous.layers.axes) controller.setAxisLabelsVisible(state.layers.axes);
      if (state.hoverAxis !== previous.hoverAxis || state.odFilters.axis !== previous.odFilters.axis) {
        controller.setActiveAxis(state.hoverAxis ?? (state.odFilters.axis || null));
      }
      if (state.kinds !== previous.kinds) controller.setKinds(state.kinds);
      if (state.segments !== previous.segments && state.segments !== null) controller.setSegmentLoads(state.segments.loads);
      if (state.highlightedFlow !== previous.highlightedFlow) controller.setHighlightedFlow(state.highlightedFlow);
      if (state.odView !== previous.odView) controller.setOd(state.odView);
      if (state.reducedMotion !== previous.reducedMotion) controller.setReducedMotion(state.reducedMotion);
      if (state.selectedIndex !== previous.selectedIndex) controller.setSelected(state.selectedIndex, false);
      if (state.freshness?.staleStations !== previous.freshness?.staleStations) {
        controller.setStale(state.freshness?.staleStations ?? []);
      }
    });
    onReady(controller);
    return () => {
      unsubscribe();
      onReady(null);
      controller.destroy();
    };
  }, [stations, store, onReady]);

  return <div ref={container} className="map" role="region" aria-label="Carte des gares de péage" />;
}
