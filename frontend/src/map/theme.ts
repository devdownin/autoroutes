/**
 * Direction artistique « supervision sombre ». Couleurs métier choisies pour rester distinguables
 * en deutéranopie / protanopie (sarcelle vs ambre) et doublées d'un indice de forme (contour).
 */
export const theme = {
  background: '#0E1116',
  motorway: '#5B6578',
  motorwayCasing: '#1B2029',
  motorwayNonConcede: '#3A4150',
  label: '#C9D1D9',
  labelHalo: '#0E1116',
  stationEchangeur: '#2EC4B6',
  stationPleineVoie: '#F4A261',
  stationStroke: '#E6EDF3',
  stationStale: '#6E7681',
  halo: '#E6EDF3',
  selection: '#FFFFFF',
  odFlow: '#4CC9F0',
  /** Rampe séquentielle (type cividis) pour la charge ESTIMÉE des tronçons, toujours en tirets. */
  segmentRamp: ['#2B3A55', '#575D6D', '#8F8A6E', '#C8B866', '#F2D45C'],
} as const;

export const FRANCE_BOUNDS: [[number, number], [number, number]] = [[-5.3, 41.3], [9.7, 51.2]];
