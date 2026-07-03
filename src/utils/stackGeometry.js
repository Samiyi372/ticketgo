// ── Card geometry ─────────────────────────────────────────────────────────────

/**
 * Four corners of a card that is positioned at (left, top) with size (cardW × cardH)
 * and rotated `angleDeg` degrees around its bottom-centre
 * (= the "transform-origin: bottom center" used by the stack renderer).
 * Returns [[x,y], …] in the same coordinate space as left/top.
 */
export function cardCorners(left, top, cardW, cardH, angleDeg) {
  const px = left + cardW / 2; // pivot x
  const py = top  + cardH;     // pivot y (bottom-centre)
  const r  = (angleDeg * Math.PI) / 180;
  const c  = Math.cos(r), s = Math.sin(r);
  // corners relative to pivot
  return [
    [-cardW / 2, -cardH],
    [ cardW / 2, -cardH],
    [ cardW / 2,  0    ],
    [-cardW / 2,  0    ],
  ].map(([x, y]) => [px + x * c - y * s, py + x * s + y * c]);
}

// ── Polygon area (shoelace) ───────────────────────────────────────────────────
export function polygonArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// ── Sutherland-Hodgman clip against axis-aligned rectangle ────────────────────
function lerp(a, b, t) { return a + t * (b - a); }

function clipEdge(poly, side, v) {
  if (!poly.length) return [];
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const pre = poly[(i - 1 + n) % n];
    const curIn = side === 'L' ? cur[0] >= v : side === 'R' ? cur[0] <= v
                : side === 'T' ? cur[1] >= v :                cur[1] <= v;
    const preIn = side === 'L' ? pre[0] >= v : side === 'R' ? pre[0] <= v
                : side === 'T' ? pre[1] >= v :                pre[1] <= v;
    if (preIn && curIn) {
      out.push(cur);
    } else if (preIn) {
      // exiting
      const t = (side === 'L' || side === 'R')
        ? (v - pre[0]) / (cur[0] - pre[0] || 1e-10)
        : (v - pre[1]) / (cur[1] - pre[1] || 1e-10);
      out.push([lerp(pre[0], cur[0], t), lerp(pre[1], cur[1], t)]);
    } else if (curIn) {
      // entering
      const t = (side === 'L' || side === 'R')
        ? (v - pre[0]) / (cur[0] - pre[0] || 1e-10)
        : (v - pre[1]) / (cur[1] - pre[1] || 1e-10);
      out.push([lerp(pre[0], cur[0], t), lerp(pre[1], cur[1], t)]);
      out.push(cur);
    }
  }
  return out;
}

export function clipToRect(poly, x0, y0, x1, y1) {
  let out = poly;
  out = clipEdge(out, 'L', x0);
  out = clipEdge(out, 'R', x1);
  out = clipEdge(out, 'T', y0);
  out = clipEdge(out, 'B', y1);
  return out;
}

// ── Visibility check ──────────────────────────────────────────────────────────
/**
 * Check how much of each card is visible within the output canvas.
 * Layout items are in design-canvas space; the design canvas is contain-fitted
 * (centered, no overflow) into the outputW × outputH export canvas.
 *
 * Returns { perCard: [{frac, visArea, cardArea}], overall }
 */
export function checkVisibility(items, cardW, cardH, designW, designH, outputW, outputH) {
  const fitS = Math.min(outputW / designW, outputH / designH);
  const ox   = (outputW - designW * fitS) / 2;
  const oy   = (outputH - designH * fitS) / 2;
  const cW   = cardW * fitS;
  const cH   = cardH * fitS;
  const cardArea = cW * cH;

  const perCard = items.map(({ left, top, angle }) => {
    const corners = cardCorners(ox + left * fitS, oy + top * fitS, cW, cH, angle);
    const clipped = clipToRect(corners, 0, 0, outputW, outputH);
    const visArea = polygonArea(clipped);
    return { frac: cardArea > 0 ? visArea / cardArea : 0, visArea, cardArea };
  });

  const totalVis  = perCard.reduce((s, c) => s + c.visArea,   0);
  const totalArea = perCard.reduce((s, c) => s + c.cardArea,  0);
  const overall   = totalArea > 0 ? totalVis / totalArea : 0;
  return { perCard, overall };
}

// ── Visibility repair ─────────────────────────────────────────────────────────
/**
 * Adjust layout items so per-card visibility ≥ minPerCard and overall ≥ minOverall.
 * Items are modified in design-canvas space; returns adjusted array.
 *
 * Repair priority:
 *   1. Scale-down the whole stack around the design canvas centre (1.0 → 0.70, step 0.05)
 *   2. At 0.70 scale, try translating the stack in a grid of small offsets
 *   3. Per-card: nudge each outlier card toward the canvas centre
 */
export function repairLayout(items, cardW, cardH, designW, designH, outputW, outputH, {
  minPerCard = 0.70, minOverall = 0.80,
} = {}) {
  const cx = designW / 2;
  const cy = designH / 2;

  function passes(it) {
    const { perCard, overall } = checkVisibility(it, cardW, cardH, designW, designH, outputW, outputH);
    return overall >= minOverall && perCard.every(c => c.frac >= minPerCard);
  }

  // Step 1 — scale around centre
  for (let step = 0; step <= 6; step++) {
    const s = 1 - step * 0.05; // 1.00, 0.95 … 0.70
    const scaled = items.map(it => ({
      ...it,
      left: cx + (it.left - cx) * s,
      top:  cy + (it.top  - cy) * s,
    }));
    if (passes(scaled)) return scaled;
  }

  // Step 2 — scale 0.70 + translate grid
  const s70 = items.map(it => ({
    ...it,
    left: cx + (it.left - cx) * 0.70,
    top:  cy + (it.top  - cy) * 0.70,
  }));
  for (const dx of [-80, -40, 0, 40, 80])
    for (const dy of [-80, -40, 0, 40, 80]) {
      const t = s70.map(it => ({ ...it, left: it.left + dx, top: it.top + dy }));
      if (passes(t)) return t;
    }

  // Step 3 — per-card nudge toward centre
  const { perCard } = checkVisibility(s70, cardW, cardH, designW, designH, outputW, outputH);
  return s70.map((it, i) => {
    if (perCard[i].frac >= minPerCard) return it;
    return {
      ...it,
      left: it.left + (cx - it.left) * 0.35,
      top:  it.top  + (cy - it.top ) * 0.35,
    };
  });
}
