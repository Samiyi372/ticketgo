import { EXPORT_PIXEL_RATIO } from "./dimensions";
import { captureNodeToCanvas } from "./exportBlend";

// All font faces used across the ticket templates. Explicitly loading these
// before capture ensures they are downloaded even when the ticket node being
// exported lives in a hidden off-screen container that the browser hasn't
// needed to paint yet — document.fonts.ready only waits for fonts that have
// already *started* loading, so it alone isn't sufficient for lazy fonts.
const TICKET_FONTS = [
  '400 1px "Cutive Mono"',
  '300 1px "DM Mono"',
  '400 1px "DM Mono"',
  '500 1px "DM Mono"',
  '300 1px "Noto Serif SC"',
  '400 1px "Noto Serif SC"',
];

// Exports a DOM node as a PNG at true 300 DPI, since the node itself is laid out
// in real CSS millimetres. `pixelRatio` upscales from the 96dpi CSS rendering to
// 300dpi without changing the node's apparent on-screen size or layout.
export async function exportNodeToPng(node, { pixelRatio = EXPORT_PIXEL_RATIO, backgroundColor } = {}) {
  if (document.fonts?.load) {
    await Promise.all(TICKET_FONTS.map((f) => document.fonts.load(f).catch(() => {})));
  }
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = await captureNodeToCanvas(node, { pixelRatio, backgroundColor });
  return canvas.toDataURL("image/png");
}

export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
