export interface FloatingMenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

/** Place a popover against its trigger while keeping it inside the viewport. */
export function getFloatingMenuPosition(
  anchor: DOMRect,
  desiredWidth: number,
  desiredHeight: number,
): FloatingMenuPosition {
  const gutter = 8;
  const width = Math.min(desiredWidth, Math.max(160, window.innerWidth - gutter * 2));
  const below = Math.max(0, window.innerHeight - anchor.bottom - gutter);
  const above = Math.max(0, anchor.top - gutter);
  const opensUp = below < Math.min(desiredHeight, 280) && above > below;
  const available = opensUp ? above : below;
  const maxHeight = Math.max(100, Math.min(desiredHeight, available));
  const top = opensUp
    ? Math.max(gutter, anchor.top - 6 - maxHeight)
    : Math.min(window.innerHeight - gutter - maxHeight, anchor.bottom + 6);
  const left = Math.max(
    gutter,
    Math.min(anchor.right - width, window.innerWidth - gutter - width),
  );

  return { top, left, width, maxHeight };
}
