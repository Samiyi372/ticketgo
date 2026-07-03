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

function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(header)?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

// Some desktop browsers (e.g. Chrome/Edge on Windows) implement enough of
// the Web Share API to pass the feature checks below, but there's no photo
// library for the share sheet to save into there — it would just be a more
// roundabout way to do the same anchor download. Restrict the share-sheet
// path to mobile, where it's the only way to get an image into the system
// photo library at all.
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Mobile browsers (iOS Safari, Android Chrome, ...) can share a file straight
// into the OS share sheet, which has a built-in "Save Image" / "存储图像" /
// "保存到相册" action — there's no other way for a web page to put an image
// into the system photo library without a native app. Desktop browsers (and
// any mobile browser without file-sharing support) fall back to the plain
// anchor-click download.
export async function downloadDataUrl(dataUrl, filename) {
  if (IS_MOBILE && navigator.canShare && navigator.share) {
    let file = null;
    try {
      file = dataUrlToFile(dataUrl, filename);
    } catch {
      file = null;
    }
    if (file && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        // The user dismissing an actually-opened share sheet rejects with
        // AbortError — respect that instead of also triggering a surprise
        // download. Any other failure (most commonly: the browser refusing
        // to open the sheet at all because the canvas render's await chain
        // ate too much of the click's user-activation window, especially on
        // iOS Safari) falls through to the plain download below instead of
        // silently doing nothing.
        if (err?.name === "AbortError") return;
      }
    }
  }

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
