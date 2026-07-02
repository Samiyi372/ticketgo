import { formatShowDateTime } from "../../utils/formatDate";
import { isLatinOnly } from "../../utils/language";
import { TICKET_WIDTH_MM, TICKET_HEIGHT_MM } from "../../utils/dimensions";
import { getCurrencySymbol } from "../../utils/currency";
import { getTextureSrc } from "../../utils/textures";
import { resolveDecoration, applyDecorationPositionChange } from "../../utils/decorationPosition";
import DecorationLayer from "../DecorationLayer";
import BgDragLayer from "../BgDragLayer";
import { buildGradient, buildMeshGradient } from "../../utils/gradientFromImage";
import "./ClassicTemplate.css";

export default function ClassicTemplate({ ticket, onDecorationChange, onBgPositionChange, editable, forwardedRef, mirrored = false, showInfoFirst = false, printMode = false }) {
  const { theatre, show, date, time, seat, price, rating, review, decoration, colors, showDivider, dividerColor, dividerNotches, mainLines, mainLineMode, mainLineColor, texture, template } = ticket;
  const reviewFont = isLatinOnly(review) ? "review-en" : "review-cjk";
  const hasPrice = price.amount !== "" && price.amount != null;
  const textureSrc = getTextureSrc(texture);
  const dividerRgba = dividerColor === "white" ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.25)";
  const stubImageGradient =
    colors.subBgGradientType === "mesh" && colors.subBgMeshPositions
      ? buildMeshGradient(colors.subBgImageColors, colors.subBgMeshPositions)
      : buildGradient(colors.subBgImageColors, 180);
  const mainImageGradient =
    colors.mainBgGradientType === "mesh" && colors.mainBgMeshPositions
      ? buildMeshGradient(colors.mainBgImageColors, colors.mainBgMeshPositions)
      : buildGradient(colors.mainBgImageColors, 180);
  const lineFill = mainLineMode === "solid" && mainLineColor
    ? mainLineColor
    : (colors.subBgImage
        ? buildGradient(colors.subBgImageColors, 90) || colors.subBg
        : colors.subBg);

  const theatreBlock = (
    <div className="main-top">
      <p className="theatre-name">{theatre.name}</p>
      <p className="theatre-address">
        {theatre.address}{theatre.postcode ? `, ${theatre.postcode}` : ""}
      </p>
    </div>
  );

  const showBlock = (
    <div className="main-middle">
      <p className="show-title">{show.title}</p>
      <p className="show-date">{formatShowDateTime(date, time)}</p>
    </div>
  );

  return (
    <div
      ref={forwardedRef}
      className={mirrored ? "ticket-classic mirrored" : "ticket-classic"}
      style={{
        width: `${TICKET_WIDTH_MM}mm`,
        height: `${TICKET_HEIGHT_MM}mm`,
        boxShadow: printMode ? "none" : undefined,
      }}
    >
      <div
        className="ticket-stub"
        style={{
          ...(colors.subBgUseGradient && stubImageGradient
            ? { background: stubImageGradient }
            : {
                backgroundColor: colors.subBg,
                backgroundImage: colors.subBgImage ? `url(${colors.subBgImage})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: colors.subBgImage
                  ? `${(colors.subBgImagePosition ?? { x: 50, y: 50 }).x}% ${(colors.subBgImagePosition ?? { x: 50, y: 50 }).y}%`
                  : "center",
              }),
          "--stub-text": colors.subTextColor,
        }}
      >
        {textureSrc ? (
          <div className="paper-texture" style={{ backgroundImage: `url(${textureSrc})` }} />
        ) : (
          <div className="paper-noise" />
        )}
        {editable && !colors.subBgUseGradient && colors.subBgImage && (
          <BgDragLayer
            position={colors.subBgImagePosition ?? { x: 50, y: 50 }}
            onChange={(pos) => onBgPositionChange?.("subBgImagePosition", pos)}
          />
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

      <div
        className="ticket-main"
        style={{
          "--main-text": colors.mainTextColor,
          ...(colors.mainBgUseGradient && mainImageGradient
            ? { background: mainImageGradient }
            : { backgroundColor: colors.mainBg }),
        }}
      >
        {!colors.mainBgUseGradient && colors.mainBgImage && (
          <img
            className="main-bg-image"
            src={colors.mainBgImage}
            alt=""
            style={{
              opacity: colors.mainBgImageOpacity,
              mixBlendMode: colors.mainBgImageGrayscale ? "multiply" : "normal",
              objectPosition: `${(colors.mainBgImagePosition ?? { x: 50, y: 50 }).x}% ${(colors.mainBgImagePosition ?? { x: 50, y: 50 }).y}%`,
            }}
          />
        )}
        {editable && !colors.mainBgUseGradient && colors.mainBgImage && (
          <BgDragLayer
            position={colors.mainBgImagePosition ?? { x: 50, y: 50 }}
            onChange={(pos) => onBgPositionChange?.("mainBgImagePosition", pos)}
          />
        )}
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
        <div className="main-content">
          {showInfoFirst ? (
            <>
              {showBlock}
              {theatreBlock}
            </>
          ) : (
            <>
              {theatreBlock}
              {showBlock}
            </>
          )}

          <div className="main-bottom">
            <div className="seat-row">
              <div className="seat-col">
                <span className="seat-label">Level</span>
                <span className="seat-value">{seat.level}</span>
              </div>
              <div className="seat-col">
                <span className="seat-label">Row</span>
                <span className="seat-value">{seat.row}</span>
              </div>
              <div className="seat-col">
                <span className="seat-label">Seat</span>
                <span className="seat-value">{seat.seat}</span>
              </div>
            </div>
            {hasPrice && (
              <p className="ticket-price">
                <span className="price-symbol">{getCurrencySymbol(price.currency)}</span>{price.amount}
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

      {showDivider && <div className="ticket-divider" style={{ borderLeftColor: dividerRgba }} />}
      {dividerNotches && (
        <>
          <div className="divider-notch divider-notch-top" />
          <div className="divider-notch divider-notch-bottom" />
        </>
      )}
    </div>
  );
}
