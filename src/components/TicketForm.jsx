import { useState } from "react";
import { convertToHalftone } from "../utils/halftone";
import { convertToGrayscale } from "../utils/grayscale";
import { tintImageDataUrl } from "../utils/tintImage";
import { CURRENCIES } from "../utils/currency";
import { extractPalette } from "../utils/colorPalette";
import { extractGradientColors, randomMeshPositions } from "../utils/gradientFromImage";
import { resizeImageDataUrl } from "../utils/resizeImage";
import { TEXTURES } from "../utils/textures";
import { TEMPLATES } from "./templates";
import "./TicketForm.css";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toTitleCase(str) {
  return str.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export default function TicketForm({ ticket, onChange }) {
  const [palette, setPalette] = useState([]);
  const [uploadError, setUploadError] = useState(null);

  function set(path, value) {
    onChange((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let target = next;
      for (let i = 0; i < keys.length - 1; i++) target = target[keys[i]];
      target[keys[keys.length - 1]] = value;
      return next;
    });
  }

  // The colors are always extracted from the uploaded image (not only when
  // the user opts into showing a gradient on the stub itself) because the
  // main ticket's top/bottom accent lines fall back to a gradient built from
  // these same colors whenever the stub uses an image background, so they
  // must be available either way.
  async function handleSubBgImageUpload(file) {
    if (!file) return;
    setUploadError(null);
    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const dataUrl = await resizeImageDataUrl(rawDataUrl);
      const colors = await extractGradientColors(dataUrl);
      onChange((prev) => {
        const next = structuredClone(prev);
        next.colors.subBgImage = dataUrl;
        next.colors.subBgImageColors = colors;
        next.colors.subBgImagePosition = { x: 50, y: 50 };
        return next;
      });
    } catch (err) {
      console.error(err);
      setUploadError("图片上传失败，请重试");
    }
  }

  function handleRandomizeMesh() {
    onChange((prev) => {
      const next = structuredClone(prev);
      const count = next.colors.subBgImageColors?.length || 3;
      next.colors.subBgMeshPositions = randomMeshPositions(count);
      next.colors.subBgGradientType = "mesh";
      return next;
    });
  }

  async function handlePaletteUpload(file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const colors = await extractPalette(dataUrl, 5);
    setPalette(colors);
  }

  // The grayscale option only converts the image to grayscale here; the actual
  // "multiply" blend against the background is done live via CSS mix-blend-mode
  // in DecorationLayer, not baked into the pixels. Baking it in would require
  // picking one fixed background color, but the decoration can be dragged across
  // both the stub and main areas, which often have different background colors —
  // only a live CSS blend can stay correct in both regions at once.
  async function applyDecorationEffects(original, { grayscale, halftone, tintColor }) {
    if (!original) return null;
    let result = original;
    try {
      if (grayscale) result = await convertToGrayscale(result);
      if (halftone) result = await convertToHalftone(result);
      if (tintColor) result = await tintImageDataUrl(result, tintColor);
    } catch (err) {
      console.error("装饰图片处理失败，已回退到原图", err);
      return original;
    }
    return result;
  }

  async function handleMainBgImageUpload(file) {
    if (!file) return;
    setUploadError(null);
    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const original = await resizeImageDataUrl(rawDataUrl);
      const [image, imgColors] = await Promise.all([
        applyDecorationEffects(original, {
          grayscale: ticket.colors.mainBgImageGrayscale,
          halftone: ticket.colors.mainBgImageHalftone,
        }),
        extractGradientColors(original),
      ]);
      onChange((prev) => {
        const next = structuredClone(prev);
        next.colors.mainBgImage = image;
        next.colors.mainBgImageOriginal = original;
        next.colors.mainBgImageColors = imgColors;
        next.colors.mainBgImagePosition = { x: 50, y: 50 };
        return next;
      });
    } catch (err) {
      console.error(err);
      setUploadError("图片上传失败，请重试");
    }
  }

  async function toggleMainBgImageEffect(key, checked) {
    const effects = {
      grayscale: key === "mainBgImageGrayscale" ? checked : ticket.colors.mainBgImageGrayscale,
      halftone: key === "mainBgImageHalftone" ? checked : ticket.colors.mainBgImageHalftone,
    };
    const image = await applyDecorationEffects(ticket.colors.mainBgImageOriginal, effects);
    onChange((prev) => {
      const next = structuredClone(prev);
      next.colors[key] = checked;
      next.colors.mainBgImage = image;
      return next;
    });
  }

  function removeMainBgImage() {
    onChange((prev) => {
      const next = structuredClone(prev);
      next.colors.mainBgImage = null;
      next.colors.mainBgImageOriginal = null;
      next.colors.mainBgImageHalftone = false;
      next.colors.mainBgImageGrayscale = false;
      next.colors.mainBgImageColors = null;
      next.colors.mainBgUseGradient = false;
      next.colors.mainBgGradientType = "linear";
      next.colors.mainBgMeshPositions = null;
      next.colors.mainBgImagePosition = { x: 50, y: 50 };
      return next;
    });
  }

  function handleRandomizeMainMesh() {
    onChange((prev) => {
      const next = structuredClone(prev);
      const count = next.colors.mainBgImageColors?.length || 3;
      next.colors.mainBgMeshPositions = randomMeshPositions(count);
      next.colors.mainBgGradientType = "mesh";
      return next;
    });
  }

  async function handleDecorationUpload(file) {
    if (!file) return;
    setUploadError(null);
    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const original = await resizeImageDataUrl(rawDataUrl);
      const image = await applyDecorationEffects(original, ticket.decoration);
      onChange((prev) => {
        const next = structuredClone(prev);
        next.decoration.original = original;
        next.decoration.image = image;
        return next;
      });
    } catch (err) {
      console.error(err);
      setUploadError("图片上传失败，请重试");
    }
  }

  async function toggleDecorationEffect(key, checked) {
    const effects = { ...ticket.decoration, [key]: checked };
    const image = await applyDecorationEffects(ticket.decoration.original, effects);
    onChange((prev) => {
      const next = structuredClone(prev);
      next.decoration[key] = checked;
      next.decoration.image = image;
      return next;
    });
  }

  function removeDecoration() {
    onChange((prev) => {
      const next = structuredClone(prev);
      next.decoration.image = null;
      next.decoration.original = null;
      next.decoration.tintColor = null;
      return next;
    });
  }

  async function handleDecorationTint(color) {
    const effects = { ...ticket.decoration, tintColor: color };
    const image = await applyDecorationEffects(ticket.decoration.original, effects);
    onChange((prev) => {
      const next = structuredClone(prev);
      next.decoration.tintColor = color;
      next.decoration.image = image;
      return next;
    });
  }

  return (
    <form className="ticket-form" onSubmit={(e) => e.preventDefault()}>
      {uploadError && <p className="upload-error">{uploadError}</p>}
      <fieldset>
        <legend>模板</legend>
        <div className="template-row">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={ticket.template === t.id ? "template-swatch active" : "template-swatch"}
              onClick={() => set("template", t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>剧场信息</legend>
        <label>
          剧场名称
          <div className="input-with-action">
            <input
              type="text"
              value={ticket.theatre.name}
              onChange={(e) => set("theatre.name", e.target.value)}
            />
            <button type="button" className="uppercase-btn" title="转为全大写" onClick={() => set("theatre.name", ticket.theatre.name.toUpperCase())}>AA</button>
            <button type="button" className="uppercase-btn" title="每词首字母大写" onClick={() => set("theatre.name", toTitleCase(ticket.theatre.name))}>Aa</button>
          </div>
        </label>
        <label>
          地址
          <input
            type="text"
            value={ticket.theatre.address}
            onChange={(e) => set("theatre.address", e.target.value)}
          />
        </label>
        <label>
          邮编
          <input
            type="text"
            value={ticket.theatre.postcode}
            onChange={(e) => set("theatre.postcode", e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>演出信息</legend>
        <label>
          剧名
          <div className="input-with-action">
            <input
              type="text"
              value={ticket.show.title}
              onChange={(e) => set("show.title", e.target.value)}
            />
            <button type="button" className="uppercase-btn" title="转为全大写" onClick={() => set("show.title", ticket.show.title.toUpperCase())}>AA</button>
            <button type="button" className="uppercase-btn" title="每词首字母大写" onClick={() => set("show.title", toTitleCase(ticket.show.title))}>Aa</button>
          </div>
        </label>
        <div className="form-row">
          <label>
            日期
            <input
              type="date"
              value={ticket.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </label>
          <label>
            时间
            <input
              type="time"
              value={ticket.time}
              onChange={(e) => set("time", e.target.value)}
            />
          </label>
        </div>
        <label>
          区 (Level)
          <div className="input-with-action">
            <input
              type="text"
              value={ticket.seat.level}
              onChange={(e) => set("seat.level", e.target.value)}
            />
            <button type="button" className="uppercase-btn" title="转为全大写" onClick={() => set("seat.level", ticket.seat.level.toUpperCase())}>AA</button>
            <button type="button" className="uppercase-btn" title="每词首字母大写" onClick={() => set("seat.level", toTitleCase(ticket.seat.level))}>Aa</button>
          </div>
        </label>
        <div className="form-row form-row-row-seat">
          <label>
            排 (Row)
            <div className="input-with-action">
              <input
                type="text"
                value={ticket.seat.row}
                onChange={(e) => set("seat.row", e.target.value)}
              />
              <button type="button" className="uppercase-btn" title="转为全大写" onClick={() => set("seat.row", ticket.seat.row.toUpperCase())}>AA</button>
              <button type="button" className="uppercase-btn" title="每词首字母大写" onClick={() => set("seat.row", toTitleCase(ticket.seat.row))}>Aa</button>
            </div>
          </label>
          <label>
            号 (Seat)
            <input
              type="text"
              value={ticket.seat.seat}
              onChange={(e) => set("seat.seat", e.target.value)}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            价格（选填，留空则不显示）
            <input
              type="number"
              min="0"
              step="0.01"
              value={ticket.price.amount}
              onChange={(e) => set("price.amount", e.target.value)}
            />
          </label>
          <label>
            币种
            <select
              value={ticket.price.currency}
              onChange={(e) => set("price.currency", e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label} ({c.code})
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>观后感</legend>
        <label>
          打分
          <div className="star-input">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                className={n <= ticket.rating ? "star filled" : "star"}
                onClick={() => set("rating", n)}
                aria-label={`${n} 星`}
              >
                ★
              </button>
            ))}
          </div>
        </label>
        <label>
          观后感
          <textarea
            rows={4}
            value={ticket.review}
            onChange={(e) => set("review", e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>装饰元素（选填）</legend>
        <label>
          剧场 icon / 图片
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleDecorationUpload(e.target.files[0])}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={ticket.decoration.halftone}
            disabled={!ticket.decoration.original}
            onChange={(e) => toggleDecorationEffect("halftone", e.target.checked)}
          />
          转换为点阵图案（自动去除白底）
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={ticket.decoration.grayscale}
            disabled={!ticket.decoration.original}
            onChange={(e) => toggleDecorationEffect("grayscale", e.target.checked)}
          />
          转换为黑白版本（与背景正片叠底）
        </label>
        {ticket.decoration.image && (
          <label>
            一键变色
            <div className="tint-row">
              {palette.length > 0 && (
                <>
                  {palette.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={ticket.decoration.tintColor === color ? "swatch active" : "swatch"}
                      style={{ background: color }}
                      onClick={() => handleDecorationTint(ticket.decoration.tintColor === color ? null : color)}
                      title={color}
                    />
                  ))}
                  <span className="tint-divider" />
                </>
              )}
              <input
                type="color"
                className="tint-color-picker"
                value={ticket.decoration.tintColor || "#888888"}
                onChange={(e) => handleDecorationTint(e.target.value)}
                title="自定义颜色"
              />
              {ticket.decoration.tintColor && (
                <button type="button" className="secondary" onClick={() => handleDecorationTint(null)}>
                  清除
                </button>
              )}
            </div>
          </label>
        )}
        {ticket.decoration.image && (
          <label>
            不透明度（{Math.round(ticket.decoration.opacity * 100)}%）
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={ticket.decoration.opacity}
              onChange={(e) => set("decoration.opacity", Number(e.target.value))}
            />
          </label>
        )}
        {ticket.decoration.image && (
          <button type="button" className="secondary" onClick={removeDecoration}>
            移除装饰图片
          </button>
        )}
        <p className="hint">在预览图中可拖拽装饰图片移动，拖拽右下角圆点改变大小。</p>
      </fieldset>

      <fieldset>
        <legend>背景图片（选填）</legend>
        <p className="bg-section-label">主票背景图片</p>
        <label>
          上传图片（覆盖在背景色之上）
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleMainBgImageUpload(e.target.files[0])}
          />
        </label>
        {ticket.colors.mainBgImage && (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={ticket.colors.mainBgUseGradient}
                onChange={(e) => {
                  set("colors.mainBgUseGradient", e.target.checked);
                  if (!e.target.checked) set("colors.mainBgGradientType", "linear");
                }}
              />
              将背景图片转换为渐变色背景
            </label>
            {ticket.colors.mainBgUseGradient ? (
              <div className="mesh-gradient-row">
                {ticket.colors.mainBgGradientType === "mesh" ? (
                  <>
                    <button type="button" className="secondary" onClick={handleRandomizeMainMesh}>
                      重新随机
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => set("colors.mainBgGradientType", "linear")}
                    >
                      恢复线性渐变
                    </button>
                  </>
                ) : (
                  <button type="button" className="secondary" onClick={handleRandomizeMainMesh}>
                    随机渐变
                  </button>
                )}
              </div>
            ) : (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={ticket.colors.mainBgImageHalftone}
                    onChange={(e) => toggleMainBgImageEffect("mainBgImageHalftone", e.target.checked)}
                  />
                  转换为点阵图案（自动去除白底）
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={ticket.colors.mainBgImageGrayscale}
                    onChange={(e) => toggleMainBgImageEffect("mainBgImageGrayscale", e.target.checked)}
                  />
                  转换为黑白版本（与背景正片叠底）
                </label>
                <label>
                  透明度（{Math.round(ticket.colors.mainBgImageOpacity * 100)}%）
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={ticket.colors.mainBgImageOpacity}
                    onChange={(e) => set("colors.mainBgImageOpacity", Number(e.target.value))}
                  />
                </label>
              </>
            )}
            {!ticket.colors.mainBgUseGradient && (
              <p className="hint">可在右侧预览中拖拽调整图片位置</p>
            )}
            <button type="button" className="secondary" onClick={removeMainBgImage}>
              移除主票背景图片
            </button>
          </>
        )}
        <p className="bg-section-label">副票背景图片</p>
        <label>
          上传图片（覆盖在背景色之上）
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleSubBgImageUpload(e.target.files[0])}
          />
        </label>
        {ticket.colors.subBgImage && (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={ticket.colors.subBgUseGradient}
                onChange={(e) => {
                  set("colors.subBgUseGradient", e.target.checked);
                  if (!e.target.checked) set("colors.subBgGradientType", "linear");
                }}
              />
              将背景图片转换为渐变色背景
            </label>
            {ticket.colors.subBgUseGradient && (
              <div className="mesh-gradient-row">
                {ticket.colors.subBgGradientType === "mesh" ? (
                  <>
                    <button type="button" className="secondary" onClick={handleRandomizeMesh}>
                      重新随机
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => set("colors.subBgGradientType", "linear")}
                    >
                      恢复线性渐变
                    </button>
                  </>
                ) : (
                  <button type="button" className="secondary" onClick={handleRandomizeMesh}>
                    随机渐变
                  </button>
                )}
              </div>
            )}
            {!ticket.colors.subBgUseGradient && (
              <p className="hint">可在右侧预览中拖拽调整图片位置</p>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onChange((prev) => {
                  const next = structuredClone(prev);
                  next.colors.subBgImage = null;
                  next.colors.subBgImageColors = null;
                  next.colors.subBgUseGradient = false;
                  next.colors.subBgGradientType = "linear";
                  next.colors.subBgMeshPositions = null;
                  next.colors.subBgImagePosition = { x: 50, y: 50 };
                  return next;
                })
              }
            >
              移除副票背景图片
            </button>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>颜色</legend>
        <label>
          上传图片自动提取配色（选填）
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handlePaletteUpload(e.target.files[0])}
          />
        </label>
        <div className="form-row">
          <label>
            主票背景色
            <input
              type="color"
              value={ticket.colors.mainBg}
              onChange={(e) => set("colors.mainBg", e.target.value)}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => set("colors.mainBg", ticket.colors.subBg)}
            >
              与副票背景色相同
            </button>
            {palette.length > 0 && (
              <div className="palette-row">
                {palette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="palette-swatch"
                    style={{ background: color }}
                    title={color}
                    onClick={() => set("colors.mainBg", color)}
                  />
                ))}
              </div>
            )}
          </label>
          <label>
            副票背景色
            <input
              type="color"
              value={ticket.colors.subBg}
              onChange={(e) => set("colors.subBg", e.target.value)}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => set("colors.subBg", ticket.colors.mainBg)}
            >
              与主票背景色相同
            </button>
            {palette.length > 0 && (
              <div className="palette-row">
                {palette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="palette-swatch"
                    style={{ background: color }}
                    title={color}
                    onClick={() => set("colors.subBg", color)}
                  />
                ))}
              </div>
            )}
          </label>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={ticket.showDivider}
            onChange={(e) => set("showDivider", e.target.checked)}
          />
          显示主票和副票之间的虚线
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={ticket.mainLines}
            onChange={(e) => set("mainLines", e.target.checked)}
          />
          主票顶部和底部各加一条横线
        </label>
        {ticket.mainLines && (
          <div className="main-line-style">
            <div className="main-line-mode-row">
              <button
                type="button"
                className={ticket.mainLineMode === "gradient" ? "secondary active-mode" : "secondary"}
                onClick={() => set("mainLineMode", "gradient")}
              >
                渐变
              </button>
              <button
                type="button"
                className={ticket.mainLineMode === "solid" ? "secondary active-mode" : "secondary"}
                onClick={() => set("mainLineMode", "solid")}
              >
                纯色
              </button>
            </div>
            {ticket.mainLineMode === "solid" && (
              <div className="tint-row">
                {palette.length > 0 && (
                  <>
                    {palette.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={ticket.mainLineColor === color ? "swatch active" : "swatch"}
                        style={{ background: color }}
                        onClick={() => set("mainLineColor", color)}
                        title={color}
                      />
                    ))}
                    <span className="tint-divider" />
                  </>
                )}
                <input
                  type="color"
                  className="tint-color-picker"
                  value={ticket.mainLineColor || "#000000"}
                  onChange={(e) => set("mainLineColor", e.target.value)}
                  title="自定义颜色"
                />
              </div>
            )}
          </div>
        )}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={ticket.dividerNotches}
            onChange={(e) => set("dividerNotches", e.target.checked)}
          />
          在主票和副票分界处加入半圆切口
        </label>
        {ticket.showDivider && (
          <label>
            虚线颜色
            <div className="text-color-input">
              <button
                type="button"
                className={ticket.dividerColor === "black" ? "swatch active" : "swatch"}
                style={{ background: "#1a1a1a" }}
                onClick={() => set("dividerColor", "black")}
                aria-label="黑色"
              />
              <button
                type="button"
                className={ticket.dividerColor === "white" ? "swatch active" : "swatch"}
                style={{ background: "#ffffff" }}
                onClick={() => set("dividerColor", "white")}
                aria-label="白色"
              />
            </div>
          </label>
        )}
        <label>
          纸张质感（与背景色正片叠底）
          <div className="texture-row">
            <button
              type="button"
              className={ticket.texture === "none" ? "texture-swatch none active" : "texture-swatch none"}
              onClick={() => set("texture", "none")}
            >
              无
            </button>
            {TEXTURES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={ticket.texture === t.id ? "texture-swatch active" : "texture-swatch"}
                style={{ backgroundImage: `url(${t.src})` }}
                onClick={() => set("texture", t.id)}
                title={t.label}
              />
            ))}
          </div>
        </label>
        <label>
          主票文字颜色
          <div className="text-color-input">
            <button
              type="button"
              className={ticket.colors.mainTextColor === "#1a1a1a" ? "swatch active" : "swatch"}
              style={{ background: "#1a1a1a" }}
              onClick={() => set("colors.mainTextColor", "#1a1a1a")}
              aria-label="黑色"
            />
            <button
              type="button"
              className={ticket.colors.mainTextColor === "#ffffff" ? "swatch active" : "swatch"}
              style={{ background: "#ffffff" }}
              onClick={() => set("colors.mainTextColor", "#ffffff")}
              aria-label="白色"
            />
          </div>
        </label>
        <label>
          副票文字颜色（打分 + 观后感）
          <div className="text-color-input">
            <button
              type="button"
              className={ticket.colors.subTextColor === "#1a1a1a" ? "swatch active" : "swatch"}
              style={{ background: "#1a1a1a" }}
              onClick={() => set("colors.subTextColor", "#1a1a1a")}
              aria-label="黑色"
            />
            <button
              type="button"
              className={ticket.colors.subTextColor === "#ffffff" ? "swatch active" : "swatch"}
              style={{ background: "#ffffff" }}
              onClick={() => set("colors.subTextColor", "#ffffff")}
              aria-label="白色"
            />
          </div>
        </label>
      </fieldset>
    </form>
  );
}
