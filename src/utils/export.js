import { toPng } from "html-to-image";
import { EXPORT_PIXEL_RATIO } from "./dimensions";

// Exports a DOM node as a PNG at true 300 DPI, since the node itself is laid out
// in real CSS millimetres. `pixelRatio` upscales from the 96dpi CSS rendering to
// 300dpi without changing the node's apparent on-screen size or layout.
export async function exportNodeToPng(node, { pixelRatio = EXPORT_PIXEL_RATIO, backgroundColor } = {}) {
  return toPng(node, {
    pixelRatio,
    backgroundColor,
    cacheBust: true,
    skipFonts: false,
    filter: (el) => !el.classList?.contains("no-export"),
  });
}

export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
