export const TOUR_KEY = 'supervision.tour.v1';

type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Le stockage peut être absent ou refusé (navigation privée, données bloquées) : la visite est alors proposée à chaque fois. */
export function hasSeenTour(storage?: TourStorage): boolean {
  try {
    return (storage ?? window.localStorage).getItem(TOUR_KEY) !== null;
  } catch {
    return false;
  }
}

export function markTourSeen(storage?: TourStorage): void {
  try {
    (storage ?? window.localStorage).setItem(TOUR_KEY, 'done');
  } catch {
    // Sans stockage, la visite sera simplement reproposée.
  }
}
