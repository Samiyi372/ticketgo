import { getTemplateComponent } from "./templates";
import { TICKET_WIDTH_MM, TICKET_HEIGHT_MM, BLEED_MM } from "../utils/dimensions";
import { getTextureSrc } from "../utils/textures";
import { buildGradient } from "../utils/gradientFromImage";
import "./A4Sheet.css";

export const FRAME_WIDTH_MM = TICKET_WIDTH_MM + BLEED_MM * 2;
export const FRAME_HEIGHT_MM = TICKET_HEIGHT_MM + BLEED_MM * 2;
const STUB_WIDTH_MM = TICKET_WIDTH_MM * 0.2;

// A single ticket laid out with its print bleed and crop marks, shared by the
// single-ticket A4Sheet and the multi-ticket A4CollageSheet so both impositions
// stay pixel-for-pixel consistent.
export default function TicketBleedFrame({ ticket }) {
  const Template = getTemplateComponent(ticket.template);

  // The crop mark sits exactly at the ticket's true trim edges; the bleed
  // background behind it extends BLEED_MM further out on every side so a
  // slightly imprecise cut never exposes white paper. Since the stub and main
  // sections have different background colors, the bleed fill has to follow
  // the same left/right split as the ticket itself (a horizontal gradient
  // does this for the top/bottom/side bleed all at once).
  const mirrored = ticket.template === "classic-mirrored";
  const seamMm = mirrored ? TICKET_WIDTH_MM - STUB_WIDTH_MM : STUB_WIDTH_MM;
  const firstColor = mirrored ? ticket.colors.mainBg : ticket.colors.subBg;
  const secondColor = mirrored ? ticket.colors.subBg : ticket.colors.mainBg;
  const seamPosMm = BLEED_MM + seamMm;
  const seamPos = `${seamPosMm}mm`;
  const bleedBackground = `linear-gradient(to right, ${firstColor} 0, ${firstColor} ${seamPos}, ${secondColor} ${seamPos}, ${secondColor} 100%)`;
  const textureSrc = getTextureSrc(ticket.texture);

  // The stub's optional custom background image also needs to bleed past the
  // trim edge like its color does, so it's drawn as its own layer sized to
  // exactly the stub's portion of the bleed frame (left side normally, right
  // side when mirrored) rather than relying on the CSS gradient above, which
  // can only carry flat colors.
  const stubBleedLeftMm = mirrored ? seamPosMm : 0;
  const stubBleedWidthMm = mirrored ? FRAME_WIDTH_MM - seamPosMm : seamPosMm;
  const stubImageGradient = buildGradient(ticket.colors.subBgImageColors, 180);

  return (
    <div
      className="bleed-frame"
      style={{
        width: `${FRAME_WIDTH_MM}mm`,
        height: `${FRAME_HEIGHT_MM}mm`,
        padding: `${BLEED_MM}mm`,
        background: bleedBackground,
      }}
    >
      {ticket.colors.subBgUseGradient && stubImageGradient ? (
        <div
          className="bleed-stub-image"
          style={{
            left: `${stubBleedLeftMm}mm`,
            width: `${stubBleedWidthMm}mm`,
            background: stubImageGradient,
          }}
        />
      ) : (
        ticket.colors.subBgImage && (
          <div
            className="bleed-stub-image"
            style={{
              left: `${stubBleedLeftMm}mm`,
              width: `${stubBleedWidthMm}mm`,
              backgroundImage: `url(${ticket.colors.subBgImage})`,
            }}
          />
        )
      )}
      {textureSrc ? (
        <div className="bleed-texture" style={{ backgroundImage: `url(${textureSrc})` }} />
      ) : (
        <div className="bleed-noise" />
      )}
      <Template ticket={ticket} editable={false} printMode />
      <div className="crop-marks" style={{ inset: `${BLEED_MM}mm` }} />
    </div>
  );
}
