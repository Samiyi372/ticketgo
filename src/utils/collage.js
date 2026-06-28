import { exportNodeToPng } from "./export";
import { mmToPx, TICKET_WIDTH_MM, TICKET_HEIGHT_MM, EXPORT_PIXEL_RATIO } from "./dimensions";

const GAP_MM = 10;
const MARGIN_MM = 10;

// Stacks several already-rendered ticket DOM nodes into one tall PNG (all
// tickets share the same fixed mm size regardless of template, so a simple
// vertical stack needs no per-ticket scaling), each still captured at true
// 300dpi like the single-ticket exports.
export async function exportCollage(nodes) {
  const widthPx = mmToPx(TICKET_WIDTH_MM);
  const heightPx = mmToPx(TICKET_HEIGHT_MM);
  const gapPx = mmToPx(GAP_MM);
  const marginPx = mmToPx(MARGIN_MM);

  const dataUrls = await Promise.all(
    nodes.map((node) => exportNodeToPng(node, { pixelRatio: EXPORT_PIXEL_RATIO }))
  );
  const images = await Promise.all(dataUrls.map(loadImage));

  const canvas = document.createElement("canvas");
  canvas.width = widthPx + marginPx * 2;
  canvas.height = marginPx * 2 + heightPx * images.length + gapPx * (images.length - 1);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  images.forEach((img, i) => {
    const y = marginPx + i * (heightPx + gapPx);
    ctx.drawImage(img, marginPx, y, widthPx, heightPx);
  });

  return canvas.toDataURL("image/png");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
