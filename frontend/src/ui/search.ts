import type { AxisGroup } from '../map/axes';
import { axisLabel, formatAxes } from '../map/axes';
import type { StationCollection } from '../map/referentiel';

export type SearchResult =
  | { readonly kind: 'axis'; readonly id: string; readonly group: AxisGroup; readonly detail: string }
  | { readonly kind: 'station'; readonly index: number; readonly name: string; readonly detail: string };

export const MAX_RESULTS = 12;

/** Minuscules, sans accents ni espaces : « A 7 », « a7 » et « A0007 » se rejoignent après `compact`. */
const normalize = (value: string): string => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
const compact = (value: string): string => normalize(value).replace(/[\s.\-_]/g, '');

/** « a 07 » → « a7 » : les zéros de tête d'un numéro de route n'ont pas de sens pour l'utilisateur. */
const asAxisQuery = (query: string): string => compact(query).replace(/^([an])0+(\d)/, '$1$2');

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString('fr-FR')} ${count > 1 ? many : one}`;
}

/**
 * Recherche unique sur les gares (nom) et les autoroutes (« A7 », « n 85 ») : les axes d'abord quand le texte désigne
 * exactement l'un d'eux, puis les gares dont le nom commence par le texte, puis celles qui le contiennent ou qui sont sur l'axe.
 */
export function searchTargets(stations: StationCollection, axes: readonly AxisGroup[], query: string): SearchResult[] {
  const text = normalize(query);
  const axisQuery = asAxisQuery(query);
  if (text.length < 2 && axisQuery.length < 2) {
    return [];
  }
  const axisResults = /^[an]\d/.test(axisQuery)
    ? axes.filter((g) => g.id.toLowerCase().startsWith(axisQuery))
      .sort((a, b) => Number(b.id.toLowerCase() === axisQuery) - Number(a.id.toLowerCase() === axisQuery))
      .map((group): SearchResult => ({ kind: 'axis', id: group.id, group, detail: `Autoroute · ${plural(group.stations.length, 'gare', 'gares')}` }))
    : [];
  const matches = stations.features.flatMap((feature, index) => {
    const { name, axes: codes } = feature.properties;
    const key = normalize(name);
    const rank = key.startsWith(text) ? 0 : key.includes(text) ? 1 : codes.split(',').some((c) => axisLabel(c).toLowerCase() === axisQuery) ? 2 : -1;
    return rank < 0 ? [] : [{ rank, index, name, detail: `${formatAxes(codes)} · dép. ${feature.properties.dept}` }];
  }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'fr'));
  const results: SearchResult[] = [
    ...axisResults,
    ...matches.map((m): SearchResult => ({ kind: 'station', index: m.index, name: m.name, detail: m.detail })),
  ];
  return results.slice(0, MAX_RESULTS);
}
