// All on-screen ticket markup is laid out using real CSS millimetres (`mm` units).
// Browsers render CSS length units at a fixed 96 CSS-px-per-inch regardless of the
// physical screen, so 1mm on screen is always 96 / 25.4 CSS px. That means we can
// upscale the exported PNG to true 300 DPI just by rendering it at a pixel ratio of
// (300 / 96), with no separate mm -> px bookkeeping required.
export const CSS_DPI = 96;
export const EXPORT_DPI = 300;
export const EXPORT_PIXEL_RATIO = EXPORT_DPI / CSS_DPI;

export const MM_PER_INCH = 25.4;

// px = mm / 25.4 * dpi
export function mmToPx(mm, dpi = EXPORT_DPI) {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

// Long-strip ticket, landscape orientation (stub on the left, main ticket on the right).
export const TICKET_WIDTH_MM = 200;
export const TICKET_HEIGHT_MM = 80;

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export const LAYOUT_MARGIN_PX = 30;

// Print bleed: how far the background color extends past the trim (cut) line
// in the A4 imposition export. The crop mark sits exactly at the true 200x80mm
// trim size; the color behind it keeps going for another BLEED_MM beyond that,
// so a cut that's a little off the dashed line still lands on color, not white
// paper. Text/decoration positions are unaffected — only the background fill
// is extended outward.
export const BLEED_MM = 3;
