import { toCanvas } from "html-to-image";

const TEXTURE_SELECTOR = ".paper-texture, .paper-noise, .bleed-texture, .bleed-noise";
const NOISE_SELECTOR = ".paper-noise, .bleed-noise";
const NOISE_TILE_PX = 200;
// Each stack card is one ".ts-item" — used to resolve per-card z-index so a
// lower card's hand-drawn texture/decoration/notch never paints over a higher
// card that visually overlaps it. Absent (e.g. single-ticket/collage export,
// where cards never overlap) this list is empty and drawing falls back to the
// simple, unclipped path.
const CARD_SELECTOR = ".ts-item";

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
export async function captureNodeToCanvas(node, { pixelRatio, backgroundColor, fontEmbedCSS, notchColor, captureStyle } = {}) {
  // Apply captureStyle synchronously before any await so getBoundingClientRect
  // and all element rects are measured in the correct coordinate space.
  // This is necessary when the node has a display-fit transform (e.g. the stack
  // canvas uses translate+scale to fit inside the preview container) — capturing
  // with that transform active would position content at display-scale coordinates
  // rather than the full design-canvas coordinates.
  const savedStyles = {};
  if (captureStyle) {
    for (const [k, v] of Object.entries(captureStyle)) {
      savedStyles[k] = node.style[k];
      node.style[k] = v;
    }
  }

  const nodeRect = node.getBoundingClientRect();
  const textureEls = Array.from(node.querySelectorAll(TEXTURE_SELECTOR));
  const decorationEls = Array.from(node.querySelectorAll(".decoration-wrapper .decoration-img"));
  const notchEls = Array.from(node.querySelectorAll(".divider-notch"));
  const cardEls = Array.from(node.querySelectorAll(CARD_SELECTOR));
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
    // Pass captureStyle as html-to-image's `style` option so the clone of the
    // root element also carries the overrides, guarding against React re-renders
    // that restore the live-DOM styles during toCanvas's internal async operations.
    ...(captureStyle ? { style: captureStyle } : {}),
  });

  // Restore live-DOM styles immediately after capture.
  if (captureStyle) {
    for (const [k, v] of Object.entries(savedStyles)) {
      node.style[k] = v;
    }
  }

  // `scale` (screen px -> canvas px) is derived from getBoundingClientRect(),
  // which reflects the node's *visual* size after any ancestor CSS transform
  // — e.g. the single-ticket editor wraps the ticket in a responsive
  // `transform: scale(...)` to fit narrow screens, which can shrink it well
  // below its true size on mobile. html-to-image itself sizes the canvas
  // from `node.clientWidth`, which ignores transforms entirely, so `scale`
  // and the canvas's true pixel density only agree when nothing outside
  // `node` is scaling it (true for hidden/offscreen capture nodes, false for
  // the live, responsively-shrunk editor preview).
  //
  // That's fine for *positions*: an element's offset from `node`'s corner is
  // measured in the same (shrunk) screen space for both points, so the
  // shrink factor cancels out and `scale` converts it correctly. It's wrong
  // for *sizes* like `el.offsetWidth`, which is already an unscaled CSS
  // measurement — multiplying it by `scale` double-counts the ancestor
  // shrink and inflates the drawn texture/decoration well past their real
  // size. `trueScale`, derived from the untransformed clientWidth instead,
  // is the correct multiplier for those.
  const scale = canvas.width / nodeRect.width;
  const trueScale = canvas.width / node.clientWidth;
  const ctx = canvas.getContext("2d");

  // Draw in z-index order: texture first, then decoration.
  // (Background images are already composited by html-to-image above.)
  for (const el of textureEls) {
    await drawTextureLayer(ctx, el, nodeRect, scale, trueScale, node, cardEls);
  }
  for (const el of decorationEls) {
    await drawDecorationLayer(ctx, el, nodeRect, scale, trueScale, node, cardEls);
  }

  // Render the divider notches. For single-ticket and collage exports (no
  // notchColor) we punch transparent holes so the collage background colour
  // shows through — matching how a real punched hole looks against whatever
  // surface the ticket sits on. For A4 print exports (notchColor = "#ffffff")
  // we fill with solid white instead: the PNG may be placed on a coloured
  // backdrop in a design tool, and the notches should always print white on
  // the paper regardless of viewing context.
  if (notchEls.length > 0) {
    for (const el of notchEls) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const cx = (rect.left + rect.width / 2 - nodeRect.left) * scale;
      const cy = (rect.top + rect.height / 2 - nodeRect.top) * scale;
      const r = (rect.width / 2) * scale;
      const higherPolys = getOcclusionPolygons(el, cardEls, nodeRect, scale, trueScale, node);

      const paint = (targetCtx) => {
        targetCtx.beginPath();
        targetCtx.arc(cx, cy, r, 0, Math.PI * 2);
        targetCtx.fill();
      };

      if (higherPolys.length === 0) {
        ctx.save();
        if (notchColor) {
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = notchColor;
        } else {
          ctx.globalCompositeOperation = "destination-out";
        }
        paint(ctx);
        ctx.restore();
      } else {
        // A card lower in the stack can have a notch that a higher card
        // overlaps — punching straight into the shared canvas (or painting
        // solid over it) would cut a hole through / paint over that higher
        // card too. Composite on an isolated layer first, punch out the
        // higher cards' footprint there, then merge the leftover onto the
        // main canvas.
        const layer = document.createElement("canvas");
        layer.width = canvas.width;
        layer.height = canvas.height;
        const lctx = layer.getContext("2d");
        lctx.fillStyle = notchColor || "#000";
        paint(lctx);
        lctx.globalCompositeOperation = "destination-out";
        for (const poly of higherPolys) {
          lctx.beginPath();
          tracePolygon(lctx, poly);
          lctx.fill();
        }

        ctx.save();
        ctx.globalCompositeOperation = notchColor ? "source-over" : "destination-out";
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      }
    }
  }

  return canvas;
}

// Elements like the stack's card items are rotated via an ancestor's CSS
// transform (e.g. .ts-item's `rotate(...)`, on top of the stack canvas's
// fit-scale and pan/zoom). getBoundingClientRect() only reports the
// axis-aligned bounding box of a rotated element, which is both mis-sized and
// mis-angled relative to the true rotated shape — drawing the texture/decoration
// into that box makes it disagree with the (correctly rotated) ticket that
// html-to-image renders underneath. Walk the ancestor chain and accumulate the
// rotation angle and uniform scale from each CSS transform instead, so the
// layer can be drawn in its own local box and rotated to match exactly.
function getTransformToAncestor(el, ancestor) {
  let angle = 0;
  let scale = 1;
  let node = el;
  while (node && node !== ancestor) {
    const t = getComputedStyle(node).transform;
    if (t && t !== "none") {
      const m = new DOMMatrix(t);
      angle += Math.atan2(m.b, m.a) * (180 / Math.PI);
      scale *= Math.hypot(m.a, m.b);
    }
    node = node.parentElement;
  }
  return { angle, scale };
}

// Resolves an element's centre, rotation and on-canvas size in one place so
// texture/decoration/card-footprint code all agree on the same geometry.
// `scale` (screen-space, may be contaminated by an ancestor transform
// outside `ancestor`) is used for the centre position; `trueScale` (from
// the untransformed clientWidth) is used for the size, since offsetWidth is
// itself an untransformed measurement — see the note in captureNodeToCanvas.
function computePlacement(el, nodeRect, scale, trueScale, ancestor) {
  const rect = el.getBoundingClientRect();
  const { angle, scale: localScale } = getTransformToAncestor(el, ancestor);
  const totalScale = trueScale * localScale;
  const cx = (rect.left + rect.width / 2 - nodeRect.left) * scale;
  const cy = (rect.top + rect.height / 2 - nodeRect.top) * scale;
  const w = el.offsetWidth * totalScale;
  const h = el.offsetHeight * totalScale;
  return { cx, cy, angle, w, h, totalScale };
}

function polygonFromPlacement({ cx, cy, angle, w, h }) {
  const rad = (angle * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const hw = w / 2, hh = h / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

function tracePolygon(ctx, poly) {
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
}

function zIndexOf(el) {
  return parseInt(el.style.zIndex || getComputedStyle(el).zIndex, 10) || 0;
}

// Returns the on-canvas polygons of every card that sits above `el`'s own
// card in the stack, so its texture/decoration/notch can be clipped away
// from the area they occlude. Empty when `el` isn't part of a card stack.
function getOcclusionPolygons(el, cardEls, nodeRect, scale, trueScale, ancestor) {
  if (!cardEls || cardEls.length === 0) return [];
  const ownCard = el.closest(CARD_SELECTOR);
  if (!ownCard) return [];
  const ownZ = zIndexOf(ownCard);
  return cardEls
    .filter((c) => c !== ownCard && zIndexOf(c) > ownZ)
    .map((c) => polygonFromPlacement(computePlacement(c, nodeRect, scale, trueScale, ancestor)));
}

async function drawTextureLayer(ctx, el, nodeRect, scale, trueScale, node, cardEls) {
  const placement = computePlacement(el, nodeRect, scale, trueScale, node);
  const { cx, cy, angle, w, h, totalScale } = placement;
  if (w <= 0 || h <= 0) return;

  const src = extractBackgroundUrl(el);
  if (!src) return;
  const img = await loadImage(src);
  const opacity = parseFloat(getComputedStyle(el).opacity) || 1;
  const isNoise = el.matches(NOISE_SELECTOR);

  const paint = (targetCtx) => {
    targetCtx.save();
    targetCtx.translate(cx, cy);
    targetCtx.rotate((angle * Math.PI) / 180);
    targetCtx.beginPath();
    targetCtx.rect(-w / 2, -h / 2, w, h);
    targetCtx.clip();
    if (isNoise) {
      const tile = NOISE_TILE_PX * totalScale;
      for (let ty = -h / 2; ty < h / 2; ty += tile) {
        for (let tx = -w / 2; tx < w / 2; tx += tile) {
          targetCtx.drawImage(img, tx, ty, tile, tile);
        }
      }
    } else {
      drawCover(targetCtx, img, -w / 2, -h / 2, w, h);
    }
    targetCtx.restore();
  };

  const higherPolys = getOcclusionPolygons(el, cardEls, nodeRect, scale, trueScale, node);
  if (higherPolys.length === 0) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = opacity;
    paint(ctx);
    ctx.restore();
    return;
  }

  // A lower card's texture must not multiply-darken a higher card that
  // overlaps it. Composite on an isolated layer, punch out the higher
  // cards' footprint there (safe — it only erases pixels on this scratch
  // layer), then merge what's left onto the main canvas with the real
  // blend mode.
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const lctx = layer.getContext("2d");
  paint(lctx);
  lctx.globalCompositeOperation = "destination-out";
  for (const poly of higherPolys) {
    lctx.beginPath();
    tracePolygon(lctx, poly);
    lctx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = opacity;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

async function drawDecorationLayer(ctx, imgEl, nodeRect, scale, trueScale, node, cardEls) {
  const placement = computePlacement(imgEl, nodeRect, scale, trueScale, node);
  const { cx, cy, angle, w, h } = placement;
  if (w <= 0 || h <= 0) return;

  const style = getComputedStyle(imgEl);
  const opacity = parseFloat(style.opacity) || 1;
  const blend = style.mixBlendMode === "multiply" ? "multiply" : "source-over";
  const img = await loadImage(imgEl.src);

  const paint = (targetCtx) => {
    targetCtx.save();
    targetCtx.translate(cx, cy);
    targetCtx.rotate((angle * Math.PI) / 180);
    // .decoration-img is object-fit: contain, not fill — drawing it stretched
    // to exactly fill its (square) box would distort any non-square image.
    drawContain(targetCtx, img, -w / 2, -h / 2, w, h);
    targetCtx.restore();
  };

  const higherPolys = getOcclusionPolygons(imgEl, cardEls, nodeRect, scale, trueScale, node);
  if (higherPolys.length === 0) {
    ctx.save();
    ctx.globalCompositeOperation = blend;
    ctx.globalAlpha = opacity;
    paint(ctx);
    ctx.restore();
    return;
  }

  // A decoration belongs to its own card and must be hidden wherever a
  // higher card in the stack covers that card — otherwise it floats on
  // top of tickets that should occlude it. Same isolated-layer trick as
  // the texture layer above.
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const lctx = layer.getContext("2d");
  paint(lctx);
  lctx.globalCompositeOperation = "destination-out";
  for (const poly of higherPolys) {
    lctx.beginPath();
    tracePolygon(lctx, poly);
    lctx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.globalAlpha = opacity;
  ctx.drawImage(layer, 0, 0);
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
