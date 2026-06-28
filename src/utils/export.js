import { EXPORT_PIXEL_RATIO } from "./dimensions";
import { captureNodeToCanvas } from "./exportBlend";

// Exports a DOM node as a PNG at true 300 DPI, since the node itself is laid out
// in real CSS millimetres. `pixelRatio` upscales from the 96dpi CSS rendering to
// 300dpi without changing the node's apparent on-screen size or layout.
export async function exportNodeToPng(node, { pixelRatio = EXPORT_PIXEL_RATIO, backgroundColor } = {}) {
  // html-to-image clones the node into an SVG and rasterizes that separately
  // from the page's own rendering, so it needs the custom Google Fonts to have
  // actually finished downloading by this point — otherwise it silently
  // substitutes a fallback font in the exported image even though the live
  // preview (rendered directly by the browser, not re-rasterized) already
  // looks correct.
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
