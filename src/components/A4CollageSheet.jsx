import TicketBleedFrame from "./TicketBleedFrame";
import { A4_WIDTH_MM, A4_HEIGHT_MM } from "../utils/dimensions";
import "./A4Sheet.css";

export const A4_COLLAGE_MAX_PER_PAGE = 3;
const FRAME_GAP_MM = 6;

// One A4 page holding up to A4_COLLAGE_MAX_PER_PAGE tickets stacked top to
// bottom, each with its own bleed and crop marks — the same per-ticket
// imposition as the single-ticket A4Sheet, just repeated down the page.
export default function A4CollageSheet({ tickets, forwardedRef }) {
  return (
    <div className="a4-sheet-offscreen">
      <div
        ref={forwardedRef}
        className="a4-sheet"
        style={{
          width: `${A4_WIDTH_MM}mm`,
          height: `${A4_HEIGHT_MM}mm`,
          gap: `${FRAME_GAP_MM}mm`,
        }}
      >
        {tickets.map((ticket, i) => (
          <TicketBleedFrame key={i} ticket={ticket} />
        ))}
      </div>
    </div>
  );
}
