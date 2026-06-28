import { useRef } from "react";
import "./DecorationLayer.css";

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const BASE_SIZE_PX = 80;

// Drag-to-move, drag-the-handle-to-resize overlay for the user's uploaded
// decoration image. Position/scale are stored as plain numbers on the ticket
// state (x/y in % of the container, scale as a multiplier of BASE_SIZE_PX) so
// they survive into the exported PNG unchanged.
//
// On the image itself, one finger moves it and two fingers pinch-resize it —
// the corner handle (mouse-drag only) stays as the precise way to resize
// without a touchscreen. Both gestures are driven by Pointer Events, which
// report each touch as its own pointerId, so active pointers are tracked in a
// ref and the gesture (drag vs pinch) is re-derived whenever that count changes.
export default function DecorationLayer({ decoration, onChange, editable }) {
  const containerRef = useRef(null);
  const pointers = useRef(new Map());
  const drag = useRef(null);
  const pinch = useRef(null);

  if (!decoration.image) return null;

  function activePoints() {
    return Array.from(pointers.current.values());
  }

  function beginDrag(point) {
    const container = containerRef.current.parentElement;
    drag.current = {
      rect: container.getBoundingClientRect(),
      startX: point.x,
      startY: point.y,
      startPosX: decoration.x,
      startPosY: decoration.y,
    };
  }

  function beginPinch() {
    const [a, b] = activePoints();
    pinch.current = {
      startDist: Math.hypot(a.x - b.x, a.y - b.y),
      startScale: decoration.scale,
    };
  }

  function handlePointerDown(e) {
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      drag.current = null;
      beginDrag({ x: e.clientX, y: e.clientY });
    } else if (pointers.current.size === 2) {
      drag.current = null;
      beginPinch();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  function handlePointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = activePoints();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = dist / pinch.current.startDist;
      onChange({
        ...decoration,
        scale: clamp(pinch.current.startScale * ratio, MIN_SCALE, MAX_SCALE),
      });
    } else if (pointers.current.size === 1 && drag.current) {
      const dxPct = ((e.clientX - drag.current.startX) / drag.current.rect.width) * 100;
      const dyPct = ((e.clientY - drag.current.startY) / drag.current.rect.height) * 100;
      onChange({
        ...decoration,
        x: clamp(drag.current.startPosX + dxPct, 0, 100),
        y: clamp(drag.current.startPosY + dyPct, 0, 100),
      });
    }
  }

  function handlePointerUp(e) {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    drag.current = null;

    if (pointers.current.size === 1) {
      // One finger lifted out of a pinch — resume moving with the other.
      beginDrag(activePoints()[0]);
    } else if (pointers.current.size === 0) {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    }
  }

  function startResize(e) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startScale = decoration.scale;
    // The preview may be visually scaled down by a CSS transform (zoom-to-fit),
    // so convert real screen-px drag distance back to the ticket's native px.
    const zoom = containerRef.current.offsetWidth
      ? containerRef.current.getBoundingClientRect().width / containerRef.current.offsetWidth
      : 1;

    function onMove(ev) {
      const delta = (ev.clientX - startX) / zoom / BASE_SIZE_PX;
      onChange({
        ...decoration,
        scale: clamp(startScale + delta, MIN_SCALE, MAX_SCALE),
      });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const size = BASE_SIZE_PX * decoration.scale;

  return (
    <div
      ref={containerRef}
      className="decoration-wrapper"
      style={{
        left: `${decoration.x}%`,
        top: `${decoration.y}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
      }}
    >
      <img
        src={decoration.image}
        alt=""
        className={editable ? "decoration-img editable" : "decoration-img"}
        draggable={false}
        onPointerDown={handlePointerDown}
        style={{
          opacity: decoration.opacity,
          mixBlendMode: decoration.grayscale ? "multiply" : undefined,
        }}
      />
      {editable && (
        <span
          className="decoration-handle no-export"
          onPointerDown={startResize}
        />
      )}
    </div>
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
