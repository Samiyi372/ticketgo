import { toCanvas } from "html-to-image";

const TEXTURE_SELECTOR = ".paper-texture, .paper-noise, .bleed-texture, .bleed-noise";
const NOISE_SELECTOR = ".paper-noise, .bleed-noise";
const NOISE_TILE_PX = 200;

// iOS Safari's SVG-foreignObject rasterization (the technique html-to-image
// relies on internally) doesn't apply CSS mix-blend-mode to content rendered
// inside that foreignObject, so every multiply-blended layer — paper
// texture/noise, the draggable decoration image — silently disappears from
// exports on iPhone even though the live page renders them correctly.
// Canvas2D's own compositing operations are a completely different, far more
// reliably supported code path, so these specific layers are excluded from
// html-to-image's capture and instead drawn back in by hand afterwards using
// ctx.globalCompositeOperation.
export async function captureNodeToCanvas(node, { pixelRatio, backgroundColor } = {}) {
  const nodeRect = node.getBoundingClientRect();
  const textureEls = Array.from(node.querySelectorAll(TEXTURE_SELECTOR));
  const decorationEls = Array.from(node.querySelectorAll(".decoration-wrapper .decoration-img"));
  const excluded = new Set([...textureEls, ...decorationEls]);

  const canvas = await toCanvas(node, {
    pixelRatio,
    backgroundColor,
    cacheBust: true,
    skipFonts: false,
    filter: (el) => !el.classList?.contains("no-export") && !excluded.has(el),
  });

  const scale = canvas.width / nodeRect.width;
  const ctx = canvas.getContext("2d");

  for (const el of textureEls) {
    await drawTextureLayer(ctx, el, nodeRect, scale);
  }
  for (const el of decorationEls) {
    await drawDecorationLayer(ctx, el, nodeRect, scale);
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
  ctx.drawImage(img, x, y, w, h);
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
