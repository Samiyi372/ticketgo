import { toCanvas } from "html-to-image";

const TEXTURE_SELECTOR = ".paper-texture, .paper-noise, .bleed-texture, .bleed-noise";
const NOISE_SELECTOR = ".paper-noise, .bleed-noise";
const NOISE_TILE_PX = 200;

// iOS Safari's SVG-foreignObject rasterization (the technique html-to-image
// relies on internally) doesn't apply CSS mix-blend-mode to content rendered
// inside that foreignObject, so multiply-blended layers — paper texture/noise
// and the draggable decoration image — silently disappear from exports on iPhone
// even though the live page renders them correctly. These layers are excluded from
// html-to-image's capture and drawn back by hand using Canvas2D compositing.
//
// Background images (.main-bg-image) are intentionally NOT excluded: they must
// render at z-index 0 (below text at z-index 2) so that white text remains
// visible over a dark background image. Excluding them and redrawing afterwards
// would place them above the text layer, making light-coloured text invisible.
export async function captureNodeToCanvas(node, { pixelRatio, backgroundColor, fontEmbedCSS, notchColor } = {}) {
  const nodeRect = node.getBoundingClientRect();
  const textureEls = Array.from(node.querySelectorAll(TEXTURE_SELECTOR));
  const decorationEls = Array.from(node.querySelectorAll(".decoration-wrapper .decoration-img"));
  const notchEls = Array.from(node.querySelectorAll(".divider-notch"));
  // Background images are NOT excluded — html-to-image renders them at the correct
  // z-index (below text content), which is essential for white text to remain visible
  // over a dark background image. Excluding them and redrawing afterwards would place
  // them above the text layer, hiding any light-coloured text underneath.
  const excluded = new Set([...textureEls, ...decorationEls, ...notchEls]);

  const canvas = await toCanvas(node, {
    pixelRatio,
    backgroundColor,
    cacheBust: true,
    skipFonts: fontEmbedCSS != null ? undefined : false,
    fontEmbedCSS: fontEmbedCSS ?? undefined,
    filter: (el) => !el.classList?.contains("no-export") && !excluded.has(el),
  });

  const scale = canvas.width / nodeRect.width;
  const ctx = canvas.getContext("2d");

  // Draw in z-index order: texture first, then decoration.
  // (Background images are already composited by html-to-image above.)
  for (const el of textureEls) {
    await drawTextureLayer(ctx, el, nodeRect, scale);
  }
  for (const el of decorationEls) {
    await drawDecorationLayer(ctx, el, nodeRect, scale);
  }

  // Render the divider notches. For single-ticket and collage exports (no
  // notchColor) we punch transparent holes so the collage background colour
  // shows through — matching how a real punched hole looks against whatever
  // surface the ticket sits on. For A4 print exports (notchColor = "#ffffff")
  // we fill with solid white instead: the PNG may be placed on a coloured
  // backdrop in a design tool, and the notches should always print white on
  // the paper regardless of viewing context.
  if (notchEls.length > 0) {
    ctx.save();
    if (notchColor) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = notchColor;
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
    }
    for (const el of notchEls) {
      const rect = el.getBoundingClientRect();
      const cx = (rect.left + rect.width / 2 - nodeRect.left) * scale;
      const cy = (rect.top + rect.height / 2 - nodeRect.top) * scale;
      const r = (rect.width / 2) * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  return canvas;
}

async function drawTextureLayer(ctx, el, nodeRect, scale) {
  const rect = el.getBoundingClientRect();
  const x = (rect.left - nodeRect.left) * scale;
  const y = (rect.top - nodeRect.top) * scale;
  const w = rect.width * scale;
  const h = rect.height * scale;
  if (w <= 0 || h <= 0) return;

  const src = extractBackgroundUrl(el);
  if (!src) return;
  const img = await loadImage(src);
  const opacity = parseFloat(getComputedStyle(el).opacity) || 1;

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (el.matches(NOISE_SELECTOR)) {
    const tile = NOISE_TILE_PX * scale;
    for (let ty = y; ty < y + h; ty += tile) {
      for (let tx = x; tx < x + w; tx += tile) {
        ctx.drawImage(img, tx, ty, tile, tile);
      }
    }
  } else {
    drawCover(ctx, img, x, y, w, h);
  }
  ctx.restore();
}

async function drawDecorationLayer(ctx, imgEl, nodeRect, scale) {
  const rect = imgEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = (rect.left - nodeRect.left) * scale;
  const y = (rect.top - nodeRect.top) * scale;
  const w = rect.width * scale;
  const h = rect.height * scale;

  const style = getComputedStyle(imgEl);
  const opacity = parseFloat(style.opacity) || 1;
  const blend = style.mixBlendMode === "multiply" ? "multiply" : "source-over";

  const img = await loadImage(imgEl.src);
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha = opacity;
  // .decoration-img is object-fit: contain, not fill — drawing it stretched
  // to exactly fill its (square) box would distort any non-square image.
  drawContain(ctx, img, x, y, w, h);
  ctx.restore();
}

// Mirrors CSS background-size: cover within the given rect.
function drawCover(ctx, img, x, y, w, h) {
  const coverScale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * coverScale;
  const drawH = img.height * coverScale;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

// Mirrors CSS object-fit: contain within the given rect.
function drawContain(ctx, img, x, y, w, h) {
  const containScale = Math.min(w / img.width, h / img.height);
  const drawW = img.width * containScale;
  const drawH = img.height * containScale;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function extractBackgroundUrl(el) {
  const bg = getComputedStyle(el).backgroundImage;
  const match = /url\((['"]?)(.*?)\1\)/.exec(bg);
  return match ? match[2] : null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
