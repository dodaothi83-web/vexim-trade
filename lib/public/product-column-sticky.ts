/** Maximum gap below the sticky public header. */
export const PRODUCT_COLUMN_STICKY_TOP = 96;
export const PRODUCT_COLUMN_VIEWPORT_MARGIN = 24;

/**
 * Keep short panels below the header. For a panel taller than the viewport,
 * use a negative top so its bottom, including the supplier card, can be seen
 * before the panel sticks. CSS still releases it at the grid boundary.
 */
export function productColumnStickyTop(panelHeight: number, viewportHeight: number): number {
  if (!Number.isFinite(panelHeight) || !Number.isFinite(viewportHeight) || panelHeight <= 0 || viewportHeight <= 0) {
    return PRODUCT_COLUMN_STICKY_TOP;
  }
  return Math.min(
    PRODUCT_COLUMN_STICKY_TOP,
    Math.round(viewportHeight - panelHeight - PRODUCT_COLUMN_VIEWPORT_MARGIN),
  );
}
