import type { Feature, FeatureCollection, Point } from 'geojson';

export type StationKind = 'ECHANGEUR' | 'PLEINE_VOIE';

export interface StationProperties {
  readonly id: string;
  readonly name: string;
  readonly kind: StationKind;
  readonly axes: string;
  readonly dept: string;
  readonly lanes: number;
}

export type StationFeature = Feature<Point, StationProperties>;
export type StationCollection = FeatureCollection<Point, StationProperties>;

/** Identifiant numérique de feature = index dans le store : requis par setFeatureState et sans recherche par chaîne. */
export function indexFeatures(collection: StationCollection): StationCollection {
  return {
    type: 'FeatureCollection',
    features: collection.features.map((feature, index) => ({ ...feature, id: index })),
  };
}

export async function loadStations(url: string, signal?: AbortSignal): Promise<StationCollection> {
  const response = await fetch(url, signal === undefined ? {} : { signal });
  if (!response.ok) {
    throw new Error(`Référentiel indisponible (${response.status})`);
  }
  return indexFeatures((await response.json()) as StationCollection);
}
