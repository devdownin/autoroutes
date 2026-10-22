/** Avancement de la relecture (0 à 1) ; nul tant que la période ou l'heure virtuelle est inconnue. */
export function replayProgress(time: string | null, from: string | null, to: string | null): number {
  if (time === null || from === null || to === null) {
    return 0;
  }
  const start = Date.parse(from);
  const span = Date.parse(to) - start;
  const position = (Date.parse(time) - start) / span;
  return Number.isFinite(position) && span > 0 ? Math.min(1, Math.max(0, position)) : 0;
}
