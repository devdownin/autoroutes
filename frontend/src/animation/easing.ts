export const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;
