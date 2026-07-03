import { EXPORT_PIXEL_RATIO } from "./dimensions";
import { captureNodeToCanvas } from "./exportBlend";
import { buildFontEmbedCSS } from "./fontEmbed";

// Exports a DOM node as a PNG at true 300 DPI, since the node itself is laid out
// in real CSS millimetres. `pixelRatio` upscales from the 96dpi CSS rendering to
// 300dpi without changing the node's apparent on-screen size or layout.
export async function exportNodeToPng(node, { pixelRatio = EXPORT_PIXEL_RATIO, backgroundColor, notchColor, captureStyle } = {}) {
  const fontEmbedCSS = await buildFontEmbedCSS(node.textContent || "");
  const canvas = await captureNodeToCanvas(node, { pixelRatio, backgroundColor, fontEmbedCSS, notchColor, captureStyle });
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
