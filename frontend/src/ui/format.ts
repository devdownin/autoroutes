const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const time = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const formatCount = (value: number): string => (Number.isFinite(value) ? integer.format(value) : '–');

export const formatPercent = (ratio: number): string =>
  Number.isFinite(ratio) ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(ratio * 100)} %` : '–';

export const formatSigned = (value: number): string =>
  Number.isFinite(value) ? `${value > 0 ? '+' : ''}${integer.format(value)}` : '–';

export const formatTime = (value: string | number | null): string => {
  if (value === null) {
    return '–';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '–' : time.format(date);
};
