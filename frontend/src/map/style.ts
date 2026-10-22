import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { businessLayers, businessSources, motorwayLayers } from './layers';
import { theme } from './theme';

export interface StyleOptions {
  readonly basemapUrl: string | null;
  readonly motorwaysUrl: string | null;
  readonly glyphsUrl: string | null;
  readonly spriteUrl: string | null;
}

const BASEMAP_SOURCE = 'basemap';

/**
 * Style complet : fond Protomaps (OSM, PMTiles auto-hébergé) en thème sombre, puis couches métier au-dessus.
 * Sans fond configuré (démonstration hors ligne), un aplat neutre le remplace : les couches métier restent identiques.
 */
export function buildStyle(options: StyleOptions): StyleSpecification {
  const base: LayerSpecification[] = options.basemapUrl === null
    ? [{ id: 'background', type: 'background', paint: { 'background-color': theme.background } }]
    : basemapLayers(BASEMAP_SOURCE, namedFlavor('dark'), { lang: 'fr' });
  const style: StyleSpecification = {
    version: 8,
    sources: {
      ...(options.basemapUrl === null ? {} : {
        [BASEMAP_SOURCE]: {
          type: 'vector',
          url: options.basemapUrl,
          attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      }),
      ...businessSources(options.motorwaysUrl),
    },
    // Sans polices auto-hébergées, aucun libellé : une couche texte sans glyphs rend le style invalide.
    layers: [
      ...base,
      ...(options.motorwaysUrl === null ? [] : motorwayLayers()),
      ...businessLayers(),
    ].filter((layer) => options.glyphsUrl !== null || layer.type !== 'symbol'),
  };
  if (options.glyphsUrl !== null) {
    style.glyphs = options.glyphsUrl;
  }
  if (options.spriteUrl !== null) {
    style.sprite = options.spriteUrl;
  }
  return style;
}
