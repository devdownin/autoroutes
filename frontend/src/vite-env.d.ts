/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO: string;
  readonly VITE_STATIONS_URL: string;
  readonly VITE_STREAM_URL?: string;
  readonly VITE_BASEMAP_URL?: string;
  readonly VITE_MOTORWAYS_URL?: string;
  readonly VITE_GLYPHS_URL?: string;
  readonly VITE_SPRITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
