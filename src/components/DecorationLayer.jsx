import { useRef } from "react";
import "./DecorationLayer.css";

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const BASE_SIZE_PX = 80;

// Drag-to-move, drag-the-handle-to-resize overlay for the user's uploaded
// decoration image. Position/scale are stored as plain numbers on the ticket
// state (x/y in % of the container, scale as a multiplier of BASE_SIZE_PX) so
// they survive into the exported PNG unchanged.
export default function DecorationLayer({ decoration, onChange, editable }) {
  const containerRef = useRef(null);

  if (!decoration.image) return null;

  function startDrag(e) {
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current.parentElement;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = decoration.x;
    const startPosY = decoration.y;

    function onMove(ev) {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;
      onChange({
        ...decoration,
        x: clamp(startPosX + dxPct, 0, 100),
        y: clamp(startPosY + dyPct, 0, 100),
      });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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
        onPointerDown={startDrag}
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
