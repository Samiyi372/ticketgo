import { useEffect, useRef, useState } from "react";
import { getTemplateComponent } from "./templates";
import "./TicketPreview.css";

// Renders the ticket at its true physical size (in mm, via ClassicTemplate)
// and scales it down visually with a CSS transform so it fits the available
// preview width. The underlying DOM node keeps its real mm dimensions, so
// `ticketRef` can be handed straight to the PNG exporter unchanged.
export default function TicketPreview({ ticket, onDecorationChange, onBgPositionChange, ticketRef }) {
  const Template = getTemplateComponent(ticket.template);
  const wrapperRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function recalc() {
      if (!wrapperRef.current || !innerRef.current) return;
      const containerWidth = wrapperRef.current.clientWidth;
      const naturalWidth = innerRef.current.scrollWidth;
      const naturalHeight = innerRef.current.scrollHeight;
      setNaturalSize({ width: naturalWidth, height: naturalHeight });
      setScale(naturalWidth ? Math.min(1, containerWidth / naturalWidth) : 1);
    }
    recalc();
    const ro = new ResizeObserver(recalc);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="ticket-preview-wrapper" ref={wrapperRef}>
      <div
        className="ticket-preview-scaled"
        style={{
          width: naturalSize.width * scale,
          height: naturalSize.height * scale,
        }}
      >
        <div
          ref={innerRef}
          style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          <Template
            ticket={ticket}
            onDecorationChange={onDecorationChange}
            onBgPositionChange={onBgPositionChange}
            editable
            forwardedRef={ticketRef}
          />
        </div>
      </div>
    </div>
  );
}
