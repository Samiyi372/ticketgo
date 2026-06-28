// A small tileable SVG noise texture (feTurbulence), used as a low-opacity
// background-image overlay to give the ticket a slightly aged paper feel
// instead of a flat, screenshot-like fill.
const NOISE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <filter id="n">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" result="noise" />
    <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0" />
  </filter>
  <rect width="100%" height="100%" filter="url(#n)" />
</svg>
`.trim();

export const NOISE_BACKGROUND = `url("data:image/svg+xml;utf8,${encodeURIComponent(NOISE_SVG)}")`;
