import { useRef } from "react";
import "./BgDragLayer.css";

export default function BgDragLayer({ position, onChange }) {
  const ref = useRef(null);
  const drag = useRef(null);

  function onPointerDown(e) {
    e.stopPropagation();
    e.preventDefault();
    const container = ref.current.parentElement;
    drag.current = {
      rect: container.getBoundingClientRect(),
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!drag.current || e.pointerId !== drag.current.pointerId) return;
    const { rect, startX, startY, startPosX, startPosY } = drag.current;
    const dxPct = ((e.clientX - startX) / rect.width) * 100;
    const dyPct = ((e.clientY - startY) / rect.height) * 100;
    onChange({
      x: clamp(startPosX - dxPct, 0, 100),
      y: clamp(startPosY - dyPct, 0, 100),
    });
  }

  function onPointerUp(e) {
    if (drag.current && e.pointerId === drag.current.pointerId) {
      drag.current = null;
    }
  }

  return (
    <div
      ref={ref}
      className="bg-drag-layer no-export"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
