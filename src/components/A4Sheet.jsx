import TicketBleedFrame from "./TicketBleedFrame";
import { A4_WIDTH_MM, A4_HEIGHT_MM } from "../utils/dimensions";
import "./A4Sheet.css";

// Always-mounted, off-screen A4 page laid out in real CSS millimetres, holding
// the current ticket with dashed cut marks around it — kept permanently
// rendered (rather than only at export time) so its QR code and any async
// image effects are already settled by the time the user exports. Only one
// copy is placed since this app only ever edits a single ticket at a time;
// once multiple saved tickets exist, this can grow to fill up to two per page.
export default function A4Sheet({ ticket, forwardedRef }) {
  return (
    <div className="a4-sheet-offscreen">
      <div
        ref={forwardedRef}
        className="a4-sheet"
        style={{
          width: `${A4_WIDTH_MM}mm`,
          height: `${A4_HEIGHT_MM}mm`,
        }}
      >
        <TicketBleedFrame ticket={ticket} />
      </div>
    </div>
  );
}
