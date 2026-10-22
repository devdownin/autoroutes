import type { FeatureCollection } from 'geojson';
import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import { theme } from './theme';

export const SOURCE = { stations: 'stations', od: 'od', motorways: 'motorways' } as const;
export const MOTORWAYS_SOURCE_LAYER = 'motorways';
export const LABEL_FONT = ['Noto Sans Regular'];

const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export function businessSources(motorwaysUrl: string | null): Record<string, SourceSpecification> {
  const sources: Record<string, SourceSpecification> = {
    [SOURCE.stations]: { type: 'geojson', data: empty() },
    // lineMetrics : nécessaire au dégradé qui indique le sens origine → destination.
    [SOURCE.od]: { type: 'geojson', data: empty(), lineMetrics: true },
  };
  if (motorwaysUrl !== null) {
    sources[SOURCE.motorways] = {
      type: 'vector',
      url: motorwaysUrl,
      promoteId: { [MOTORWAYS_SOURCE_LAYER]: 'segmentId' },
      attribution: '© OpenStreetMap contributors (ODbL)',
    };
  }
  return sources;
}

/** Rayon de base (feature-state `r`, en px à z8) modulé par le zoom ; `zoom` doit rester l'entrée de l'interpolation de premier niveau. */
const stationRadius = (extra: unknown = 0): unknown => [
  'interpolate', ['linear'], ['zoom'],
  4, ['+', ['*', ['coalesce', ['feature-state', 'r'], 2.5], 0.35], extra],
  6, ['+', ['*', ['coalesce', ['feature-state', 'r'], 2.5], 0.55], extra],
  8, ['+', ['coalesce', ['feature-state', 'r'], 2.5], extra],
  13, ['+', ['*', ['coalesce', ['feature-state', 'r'], 2.5], 1.6], extra],
];

const stationColor = [
  'case',
  ['boolean', ['feature-state', 'stale'], false], theme.stationStale,
  ['==', ['get', 'kind'], 'PLEINE_VOIE'], theme.stationPleineVoie,
  theme.stationEchangeur,
];

export function motorwayLayers(): LayerSpecification[] {
  // zoom doit rester l'entrée d'une interpolation de premier niveau : le facteur s'applique aux paliers, pas au résultat.
  const width = (factor = 1): unknown => ['interpolate', ['exponential', 1.5], ['zoom'], 4, 0.6 * factor, 8, 1.6 * factor, 12, 4 * factor, 15, 10 * factor];
  return [
    {
      id: 'motorways-casing',
      type: 'line',
      source: SOURCE.motorways,
      'source-layer': MOTORWAYS_SOURCE_LAYER,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': theme.motorwayCasing, 'line-width': width(1.8) },
    },
    {
      id: 'motorways',
      type: 'line',
      source: SOURCE.motorways,
      'source-layer': MOTORWAYS_SOURCE_LAYER,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['case', ['get', 'concede'], theme.motorway, theme.motorwayNonConcede],
        'line-width': width(),
      },
    },
    {
      id: 'segments-load',
      type: 'line',
      source: SOURCE.motorways,
      'source-layer': MOTORWAYS_SOURCE_LAYER,
      layout: { 'line-join': 'round', visibility: 'none' },
      paint: {
        'line-color': [
          'interpolate', ['linear'], ['coalesce', ['feature-state', 'load'], 0],
          0, theme.segmentRamp[0], 0.25, theme.segmentRamp[1], 0.5, theme.segmentRamp[2],
          0.75, theme.segmentRamp[3], 1, theme.segmentRamp[4],
        ],
        'line-width': width(1.4),
        'line-opacity': ['case', ['>', ['coalesce', ['feature-state', 'load'], 0], 0], 0.95, 0],
        // Tirets = estimation : la charge des tronçons n'est jamais présentée comme mesurée.
        'line-dasharray': [2, 1.2],
      },
    },
    {
      id: 'motorways-ref',
      type: 'symbol',
      source: SOURCE.motorways,
      'source-layer': MOTORWAYS_SOURCE_LAYER,
      minzoom: 6,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 400,
        'text-field': ['get', 'ref'],
        'text-font': LABEL_FONT,
        'text-size': 11,
        'text-rotation-alignment': 'viewport',
      },
      paint: { 'text-color': theme.label, 'text-halo-color': theme.labelHalo, 'text-halo-width': 1.5 },
    },
  ] as LayerSpecification[];
}

export function businessLayers(): LayerSpecification[] {
  return [
    {
      id: 'od-flows',
      type: 'line',
      source: SOURCE.od,
      layout: { 'line-cap': 'round', visibility: 'none' },
      paint: {
        // Flux ciblé dans la liste : plus épais ; les autres s'estompent (états posés par MapController.setHighlightedFlow).
        'line-width': ['+', ['get', 'width'], ['case', ['boolean', ['feature-state', 'active'], false], 3, 0]],
        'line-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.2, 1],
        'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(76,201,240,0.05)', 1, theme.odFlow],
      },
    },
    {
      id: 'stations-halo',
      type: 'circle',
      source: SOURCE.stations,
      paint: {
        'circle-radius': stationRadius(['*', ['-', 1, ['coalesce', ['feature-state', 'halo'], 0]], 14]),
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': theme.halo,
        'circle-stroke-width': 1.5,
        // Halos discrets à l'échelle nationale (densité), pleinement visibles à l'échelle régionale.
        'circle-stroke-opacity': [
          'interpolate', ['linear'], ['zoom'],
          5, ['*', ['coalesce', ['feature-state', 'halo'], 0], 0.2],
          8, ['*', ['coalesce', ['feature-state', 'halo'], 0], 0.8],
        ],
      },
    },
    {
      id: 'stations',
      type: 'circle',
      source: SOURCE.stations,
      paint: {
        'circle-radius': stationRadius(),
        'circle-color': stationColor,
        // Axe mis en évidence : les gares des autres axes s'estompent (états posés par MapController.setActiveAxis).
        'circle-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.15, ['boolean', ['feature-state', 'stale'], false], 0.5, 0.9],
        'circle-stroke-color': theme.stationStroke,
        'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.2, 1],
        // Indice de forme en plus de la couleur : contour épais pour les barrières pleine voie.
        'circle-stroke-width': ['case', ['==', ['get', 'kind'], 'PLEINE_VOIE'], 2, 0.75],
      },
    },
    {
      id: 'stations-axis',
      type: 'circle',
      source: SOURCE.stations,
      paint: {
        'circle-radius': stationRadius(3),
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': theme.odFlow,
        'circle-stroke-width': 2,
        'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'axis'], false], 1, 0],
      },
    },
    {
      id: 'stations-selected',
      type: 'circle',
      source: SOURCE.stations,
      paint: {
        'circle-radius': stationRadius(5),
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': theme.selection,
        'circle-stroke-width': 2,
        'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0],
      },
    },
    {
      id: 'stations-label',
      type: 'symbol',
      source: SOURCE.stations,
      minzoom: 8,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': LABEL_FONT,
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 13, 13],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': theme.label, 'text-halo-color': theme.labelHalo, 'text-halo-width': 1.5 },
    },
  ] as LayerSpecification[];
}
