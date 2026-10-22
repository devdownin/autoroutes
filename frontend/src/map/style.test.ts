import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { buildStyle } from './style';

describe('buildStyle', () => {
  it.each([
    ['offline demo', { basemapUrl: null, motorwaysUrl: null, glyphsUrl: null, spriteUrl: null }],
    ['demo with fonts', { basemapUrl: null, motorwaysUrl: null, glyphsUrl: '/fonts/{fontstack}/{range}.pbf', spriteUrl: null }],
    ['production', {
      basemapUrl: 'pmtiles:///tiles/france.pmtiles',
      motorwaysUrl: 'pmtiles:///tiles/motorways.pmtiles',
      glyphsUrl: '/fonts/{fontstack}/{range}.pbf',
      spriteUrl: '/sprites/v4/dark',
    }],
  ])('produces a valid MapLibre style (%s)', (_, options) => {
    expect(validateStyleMin(buildStyle(options))).toEqual([]);
  });

  it('draws business layers above the basemap and estimated loads dashed', () => {
    const style = buildStyle({ basemapUrl: 'pmtiles:///b.pmtiles', motorwaysUrl: 'pmtiles:///m.pmtiles', glyphsUrl: '/g/{fontstack}/{range}.pbf', spriteUrl: null });
    const ids = style.layers.map((l) => l.id);
    const segments = style.layers.find((l) => l.id === 'segments-load');

    expect(ids.indexOf('stations')).toBeGreaterThan(ids.indexOf('motorways'));
    expect(ids.at(-1)).toBe('stations-label');
    expect(segments?.type === 'line' ? segments.paint?.['line-dasharray'] : undefined).toBeDefined();
  });
});
