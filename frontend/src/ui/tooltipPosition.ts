/** Place l'info-bulle près du pointeur, retournée de l'autre côté quand elle sortirait du conteneur. */
export function tooltipPosition(
  pointer: { readonly x: number; readonly y: number },
  container: { readonly width: number; readonly height: number },
  box: { readonly width: number; readonly height: number },
  offset = 14,
): { readonly left: number; readonly top: number } {
  const left = pointer.x + offset + box.width > container.width ? pointer.x - offset - box.width : pointer.x + offset;
  const top = pointer.y + offset + box.height > container.height ? pointer.y - offset - box.height : pointer.y + offset;
  return { left: Math.max(0, left), top: Math.max(0, top) };
}
