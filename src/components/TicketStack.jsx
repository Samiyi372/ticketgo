import { useEffect, useMemo, useRef, useState } from "react";
import { getTemplateComponent } from "./templates";
import { TICKET_WIDTH_MM, TICKET_HEIGHT_MM } from "../utils/dimensions";
import { repairLayout } from "../utils/stackGeometry";
import { exportNodeToPng } from "../utils/export";
import "./TicketStack.css";

const MM_PX = 96 / 25.4;
const CARD_W = TICKET_WIDTH_MM * MM_PX;
const CARD_H = TICKET_HEIGHT_MM * MM_PX;

// Resolution each card is individually baked to before being placed in the
// stack. This used to be the full 300dpi EXPORT_PIXEL_RATIO (~3.125x) — but
// every card in the stack is embedded as its own base64 <img>, and the final
// composite capture re-embeds ALL of those inside one SVG data URI to
// rasterise the whole canvas. With several full-300dpi cards that payload
// balloons to tens of MB, which mobile browsers (Safari and Chromium alike)
// silently fail to render as an image at all — producing a blank exported
// PNG with no error. 2x is still sharp (a card only occupies a fraction of
// the final, already-capped, output canvas) at a fraction of the data size.
const CARD_BAKE_PIXEL_RATIO = 2;

// ─── Ratio presets & export dimensions ───────────────────────────────────────
export const RATIO_PRESETS = [
  { key: "1:1",  label: "1∶1",  hint: "正方形",              w: 2160, h: 2160 },
  { key: "5:4",  label: "5∶4",  hint: "小红书 / 照片",        w: 2700, h: 2160 },
  { key: "4:3",  label: "4∶3",  hint: "传统屏幕 / 海报",      w: 2880, h: 2160 },
  { key: "16:9", label: "16∶9", hint: "B站 / 公众号 / Story", w: 3840, h: 2160 },
  { key: "3:2",  label: "3∶2",  hint: "横版照片",             w: 3240, h: 2160 },
];

export function getExportDims(canvasRatio, customW, customH, orientation = "landscape") {
  let dims;
  if (canvasRatio === "custom") {
    dims = { w: Number(customW) || 1080, h: Number(customH) || 1080 };
  } else {
    const p = RATIO_PRESETS.find((r) => r.key === canvasRatio);
    dims = p ? { w: p.w, h: p.h } : { w: 1620, h: 1080 };
  }
  if (orientation === "portrait" && dims.w !== dims.h) return { w: dims.h, h: dims.w };
  return dims;
}

// ─── PRNG & shadow ────────────────────────────────────────────────────────────
function makePRNG(seed) {
  let s = (seed | 0) || 42;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function shadow(depth) {
  const blur    = 6  + depth * 22;
  const offsetX = 3  + depth * 7;
  const offsetY = 4  + depth * 11;
  const opacity = 0.12 + depth * 0.23;
  return `${offsetX}px ${offsetY}px ${blur}px rgba(0,0,0,${opacity.toFixed(2)})`;
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ─── Fan layout ───────────────────────────────────────────────────────────────
const FAN_W_BASE   = 1060;
const FAN_H_BASE   = 560;
const _FAN_MAX_DEG = 25;
const _FAN_EXTENT  = CARD_W / 2 * Math.sin(_FAN_MAX_DEG * Math.PI / 180)
                   + CARD_H     * Math.cos(_FAN_MAX_DEG * Math.PI / 180);
const FAN_PIVOT_Y  = Math.ceil(_FAN_EXTENT) + 6;
const FAN_W        = Math.max(FAN_W_BASE, Math.ceil(CARD_W + 2 * CARD_H * Math.sin(_FAN_MAX_DEG * Math.PI / 180)) + 20);
const FAN_H        = Math.max(FAN_H_BASE, FAN_PIVOT_Y + Math.round(CARD_H * 0.15));

// User-adjustable "how wide the fan opens" — the value the draggable slider
// in the stack toolbar controls. FAN_W/FAN_H/FAN_PIVOT_Y above are sized once
// for the default spread as a nominal layout space only; they aren't a hard
// clip boundary (nothing clips .ts-canvas itself), and repairLayout already
// fits the actual rotated card corners against the chosen output canvas, so
// widening the spread well past the default stays visually safe.
export const FAN_SPREAD_MIN = 5;
export const FAN_SPREAD_MAX = 60;
export const DEFAULT_FAN_SPREAD_DEG = _FAN_MAX_DEG;

// Where every card's rotation anchor (see FAN_ANCHORS below) sits, as a
// fraction of the fan's design canvas — draggable by the user via the
// on-canvas handle, or jumpable with a double-click. Defaults to the
// original fixed pivot position.
export const DEFAULT_FAN_PIVOT = { x: 0.5, y: FAN_PIVOT_Y / FAN_H };

// Which point ON EACH CARD sits at the shared pivot above. "bottom" is the
// original look (cards fanned open from their bottom edge, like a hand of
// playing cards); "left"/"right"/"top" hinge them from a different edge
// instead (like a pinned lanyard / rolodex, opening in that direction).
export const FAN_ANCHORS = [
  { key: "bottom", label: "底边中点" },
  { key: "left",   label: "左边中点" },
  { key: "right",  label: "右边中点" },
  { key: "top",    label: "顶部中点" },
];
export const DEFAULT_FAN_ANCHOR = "bottom";

// transformOrigin for .ts-item, the card's own left/top given where the
// shared pivot (px, py) should land, and that same anchor point expressed
// in the card's own LOCAL coordinates (0,0 = the card's own top-left) — the
// first two drive the live CSS render, the last is reused by the manual
// canvas export compositor (which needs to rotate each card image around
// the same point CSS would, without relying on transform-origin at all).
// Kept in one table so each anchor's geometry only lives in one place.
const FAN_ANCHOR_GEOMETRY = {
  bottom: { origin: "bottom center", place: (px, py) => [px - CARD_W / 2, py - CARD_H], pivot: [CARD_W / 2, CARD_H] },
  left:   { origin: "left center",   place: (px, py) => [px, py - CARD_H / 2],          pivot: [0, CARD_H / 2] },
  right:  { origin: "right center",  place: (px, py) => [px - CARD_W, py - CARD_H / 2], pivot: [CARD_W, CARD_H / 2] },
  top:    { origin: "top center",    place: (px, py) => [px - CARD_W / 2, py],          pivot: [CARD_W / 2, 0] },
};

function fanLayout(n, seed, validate, spreadDeg = DEFAULT_FAN_SPREAD_DEG, pivot = DEFAULT_FAN_PIVOT, anchor = DEFAULT_FAN_ANCHOR) {
  const rng = makePRNG(seed);
  const validateRange = spreadDeg * 2;        // -spreadDeg .. +spreadDeg
  const chaosRange    = spreadDeg * 2 * 1.4;  // keeps the original 50°→70° ratio between modes
  const pivotX = pivot.x * FAN_W;
  const pivotY = pivot.y * FAN_H;
  // Position the card so that its own anchor point lands exactly on the
  // shared pivot — transformOrigin below is set to match, so this is also
  // where each card actually rotates from.
  const geometry = FAN_ANCHOR_GEOMETRY[anchor] ?? FAN_ANCHOR_GEOMETRY.bottom;
  const [left0, top0] = geometry.place(pivotX, pivotY);
  return Array.from({ length: n }, (_, i) => {
    let angle;
    if (validate) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      angle = -spreadDeg + t * validateRange + (n > 1 ? rng() * 3 - 1.5 : 0);
    } else {
      angle = rng() * chaosRange - chaosRange / 2;
    }
    return {
      left:   left0,
      top:    top0,
      angle,
      zIndex: i + 1,
      depth:  n === 1 ? 0.5 : i / (n - 1),
    };
  });
}

// ─── Radial layout ────────────────────────────────────────────────────────────
const RADIAL_W = 1800;
const RADIAL_H = 1200;

export const DEFAULT_RADIAL_PARAMS = {
  pivotX:      0.43,
  pivotY:      0.47,
  angleSpread: 340,
  angleStart:  -50,
  radiusMin:   0.25,
  radiusMax:   1.05,
  rotRange:    100,
};

function radialLayout(n, seed, validate, params = {}) {
  const {
    pivotX      = DEFAULT_RADIAL_PARAMS.pivotX,
    pivotY      = DEFAULT_RADIAL_PARAMS.pivotY,
    angleSpread = DEFAULT_RADIAL_PARAMS.angleSpread,
    angleStart  = DEFAULT_RADIAL_PARAMS.angleStart,
    radiusMin   = DEFAULT_RADIAL_PARAMS.radiusMin,
    radiusMax   = DEFAULT_RADIAL_PARAMS.radiusMax,
    rotRange    = DEFAULT_RADIAL_PARAMS.rotRange,
  } = params;

  const rng       = makePRNG(seed);
  const px        = pivotX * RADIAL_W;
  const py        = pivotY * RADIAL_H;
  const posJitter = validate ? 12 : 28;

  const items = Array.from({ length: n }, (_, i) => {
    const basePosAngle = angleStart + (angleSpread / n) * i;
    const posAngle     = basePosAngle + (rng() * 2 - 1) * posJitter;
    const posRad       = (posAngle * Math.PI) / 180;
    const radius       = (radiusMin + rng() * (radiusMax - radiusMin)) * CARD_W;
    const vcx          = px + Math.cos(posRad) * radius;
    const vcy          = py + Math.sin(posRad) * radius;

    let rotAngle;
    if (validate) {
      const baseRot = -rotRange + (2 * rotRange / n) * i;
      rotAngle = baseRot + (rng() * 2 - 1) * (rotRange / n * 0.6);
    } else {
      rotAngle = (rng() * 2 - 1) * rotRange;
    }
    const rotRad = (rotAngle * Math.PI) / 180;
    const bcx    = vcx + Math.sin(rotRad) * (CARD_H / 2);
    const bcy    = vcy + Math.cos(rotRad) * (CARD_H / 2);

    return { left: bcx - CARD_W / 2, top: bcy - CARD_H, angle: rotAngle, zIndex: 0, depth: 0 };
  });

  const zIdx = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [zIdx[i], zIdx[j]] = [zIdx[j], zIdx[i]];
  }
  return items.map((it, i) => ({ ...it, zIndex: zIdx[i], depth: (zIdx[i] - 1) / Math.max(n - 1, 1) }));
}

// ─── Cascade layout ───────────────────────────────────────────────────────────
function cascadeLayout(n, seed, validate) {
  const rng     = makePRNG(seed);
  const canvasW = CARD_W + (validate ? 140 : 220);
  let prevAngle = null;
  let cumY      = 30;
  const items   = [];
  for (let i = 0; i < n; i++) {
    let angle;
    if (validate) {
      for (let tries = 0; tries < 40; tries++) {
        angle = rng() * 16 - 8;
        if (prevAngle === null || Math.abs(angle - prevAngle) >= 2.5) break;
      }
    } else {
      angle = rng() * 30 - 15;
    }
    prevAngle = angle;
    const vStep   = validate ? 0.38 : 0.20 + rng() * 0.50;
    const txRange = validate ? 80 : 200;
    const tx      = rng() * txRange - txRange / 2;
    items.push({ left: canvasW / 2 - CARD_W / 2 + tx, top: cumY, angle, zIndex: i + 1, depth: n === 1 ? 0.5 : i / (n - 1) });
    cumY += CARD_H * vStep;
  }
  return { items, canvasW, canvasH: cumY + CARD_H * 0.6 + 30 };
}

// ─── Scatter layout ───────────────────────────────────────────────────────────
function scatterLayout(n, seed) {
  const rng = makePRNG(seed);

  function partition(total) {
    const maxClusters = Math.min(3, Math.floor(total / 2));
    if (maxClusters === 0) return [total];
    const count = maxClusters === 1 ? 1 : maxClusters === 2 ? 2 : 2 + Math.round(rng());
    const sizes = Array(count).fill(2);
    let rem = total - count * 2;
    let guard = 200;
    while (rem > 0 && guard-- > 0) {
      const g = Math.floor(rng() * count);
      if (sizes[g] < 4) { sizes[g]++; rem--; }
    }
    while (rem > 0) { sizes.push(1); rem--; }
    return sizes;
  }

  const groups  = partition(n);
  const minDist = 0.30 * Math.hypot(RADIAL_W, RADIAL_H);
  const anchors = [];
  for (let g = 0; g < groups.length; g++) {
    let ax, ay, tries = 0;
    do {
      ax = RADIAL_W * (0.18 + rng() * 0.64);
      ay = RADIAL_H * (0.18 + rng() * 0.64);
      tries++;
    } while (tries < 120 && anchors.some(([bx, by]) =>
      Math.hypot(ax - bx, ay - by) < minDist * (groups[g] === 1 ? 0.55 : 1)));
    anchors.push([ax, ay]);
  }

  const items = [];
  for (let g = 0; g < groups.length; g++) {
    const [cx, cy] = anchors[g];
    for (let j = 0; j < groups[g]; j++) {
      const spreadR = CARD_W * (0.08 + rng() * 0.38);
      const spreadA = rng() * Math.PI * 2;
      items.push({
        left:  cx + Math.cos(spreadA) * spreadR - CARD_W / 2,
        top:   cy + Math.sin(spreadA) * spreadR - CARD_H / 2,
        angle: (rng() * 2 - 1) * 22,
        zIndex: 0, depth: 0,
      });
    }
  }

  const zIdx = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [zIdx[i], zIdx[j]] = [zIdx[j], zIdx[i]];
  }
  return items.map((it, i) => ({ ...it, zIndex: zIdx[i], depth: (zIdx[i] - 1) / Math.max(n - 1, 1) }));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function TicketStack({
  entries,
  mode             = "fan",
  seed             = 42,
  validate         = true,
  canvasRatio      = "3:2",
  customW,
  customH,
  orientation      = "landscape",
  bgColor          = "#ffffff",
  bgImage          = null,
  cardScale        = 1,
  fanSpreadDeg     = DEFAULT_FAN_SPREAD_DEG,
  fanAnchor        = DEFAULT_FAN_ANCHOR,
  // Controlled fan pivot: pass both to sync with a parent; omit for internal state.
  fanPivot:        fanPivotProp      = null,
  onFanPivotChange                   = null,
  // Controlled viewport: pass both to sync with a parent; omit for internal state.
  viewport:        viewportProp      = null,
  onViewportChange                   = null,
  // Set false on read-only mirrors so no event listeners are attached.
  interactive      = true,
  radialParams,
  canvasRef,
  outputCanvasRef,
  // Populated (as a plain function, not a React ref-forwarding target) with
  // an async (targetW, targetH) => dataUrl exporter. See the comment above
  // renderExportCanvas for why the export goes through this instead of
  // capturing the live DOM.
  exportApiRef,
}) {
  const outputRef  = useRef(null);
  const canvasElRef = useRef(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  // ── Viewport pan/zoom state ──────────────────────────────────────────────────
  // Controlled when viewportProp is provided; otherwise self-managed.
  const [viewportInternal, setViewportInternal] = useState({ x: 0, y: 0, zoom: 1 });
  const viewport    = viewportProp ?? viewportInternal;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const setViewport = (updater) => {
    const next = typeof updater === "function" ? updater(viewportRef.current) : updater;
    if (onViewportChange) onViewportChange(next);
    else setViewportInternal(next);
  };

  const [dragging, setDragging] = useState(false);
  const dragRef   = useRef(null);
  const touchRef  = useRef(null);

  // ── Fan pivot state ──────────────────────────────────────────────────────────
  // Controlled when fanPivotProp is provided; otherwise self-managed. Fraction
  // (0..1) of the fan's design canvas where every card's anchor point sits.
  const [fanPivotInternal, setFanPivotInternal] = useState(DEFAULT_FAN_PIVOT);
  const fanPivot = fanPivotProp ?? fanPivotInternal;
  const setFanPivot = (next) => {
    if (onFanPivotChange) onFanPivotChange(next);
    else setFanPivotInternal(next);
  };
  const pivotDragRef = useRef(null);
  const [pivotDragging, setPivotDragging] = useState(false);

  // Reset view whenever the composition changes
  useEffect(() => {
    setViewport({ x: 0, y: 0, zoom: 1 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, seed, canvasRatio, orientation, cardScale]);

  // Non-passive wheel listener
  const wheelHandler = useRef(null);
  wheelHandler.current = (e) => {
    e.preventDefault();
    const rect   = outputRef.current.getBoundingClientRect();
    const cx     = e.clientX - rect.left - rect.width  / 2;
    const cy     = e.clientY - rect.top  - rect.height / 2;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setViewport(v => {
      const newZoom = Math.max(0.15, Math.min(10, v.zoom * factor));
      const r = newZoom / v.zoom;
      // viewport.x/y are stored as fractions of the canvas's own pixel size
      // (not raw px) specifically so the read-only mirror preview — which
      // renders the same viewport state at a different absolute size —
      // reproduces the identical proportional view instead of applying the
      // same pixel offset and ending up visibly shifted from the real
      // (interactive) canvas and the actual export.
      const vxPx = v.x * displaySize.w, vyPx = v.y * displaySize.h;
      const newXPx = cx + (vxPx - cx) * r;
      const newYPx = cy + (vyPx - cy) * r;
      return {
        x: displaySize.w > 0 ? newXPx / displaySize.w : v.x,
        y: displaySize.h > 0 ? newYPx / displaySize.h : v.y,
        zoom: newZoom,
      };
    });
  };
  useEffect(() => {
    if (!interactive) return;
    const el = outputRef.current;
    if (!el) return;
    const fn = (e) => wheelHandler.current(e);
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [interactive]);

  // Non-passive touchmove listener
  const touchMoveHandler = useRef(null);
  touchMoveHandler.current = (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragRef.current) {
      const dx = e.touches[0].clientX - dragRef.current.startMX;
      const dy = e.touches[0].clientY - dragRef.current.startMY;
      setViewport(v => ({
        ...v,
        x: displaySize.w > 0 ? (dragRef.current.startVXpx + dx) / displaySize.w : v.x,
        y: displaySize.h > 0 ? (dragRef.current.startVYpx + dy) / displaySize.h : v.y,
      }));
    } else if (e.touches.length === 2 && touchRef.current) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const newDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const { dist, midX, midY, startVXpx, startVYpx, startZoom } = touchRef.current;
      const newZoom = Math.max(0.15, Math.min(10, startZoom * (newDist / dist)));
      const r = newZoom / startZoom;
      const newXPx = midX + (startVXpx - midX) * r;
      const newYPx = midY + (startVYpx - midY) * r;
      setViewport({
        x:    displaySize.w > 0 ? newXPx / displaySize.w : 0,
        y:    displaySize.h > 0 ? newYPx / displaySize.h : 0,
        zoom: newZoom,
      });
    }
  };
  useEffect(() => {
    if (!interactive) return;
    const el = outputRef.current;
    if (!el) return;
    const fn = (e) => touchMoveHandler.current(e);
    el.addEventListener("touchmove", fn, { passive: false });
    return () => el.removeEventListener("touchmove", fn);
  }, [interactive]);

  // Global mouse move/up
  useEffect(() => {
    if (!interactive) return;
    const onMove = (e) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startMX;
      const dy = e.clientY - dragRef.current.startMY;
      setViewport(v => ({
        ...v,
        x: displaySize.w > 0 ? (dragRef.current.startVXpx + dx) / displaySize.w : v.x,
        y: displaySize.h > 0 ? (dragRef.current.startVYpx + dy) / displaySize.h : v.y,
      }));
    };
    const onUp = () => { dragRef.current = null; setDragging(false); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
  }, [interactive]);

  function handleMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { startMX: e.clientX, startMY: e.clientY, startVXpx: viewport.x * displaySize.w, startVYpx: viewport.y * displaySize.h };
    setDragging(true);
  }

  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      dragRef.current = {
        startMX: e.touches[0].clientX, startMY: e.touches[0].clientY,
        startVXpx: viewport.x * displaySize.w, startVYpx: viewport.y * displaySize.h,
      };
      touchRef.current = null;
    } else if (e.touches.length === 2) {
      dragRef.current = null;
      const t1 = e.touches[0], t2 = e.touches[1];
      const rect = outputRef.current.getBoundingClientRect();
      touchRef.current = {
        dist:      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
        midX:      (t1.clientX + t2.clientX) / 2 - rect.left - rect.width  / 2,
        midY:      (t1.clientY + t2.clientY) / 2 - rect.top  - rect.height / 2,
        startVXpx: viewport.x * displaySize.w,
        startVYpx: viewport.y * displaySize.h,
        startZoom: viewport.zoom,
      };
    }
  }

  function handleTouchEnd() {
    dragRef.current  = null;
    touchRef.current = null;
    setDragging(false);
  }

  // ── Layout ───────────────────────────────────────────────────────────────────
  const tickets = entries;
  const n = tickets.length;

  // ── Per-card rasterisation ───────────────────────────────────────────────────
  // A ticket's divider notch is a genuine hole punched through its own PNG
  // (the same technique the collage preview/export already relies on: render
  // each ticket to a canvas, punch a transparent circle where the notch sits,
  // then use that flat image). Baking each card once means the hole is real —
  // whatever sits behind it (canvas background, or a card lower in the stack)
  // shows through — and it can never bleed into a different card, since each
  // capture only ever touches its own isolated ticket node.
  const hiddenNodeRefs = useRef(new Map());
  const capturedKeysRef = useRef(new Set());
  const [cardImages, setCardImages] = useState({});

  useEffect(() => {
    let cancelled = false;
    tickets.forEach((entry, i) => {
      const key = entry.id ?? i;
      if (capturedKeysRef.current.has(key)) return;
      const node = hiddenNodeRefs.current.get(key);
      if (!node) return;
      capturedKeysRef.current.add(key);
      exportNodeToPng(node, { pixelRatio: CARD_BAKE_PIXEL_RATIO })
        .then((dataUrl) => {
          if (cancelled) return;
          setCardImages((prev) => ({ ...prev, [key]: dataUrl }));
        })
        .catch((err) => {
          console.error("Failed to rasterise stack card", err);
          capturedKeysRef.current.delete(key);
        });
    });
  }, [tickets]);

  const { rawLayout, designW, designH } = useMemo(() => {
    if (mode === "fan") {
      return { rawLayout: fanLayout(n, seed, validate, fanSpreadDeg, fanPivot, fanAnchor), designW: FAN_W, designH: FAN_H };
    }
    if (mode === "radial") {
      return { rawLayout: radialLayout(n, seed, validate, radialParams), designW: RADIAL_W, designH: RADIAL_H };
    }
    if (mode === "scatter") {
      return { rawLayout: scatterLayout(n, seed), designW: RADIAL_W, designH: RADIAL_H };
    }
    const { items, canvasW, canvasH } = cascadeLayout(n, seed, validate);
    return { rawLayout: items, designW: canvasW, designH: canvasH };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, n, seed, validate, radialParams, fanSpreadDeg, fanPivot, fanAnchor]);

  const { w: exportW, h: exportH } = useMemo(
    () => getExportDims(canvasRatio, customW, customH, orientation),
    [canvasRatio, customW, customH, orientation]
  );

  const layout = useMemo(() => {
    if (n === 0) return rawLayout;
    // While the user is actively dragging the fan pivot, skip the visibility
    // "repair" step: it can scale/translate the *entire* composition to keep
    // every card sufficiently on-frame, which would otherwise make the whole
    // layout appear to jump around mid-drag instead of just the pivot moving.
    // Show the raw geometry live, and let repair reconcile once on release.
    if (mode === "fan" && pivotDragging) return rawLayout;
    const minPerCard = validate ? 0.70 : 0.10;
    const minOverall = validate ? 0.80 : 0.30;
    return repairLayout(rawLayout, CARD_W, CARD_H, designW, designH, exportW, exportH, { minPerCard, minOverall });
  }, [rawLayout, validate, designW, designH, exportW, exportH, n, mode, pivotDragging]);

  // ── Manual canvas export ─────────────────────────────────────────────────────
  // The obvious way to export the stack is to hand .ts-output-canvas to
  // html-to-image, same as every other export in this app. That works on
  // desktop, but on mobile (consistently across engines, not one browser's
  // quirk) it comes back blank: html-to-image serialises the whole canvas —
  // background plus every already-baked per-card <img> — into one big SVG
  // data URI and rasterises THAT via an <img>, and a stack with several
  // cards pushes that combined payload well past what mobile browsers will
  // reliably decode; past that point they fail silently (no error, no
  // exception — the image element just "loads" empty) rather than throwing.
  //
  // Since every card is already a flat, correctly-notched/textured PNG
  // (cardImages, baked per-card via the same reliable single-ticket export
  // path), the whole stack can be composited with plain Canvas2D drawImage
  // calls instead — the same technique collage.js already uses, with none
  // of html-to-image's SVG-rasterisation ceiling. Drawing cards in ascending
  // z-order also makes inter-card notch occlusion automatic: a lower card's
  // punched-out hole reveals whatever was already drawn (background or a
  // still-lower card), and gets correctly painted over once a higher,
  // overlapping card is drawn on top of it — no separate polygon math needed.
  useEffect(() => {
    if (!exportApiRef) return;
    exportApiRef.current = async (targetW, targetH) => {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");

      if (bgImage) {
        const img = await loadImageEl(bgImage);
        const s = Math.max(targetW / img.width, targetH / img.height);
        const dw = img.width * s, dh = img.height * s;
        ctx.drawImage(img, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, targetW, targetH);
      }

      // Design canvas -> output canvas contain-fit, recomputed at the full
      // export resolution (mirrors fitScale/ox/oy below, which are sized
      // for the on-screen display instead).
      const fit  = Math.min(targetW / designW, targetH / designH);
      const fitOx = (targetW - designW * fit) / 2;
      const fitOy = (targetH - designH * fit) / 2;

      // Viewport pan/zoom, replicated: .ts-viewport's transform-origin is
      // the centre of the full output box, and viewport.x/y are fractions
      // of that box's own size (see the pan handlers above), so they scale
      // correctly here even though targetW/targetH differ from the on-screen
      // displaySize they were captured relative to.
      const cx = targetW / 2, cy = targetH / 2;
      const vx = viewport.x * targetW, vy = viewport.y * targetH;
      const vz = viewport.zoom;

      const localPivot = mode === "fan"
        ? (FAN_ANCHOR_GEOMETRY[fanAnchor] ?? FAN_ANCHOR_GEOMETRY.bottom).pivot
        : FAN_ANCHOR_GEOMETRY.bottom.pivot;

      const items = tickets
        .map((entry, i) => ({ entry, i, ...layout[i] }))
        .sort((a, b) => a.zIndex - b.zIndex);

      for (const { entry, i, left, top, angle, depth } of items) {
        const key = entry.id ?? i;
        const src = cardImages[key];
        if (!src) continue;
        const img = await loadImageEl(src);

        const pivotDesignX = left + localPivot[0];
        const pivotDesignY = top + localPivot[1];
        const fitX = fitOx + pivotDesignX * fit;
        const fitY = fitOy + pivotDesignY * fit;
        const outX = cx + (fitX - cx) * vz + vx;
        const outY = cy + (fitY - cy) * vz + vy;
        const scale = fit * vz * cardScale;

        ctx.save();
        ctx.translate(outX, outY);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.shadowColor = `rgba(0, 0, 0, ${(0.12 + depth * 0.23).toFixed(2)})`;
        ctx.shadowBlur = (6 + depth * 22) * scale;
        ctx.shadowOffsetX = (3 + depth * 7) * scale;
        ctx.shadowOffsetY = (4 + depth * 11) * scale;
        ctx.drawImage(img, -localPivot[0] * scale, -localPivot[1] * scale, CARD_W * scale, CARD_H * scale);
        ctx.restore();
      }

      return canvas.toDataURL("image/png");
    };
  });

  // ── Responsive fit ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) =>
      setDisplaySize({ w: e.contentRect.width, h: e.contentRect.height })
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const fitScale = displaySize.w > 0
    ? Math.min(displaySize.w / designW, displaySize.h / designH)
    : 0;
  const ox = (displaySize.w - designW * fitScale) / 2;
  const oy = (displaySize.h - designH * fitScale) / 2;

  // Drag-to-move handle for the fan's rotation pivot. Screen-pixel movement
  // has to be converted back to a fraction of the design canvas, undoing both
  // the contain-fit scale (fitScale) and the user's own pan/zoom (viewport.zoom)
  // that sit between the handle's DOM position and the screen.
  function handlePivotPointerDown(e) {
    e.stopPropagation();
    e.preventDefault();
    // Grabbing pointer capture on the handle itself guarantees this same
    // element keeps receiving the drag's move/up events regardless of how
    // fast the cursor moves relative to its (small, on-screen-constant-size)
    // hit area, so it can never "slip off" mid-drag onto the canvas beneath
    // and accidentally start a viewport pan instead.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPivotDragging(true);
    const startX = e.clientX, startY = e.clientY;
    const startPivot = fanPivot;
    pivotDragRef.current = { startX, startY, startPivot };

    function onMove(ev) {
      if (!pivotDragRef.current) return;
      const totalScale = fitScale * viewportRef.current.zoom;
      if (totalScale <= 0) return;
      const dxFrac = (ev.clientX - pivotDragRef.current.startX) / totalScale / designW;
      const dyFrac = (ev.clientY - pivotDragRef.current.startY) / totalScale / designH;
      setFanPivot({
        x: Math.min(1, Math.max(0, pivotDragRef.current.startPivot.x + dxFrac)),
        y: Math.min(1, Math.max(0, pivotDragRef.current.startPivot.y + dyFrac)),
      });
    }
    function onUp() {
      pivotDragRef.current = null;
      setPivotDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Double-clicking anywhere on a fanned-out ticket (or the canvas around it)
  // jumps the pivot straight to that spot — a quicker alternative to dragging
  // the handle for a big reposition. getBoundingClientRect() already reflects
  // fitScale and the user's pan/zoom, so the fraction along the canvas box is
  // the design-canvas fraction directly, no extra unscaling needed. This
  // replaces the default "double-click resets pan/zoom" behaviour used by
  // the other layout modes, since fan mode gives double-click this new job.
  function handleFanPivotDoubleClick(e) {
    const canvasEl = canvasElRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setFanPivot({
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    });
  }

  if (n === 0) return null;

  return (
    <>
    <div
      ref={(el) => { outputRef.current = el; if (outputCanvasRef) outputCanvasRef.current = el; }}
      className="ts-output-canvas"
      style={{
        aspectRatio: `${exportW} / ${exportH}`,
        backgroundColor: bgColor,
        backgroundImage: bgImage ? `url(${bgImage})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {fitScale > 0 && (
        /* Viewport layer: handles user pan/zoom on top of the contain-fit */
        <div
          className={`ts-viewport${interactive && dragging ? " ts-viewport--dragging" : ""}`}
          style={{
            transform: `translate(${viewport.x * displaySize.w}px, ${viewport.y * displaySize.h}px) scale(${viewport.zoom})`,
            transformOrigin: "center center",
            cursor: interactive ? undefined : "default",
          }}
          onMouseDown={interactive ? handleMouseDown : undefined}
          onTouchStart={interactive ? handleTouchStart : undefined}
          onTouchEnd={interactive ? handleTouchEnd : undefined}
          onDoubleClick={interactive ? (mode === "fan" ? handleFanPivotDoubleClick : () => setViewport({ x: 0, y: 0, zoom: 1 })) : undefined}
        >
          <div
            ref={(el) => { canvasElRef.current = el; if (canvasRef) canvasRef.current = el; }}
            className="ts-canvas"
            style={{
              width: designW,
              height: designH,
              transform: `translate(${ox}px, ${oy}px) scale(${fitScale})`,
            }}
          >
            {tickets.map((entry, i) => {
              const { left, top, angle, zIndex, depth } = layout[i];
              const key = entry.id ?? i;
              const Template = getTemplateComponent(entry.ticket.template);
              const cardImage = cardImages[key];
              const itemTransformOrigin = mode === "fan"
                ? (FAN_ANCHOR_GEOMETRY[fanAnchor] ?? FAN_ANCHOR_GEOMETRY.bottom).origin
                : "bottom center";
              return (
                <div
                  key={key}
                  className="ts-item"
                  style={{ left, top, width: CARD_W, height: CARD_H, zIndex, transform: `rotate(${angle}deg)`, transformOrigin: itemTransformOrigin }}
                >
                  <div style={{
                    position: "absolute", inset: 0,
                    transform: `scale(${cardScale})`,
                    transformOrigin: "center center",
                    // drop-shadow (unlike box-shadow) is cast from the actual
                    // alpha shape of the rendered content, so it correctly
                    // follows the card's real silhouette — including curving
                    // into the notch's punched-out holes — instead of tracing
                    // a plain rectangle that ignores them. It must live on an
                    // element with no overflow:hidden of its own, since that
                    // would clip the shadow's bleed the same way it clips
                    // content; the inner div below carries overflow:hidden
                    // for the ticket content instead.
                    filter: `drop-shadow(${shadow(depth)})`,
                  }}>
                    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                      {cardImage ? (
                        <img
                          src={cardImage}
                          alt=""
                          draggable={false}
                          style={{ width: "100%", height: "100%", display: "block" }}
                        />
                      ) : (
                        <Template ticket={entry.ticket} editable={false} printMode onDecorationChange={() => {}} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {mode === "fan" && interactive && (
              <div
                className="ts-fan-pivot no-export"
                title="拖拽微调，或在票面双击直接跳转旋转中心"
                onPointerDown={handlePivotPointerDown}
                onTouchStart={(e) => e.stopPropagation()}
                style={{
                  left: fanPivot.x * designW,
                  top: fanPivot.y * designH,
                  zIndex: n + 1,
                  // .ts-canvas is shrunk by fitScale (and further by the user's
                  // own zoom) to fit the preview, which would otherwise shrink
                  // this handle down to a near-unclickable speck at low zoom.
                  // Counter-scale it so it always renders — and stays
                  // grabbable — at a constant on-screen size.
                  transform: `scale(${1 / (fitScale * viewport.zoom || 1)})`,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>

    {/* Off-screen render used only to rasterise each ticket (see the capture
        effect above) — laid out so getBoundingClientRect works, but clipped
        to nothing and never visible. Kept as a sibling of .ts-output-canvas,
        not a descendant: html-to-image serialises captured nodes into an SVG
        foreignObject, which has no real page viewport for `position: fixed`
        to escape to — inside that context "fixed" resolves against the
        captured node's own box instead, so nesting this inside
        .ts-output-canvas made the hidden tickets bleed into the exported
        stack image. */}
    <div style={{ position: "fixed", top: 0, left: 0, width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}>
      {tickets.map((entry, i) => {
        const key = entry.id ?? i;
        const Template = getTemplateComponent(entry.ticket.template);
        return (
          <Template
            key={key}
            ticket={entry.ticket}
            editable={false}
            printMode
            onDecorationChange={() => {}}
            forwardedRef={(node) => {
              if (node) hiddenNodeRefs.current.set(key, node);
              else hiddenNodeRefs.current.delete(key);
            }}
          />
        );
      })}
    </div>
    </>
  );
}
