import type { OdFlow } from '../realtime/protocol';

export interface VisibleFlows {
  readonly shown: readonly OdFlow[];
  /** Flux internes (même gare ou même département) écartés de la liste. */
  readonly hiddenInternal: number;
}

/** Les flux internes dominent souvent les listes au niveau départemental sans être tracés : masqués sauf demande. */
export function visibleFlows(flows: readonly OdFlow[], includeInternal: boolean): VisibleFlows {
  if (includeInternal) {
    return { shown: flows, hiddenInternal: 0 };
  }
  const shown = flows.filter((f) => f.originId !== f.destinationId);
  return { shown, hiddenInternal: flows.length - shown.length };
}
