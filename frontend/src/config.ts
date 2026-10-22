const env = import.meta.env;

const optional = (value: string | undefined): string | null =>
  value !== undefined && value.trim() !== '' ? value : null;

/** MapLibre exige des URL absolues pour glyphs et sprites ; concaténation pour préserver les gabarits {fontstack}/{range}. */
const absolute = (value: string | null): string | null =>
  value?.startsWith('/') === true ? `${window.location.origin}${value}` : value;

/** « pmtiles:///tiles/x.pmtiles » → archive servie par la même origine que l'application. */
const sameOriginPmtiles = (value: string | null): string | null =>
  value?.startsWith('pmtiles:///') === true ? `pmtiles://${window.location.origin}/${value.slice('pmtiles:///'.length)}` : value;

export const config = {
  demo: env.VITE_DEMO === 'true',
  stationsUrl: env.VITE_STATIONS_URL,
  streamUrl: optional(env.VITE_STREAM_URL) ?? '/api/v1/stream',
  basemapUrl: sameOriginPmtiles(optional(env.VITE_BASEMAP_URL)),
  motorwaysUrl: sameOriginPmtiles(optional(env.VITE_MOTORWAYS_URL)),
  glyphsUrl: absolute(optional(env.VITE_GLYPHS_URL)),
  spriteUrl: absolute(optional(env.VITE_SPRITE_URL)),
} as const;

export type AppConfig = typeof config;
