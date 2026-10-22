import { useSyncExternalStore } from 'react';

/** Largeur sous laquelle le panneau latéral devient un tiroir (même seuil que la feuille de style). */
export const COMPACT_QUERY = '(max-width: 900px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener('change', onChange);
  return () => { query.removeEventListener('change', onChange); };
}

/** Vrai sur un petit écran ; suit les changements (rotation, redimensionnement). */
export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(COMPACT_QUERY).matches, () => false);
}
