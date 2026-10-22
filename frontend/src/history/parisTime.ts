const PARIS = 'Europe/Paris';

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Décalage (ms) de l'heure de Paris par rapport à UTC à l'instant donné (+1 h ou +2 h selon l'heure d'été). */
export function parisOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(offsetFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Minuit (heure de Paris) du jour civil contenant l'instant ; correct aux changements d'heure. */
export function parisMidnight(instant: Date): Date {
  const local = new Date(instant.getTime() + parisOffsetMs(instant));
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Le décalage à minuit peut différer de celui de l'instant (jour de changement d'heure) : on le réévalue.
  const guess = new Date(midnightAsUtc - parisOffsetMs(instant));
  return new Date(midnightAsUtc - parisOffsetMs(guess));
}
