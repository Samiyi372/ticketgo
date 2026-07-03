import { TICKET_WIDTH_MM, TICKET_HEIGHT_MM, CSS_DPI, mmToPx } from "./dimensions";

// Must match .divider-notch's 24px diameter in the template CSS files.
const NOTCH_RADIUS_PX = 12;

// Builds a clip-path that cuts two semicircular "punch hole" bites directly
// out of the ticket's own shape at the stub/main divider, exactly where the
// .divider-notch overlays sit. A single vector path (rather than an opaque
// circle painted on top, or layered CSS masks) makes the cut a genuine hole
// in the element itself: whatever sits behind it — the page background, or
// another card underneath it in a stack — shows through. Because clip-path
// only ever affects the element it's applied to, the cut can never bleed
// into a different, unrelated ticket.
export function getNotchClipPath(mirrored = false) {
  const w = mmToPx(TICKET_WIDTH_MM, CSS_DPI);
  const h = mmToPx(TICKET_HEIGHT_MM, CSS_DPI);
  const r = NOTCH_RADIUS_PX;
  const x = mirrored ? w * 0.8 : w * 0.2;
  const path = [
    `M 0 0`,
    `L ${x - r} 0`,
    `A ${r} ${r} 0 0 0 ${x + r} 0`,
    `L ${w} 0`,
    `L ${w} ${h}`,
    `L ${x + r} ${h}`,
    `A ${r} ${r} 0 0 0 ${x - r} ${h}`,
    `L 0 ${h}`,
    `Z`,
  ].join(" ");
  return `path("${path}")`;
}
