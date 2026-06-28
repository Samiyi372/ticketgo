// Decoration position/scale is stored per-template (ticket.decoration.positions),
// since the same image often needs a different spot depending on which template's
// layout is active. DecorationLayer itself stays unaware of this — templates
// resolve the active template's position into a flat {x,y,scale} shape before
// handing it to DecorationLayer, and translate position-only changes back.
export const DEFAULT_DECORATION_POSITION = { x: 50, y: 50, scale: 1 };

export function resolveDecoration(decoration, templateId) {
  const position = decoration.positions?.[templateId] ?? DEFAULT_DECORATION_POSITION;
  return { ...decoration, ...position };
}

export function applyDecorationPositionChange(decoration, templateId, next) {
  const { x, y, scale } = next;
  return {
    ...decoration,
    positions: { ...decoration.positions, [templateId]: { x, y, scale } },
  };
}
