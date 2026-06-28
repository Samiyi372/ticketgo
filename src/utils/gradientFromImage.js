import { extractPalette } from "./colorPalette";

// Reduces an uploaded background image down to its most dominant colors, so
// they can stand in for the raw photo as a flatter, print-friendlier
// background. Returned as a plain color list (not a baked gradient string)
// since different uses need different gradient directions — the stub itself
// reads top-to-bottom, while the thin horizontal accent lines need the same
// colors running left-to-right to actually show a visible transition.
export async function extractGradientColors(dataUrl, stops = 3) {
  return extractPalette(dataUrl, stops);
}

export function buildGradient(colors, angle = 180) {
  if (!colors || colors.length === 0) return null;
  if (colors.length === 1) return colors[0];
  return `linear-gradient(${angle}deg, ${colors.join(", ")})`;
}
