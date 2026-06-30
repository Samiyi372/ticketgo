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

// Generates random center positions for a mesh gradient (values in percent,
// kept in the 10-90 range so blobs always partially cover the card).
export function randomMeshPositions(count) {
  return Array.from({ length: count }, () => ({
    cx: Math.round(10 + Math.random() * 80),
    cy: Math.round(10 + Math.random() * 80),
  }));
}

// Stacks overlapping radial gradients — one per color — to simulate the soft
// color-blob "mesh gradient" look popularised by meshgradient.in.
export function buildMeshGradient(colors, positions) {
  if (!colors || colors.length === 0 || !positions || positions.length === 0) return null;
  const base = colors[colors.length - 1];
  const layers = colors.map((color, i) => {
    const { cx, cy } = positions[i] ?? { cx: 50, cy: 50 };
    return `radial-gradient(ellipse at ${cx}% ${cy}%, ${color} 0%, transparent 72%)`;
  });
  return [...layers, base].join(", ");
}
