import { formatShowDateTime } from "../../utils/formatDate";
import { isLatinOnly } from "../../utils/language";
import { TICKET_WIDTH_MM, TICKET_HEIGHT_MM } from "../../utils/dimensions";
import { getCurrencySymbol } from "../../utils/currency";
import { getTextureSrc } from "../../utils/textures";
import { resolveDecoration, applyDecorationPositionChange } from "../../utils/decorationPosition";
import DecorationLayer from "../DecorationLayer";
import { buildGradient } from "../../utils/gradientFromImage";
import "./ModernTemplate.css";

export default function ModernTemplate({ ticket, onDecorationChange, editable, forwardedRef, printMode = false }) {
  const { theatre, show, date, time, seat, price, rating, review, decoration, colors, showDivider, dividerColor, dividerNotches, mainLines, texture, template } = ticket;
  const reviewFont = isLatinOnly(review) ? "review-en" : "review-cjk";
  const hasPrice = price.amount !== "" && price.amount != null;
  const textureSrc = getTextureSrc(texture);
  const dividerRgba = dividerColor === "white" ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.3)";
  const stubImageGradient = buildGradient(colors.subBgImageColors, 180);
  const lineFill = colors.subBgImage
    ? buildGradient(colors.subBgImageColors, 90) || colors.subBg
    : colors.subBg;

  return (
    <div
      ref={forwardedRef}
      className="ticket-modern"
      style={{
        width: `${TICKET_WIDTH_MM}mm`,
        height: `${TICKET_HEIGHT_MM}mm`,
        boxShadow: printMode ? "none" : undefined,
      }}
    >
      <div
        className="modern-stub"
        style={{
          ...(colors.subBgUseGradient && stubImageGradient
            ? { background: stubImageGradient }
            : {
                backgroundColor: colors.subBg,
                backgroundImage: colors.subBgImage ? `url(${colors.subBgImage})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }),
          "--stub-text": colors.subTextColor,
        }}
      >
        {textureSrc ? (
          <div className="paper-texture" style={{ backgroundImage: `url(${textureSrc})` }} />
        ) : (
          <div className="paper-noise" />
        )}
        <div className="stub-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={n <= rating ? "stub-star filled" : "stub-star"}>
              ★
            </span>
          ))}
        </div>
        <div className="stub-bottom">
          <p className={`stub-review ${reviewFont}`}>{review}</p>
        </div>
      </div>

      <div className="modern-main" style={{ backgroundColor: colors.mainBg }}>
        {textureSrc ? (
          <div className="paper-texture" style={{ backgroundImage: `url(${textureSrc})` }} />
        ) : (
          <div className="paper-noise" />
        )}
        {mainLines && (
          <>
            <div className="main-line main-line-top" style={{ background: lineFill }} />
            <div className="main-line main-line-bottom" style={{ background: lineFill }} />
          </>
        )}
        <div className="modern-content">
          <div className="modern-top">
            <p className="modern-theatre-name">{theatre.name}</p>
            <p className="modern-theatre-address">
              {theatre.address}{theatre.postcode ? `, ${theatre.postcode}` : ""}
            </p>
          </div>

          <div className="modern-middle">
            <p className="modern-show-title">{show.title}</p>
            <p className="modern-show-date">{formatShowDateTime(date, time)}</p>
          </div>

          <div className="modern-bottom">
            <div className="modern-seat-row">
              <div className="modern-seat-col">
                <span className="modern-seat-label">Level</span>
                <span className="modern-seat-value">{seat.level}</span>
              </div>
              <div className="modern-seat-col">
                <span className="modern-seat-label">Row</span>
                <span className="modern-seat-value">{seat.row}</span>
              </div>
              <div className="modern-seat-col">
                <span className="modern-seat-label">Seat</span>
                <span className="modern-seat-value">{seat.seat}</span>
              </div>
            </div>
            {hasPrice && (
              <p className="modern-price">
                {getCurrencySymbol(price.currency)}{price.amount}
              </p>
            )}
          </div>
        </div>
      </div>

      <DecorationLayer
        decoration={resolveDecoration(decoration, template)}
        onChange={(next) => onDecorationChange(applyDecorationPositionChange(decoration, template, next))}
        editable={editable}
      />

      {showDivider && <div className="modern-divider" style={{ borderLeftColor: dividerRgba }} />}
      {dividerNotches && (
        <>
          <div className="divider-notch divider-notch-top" />
          <div className="divider-notch divider-notch-bottom" />
        </>
      )}
    </div>
  );
}
