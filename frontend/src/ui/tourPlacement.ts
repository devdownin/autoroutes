export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  readonly left: number;
  readonly top: number;
}

const MARGIN = 12;

/**
 * Place la carte d'une étape de la visite guidée près de sa cible, sans sortir de l'écran :
 * en dessous si la place le permet, sinon au-dessus, sinon à droite ou à gauche ; au centre sans cible
 * (ou si la cible occupe presque tout l'écran, comme la carte).
 */
export function placeCard(target: Rect | null, viewport: Size, card: Size, gap = 14): Placement {
  const clamp = (value: number, size: number, limit: number) => Math.max(MARGIN, Math.min(value, limit - size - MARGIN));
  const centered = { left: clamp((viewport.width - card.width) / 2, card.width, viewport.width),
    top: clamp((viewport.height - card.height) / 2, card.height, viewport.height) };
  if (target === null || (target.width > viewport.width * 0.7 && target.height > viewport.height * 0.6)) {
    return centered;
  }
  const centerX = target.left + target.width / 2 - card.width / 2;
  const centerY = target.top + target.height / 2 - card.height / 2;
  if (target.top + target.height + gap + card.height + MARGIN <= viewport.height) {
    return { left: clamp(centerX, card.width, viewport.width), top: target.top + target.height + gap };
  }
  if (target.top - gap - card.height >= MARGIN) {
    return { left: clamp(centerX, card.width, viewport.width), top: target.top - gap - card.height };
  }
  if (target.left + target.width + gap + card.width + MARGIN <= viewport.width) {
    return { left: target.left + target.width + gap, top: clamp(centerY, card.height, viewport.height) };
  }
  if (target.left - gap - card.width >= MARGIN) {
    return { left: target.left - gap - card.width, top: clamp(centerY, card.height, viewport.height) };
  }
  return centered;
}
