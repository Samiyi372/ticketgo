import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { loadHistory, addToHistory, removeFromHistory, importEntries, saveHistoryOrder, loadHistoryOrder } from "../utils/history";
import { exportNodeToPng, downloadDataUrl } from "../utils/export";
import { exportCollage } from "../utils/collage";
import { EXPORT_PIXEL_RATIO } from "../utils/dimensions";
import { getTemplateComponent } from "./templates";
import A4CollageSheet, { A4_COLLAGE_MAX_PER_PAGE } from "./A4CollageSheet";
import TicketStack, { RATIO_PRESETS, getExportDims, FAN_SPREAD_MIN, FAN_SPREAD_MAX, DEFAULT_FAN_SPREAD_DEG, DEFAULT_FAN_PIVOT, FAN_ANCHORS, DEFAULT_FAN_ANCHOR } from "./TicketStack";
import "./TicketHistory.css";

function loadImg(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function compositeToRatio(designDataUrl, exportW, exportH, bgColor = "#ffffff", bgImage = null) {
  const [img, bgImg] = await Promise.all([
    loadImg(designDataUrl),
    bgImage ? loadImg(bgImage) : Promise.resolve(null),
  ]);
  const cvs = document.createElement("canvas");
  cvs.width  = exportW;
  cvs.height = exportH;
  const ctx = cvs.getContext("2d");
  // Background colour
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, exportW, exportH);
  // Background image (cover)
  if (bgImg) {
    const s  = Math.max(exportW / bgImg.width, exportH / bgImg.height);
    const dw = bgImg.width * s, dh = bgImg.height * s;
    ctx.drawImage(bgImg, (exportW - dw) / 2, (exportH - dh) / 2, dw, dh);
  }
  // Design canvas (contain)
  const s  = Math.min(exportW / img.width, exportH / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, (exportW - dw) / 2, (exportH - dh) / 2, dw, dh);
  return cvs.toDataURL("image/png");
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export default function TicketHistory({ ticket, onLoad }) {
  const [history, setHistory] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const progressTimerRef = useRef(null);
  const dragSrcIdx = useRef(null);
  const [collageBg, setCollageBg] = useState("#ffffff");
  const [collageBgImage, setCollageBgImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  // { mode, seed, validate, ratio, customW, customH, orientation } | null
  const [stackView, setStackView] = useState(null);
  const [stackBg, setStackBg] = useState("#ffffff");
  const [stackBgImage, setStackBgImage] = useState(null);
  const [stackCardScale, setStackCardScale] = useState(1);
  const [stackFanSpread, setStackFanSpread] = useState(DEFAULT_FAN_SPREAD_DEG);
  const [stackFanPivot, setStackFanPivot] = useState(DEFAULT_FAN_PIVOT);
  const [stackFanAnchor, setStackFanAnchor] = useState(DEFAULT_FAN_ANCHOR);
  const [stackViewport, setStackViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const nodeRefs = useRef(new Map());
  const pageRefs = useRef(new Map());
  const stackCanvasRef = useRef(null);
  const stackOutputRef = useRef(null);
  const stackBgImageInputRef = useRef(null);
  const bgImageInputRef = useRef(null);
  const archiveInputRef = useRef(null);

  useEffect(() => {
    loadHistory().then((entries) => setHistory(applyOrder(entries, loadHistoryOrder())));
  }, []);

  function applyOrder(entries, order) {
    if (!order) return entries;
    const map = new Map(entries.map((e) => [e.id, e]));
    const ordered = order.filter((id) => map.has(id)).map((id) => map.get(id));
    const inOrder = new Set(order);
    const extra = entries.filter((e) => !inOrder.has(e.id));
    return [...extra, ...ordered];
  }

  function handleDragStart(e, idx) {
    dragSrcIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }

  function handleDrop(e, idx) {
    e.preventDefault();
    setDragOverIdx(null);
    const src = dragSrcIdx.current;
    if (src === null || src === idx) return;
    const next = [...history];
    const [item] = next.splice(src, 1);
    next.splice(idx, 0, item);
    dragSrcIdx.current = null;
    setHistory(next);
    saveHistoryOrder(next.map((e) => e.id));
  }

  function handleDragEnd() {
    dragSrcIdx.current = null;
    setDragOverIdx(null);
  }

  function startProgress() {
    let current = 0;
    setProgress(0);
    progressTimerRef.current = setInterval(() => {
      current = Math.min(92, current + Math.max(0.4, (92 - current) * 0.035));
      setProgress(Math.round(current));
    }, 80);
  }

  function finishProgress() {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setProgress(100);
    setTimeout(() => setProgress(null), 400);
  }

  async function handleSave() {
    const { history: next, ok } = await addToHistory(ticket);
    setHistory(next);
    setError(ok ? null : "保存失败：浏览器本地存储空间不足，建议先删除一些历史记录");
  }

  async function handleRemove(id) {
    setHistory(await removeFromHistory(id));
    setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    nodeRefs.current.delete(id);
  }

  function toggleSelected(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    );
  }

  function handleArchiveExport() {
    const selected = history.filter((entry) => selectedIds.includes(entry.id));
    const archive = { version: 1, exportedAt: Date.now(), entries: selected };
    const blob = new Blob([JSON.stringify(archive)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `票根存档_${selected.length}张_${new Date().toISOString().slice(0, 10)}.ticketgo`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleArchiveImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.entries || !Array.isArray(data.entries)) {
        setError("文件格式无效，请选择正确的 .ticketgo 存档文件");
        return;
      }
      const { history: next, imported } = await importEntries(data.entries);
      setHistory(next);
      setImportResult(imported);
    } catch (err) {
      console.error(err);
      setError("导入失败，请检查文件格式");
    } finally {
      e.target.value = "";
    }
  }

  async function handleCollageBgImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setCollageBgImage(dataUrl);
  }

  async function previewCollage() {
    const selected = history.filter((entry) => selectedIds.includes(entry.id));
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    startProgress();
    try {
      const nodes = selected.map((entry) => nodeRefs.current.get(entry.id)).filter(Boolean);
      const dataUrl = await exportCollage(nodes, { backgroundColor: collageBg, backgroundImage: collageBgImage });
      finishProgress();
      setPreview({ dataUrl, count: selected.length });
    } catch (err) {
      console.error(err);
      setError("拼图导出失败，请重试");
      finishProgress();
    } finally {
      setBusy(false);
    }
  }

  async function handleA4CollageExport() {
    const selected = history.filter((entry) => selectedIds.includes(entry.id));
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    startProgress();
    try {
      const pageCount = chunk(selected, A4_COLLAGE_MAX_PER_PAGE).length;
      const zip = new JSZip();
      for (let i = 0; i < pageCount; i++) {
        const node = pageRefs.current.get(i);
        if (!node) continue;
        const dataUrl = await exportNodeToPng(node, {
          pixelRatio: EXPORT_PIXEL_RATIO,
          backgroundColor: "#ffffff",
          notchColor: "#ffffff",
        });
        // Strip the data URL prefix to get raw base64
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
        zip.file(`票根A4拼版_第${i + 1}页_300dpi.png`, base64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `票根A4拼版_${pageCount}页_300dpi.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      finishProgress();
    } catch (err) {
      console.error(err);
      setError("A4 拼版导出失败，请重试");
      finishProgress();
    } finally {
      setBusy(false);
    }
  }

  async function handleStackExport() {
    const node = stackOutputRef.current;
    if (!node || !stackView) return;
    setBusy(true);
    startProgress();
    try {
      // Capture ts-output-canvas directly: it already has the correct background
      // colour/image, aspect ratio, and all visual transforms applied. This avoids
      // the coordinate mismatch that arose from trying to capture the inner ts-canvas
      // (which has a display-fit transform) and composite it separately.
      // Scale pixelRatio so the output matches the chosen export dimensions.
      const { w: ew, h: eh } = getExportDims(stackView.ratio ?? "3:2", stackView.customW, stackView.customH, stackView.orientation ?? "landscape");
      const pixelRatio = Math.max(1, ew / node.offsetWidth);
      const dataUrl = await exportNodeToPng(node, { pixelRatio });
      finishProgress();
      const ratioLabel = (stackView.ratio ?? "3:2").replace(":", "x");
      downloadDataUrl(dataUrl, `票根堆叠_${selectedEntries.length}张_${ratioLabel}.png`);
    } catch (err) {
      console.error(err);
      setError("导出失败，请重试");
      finishProgress();
    } finally {
      setBusy(false);
    }
  }

  const selectedEntries = history.filter((entry) => selectedIds.includes(entry.id));
  const collagePages = chunk(selectedEntries.map((entry) => entry.ticket), A4_COLLAGE_MAX_PER_PAGE);

  return (
    <div className="ticket-history">
      <div className="ticket-history-header">
        <h2>历史票根</h2>
        <button type="button" className="export-btn secondary" onClick={handleSave}>
          保存当前票根到历史
        </button>
      </div>
      {error && <p className="export-error">{error}</p>}
      {history.length === 0 ? (
        <p className="ticket-history-hint">还没有保存过票根。</p>
      ) : (
        <>
          <div className="ticket-history-select-row">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                selectedIds.length === history.length
                  ? setSelectedIds([])
                  : setSelectedIds(history.map((e) => e.id))
              }
            >
              {selectedIds.length === history.length ? "取消全选" : "全选"}
            </button>
            <span className="ticket-history-count">共 {history.length} 张，已选 {selectedIds.length} 张</span>
          </div>
          <ul className="ticket-history-list">
            {history.map((entry, idx) => (
              <li
                key={entry.id}
                className={[
                  "ticket-history-item",
                  dragOverIdx === idx ? "drag-over" : "",
                ].join(" ").trim()}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onDragLeave={() => setDragOverIdx(null)}
              >
                <span className="drag-handle" title="拖拽排序">⠿</span>
                <label className="ticket-history-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(entry.id)}
                    onChange={() => toggleSelected(entry.id)}
                  />
                  <span>
                    {entry.ticket.show.title || "未命名"} · {entry.ticket.theatre.name} · {entry.ticket.date}
                  </span>
                </label>
                <div className="ticket-history-actions">
                  <button type="button" className="secondary" onClick={() => onLoad(entry.ticket)}>
                    应用
                  </button>
                  <button type="button" className="secondary" onClick={() => handleRemove(entry.id)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <label className="ticket-history-bg-picker">
            拼图背景色
            <input
              type="color"
              value={collageBg}
              onChange={(e) => setCollageBg(e.target.value)}
            />
          </label>
          <div className="ticket-history-bg-picker">
            拼图背景图片
            <input
              ref={bgImageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleCollageBgImageUpload}
            />
            {collageBgImage ? (
              <>
                <img src={collageBgImage} alt="" className="collage-bg-thumb" />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => { setCollageBgImage(null); bgImageInputRef.current.value = ""; }}
                >
                  移除
                </button>
              </>
            ) : (
              <button type="button" className="secondary" onClick={() => bgImageInputRef.current?.click()}>
                上传
              </button>
            )}
          </div>
          <button
            type="button"
            className="export-btn"
            onClick={previewCollage}
            disabled={busy || selectedIds.length === 0}
          >
            {busy ? "正在生成…" : `预览 / 导出拼图（已选 ${selectedIds.length} 张）`}
          </button>
          <button
            type="button"
            className="export-btn secondary"
            onClick={handleA4CollageExport}
            disabled={busy || selectedIds.length === 0}
          >
            {busy
              ? "正在生成…"
              : `导出 A4 拼版（每页最多 ${A4_COLLAGE_MAX_PER_PAGE} 张，共 ${collagePages.length} 页）`}
          </button>
          <button
            type="button"
            className="export-btn secondary"
            onClick={() => setStackView({ mode: "fan", seed: Date.now() % 99991, validate: false, ratio: "3:2", customW: 1620, customH: 1080, orientation: "landscape" })}
            disabled={busy || selectedIds.length < 2}
          >
            随机堆叠预览（已选 {selectedIds.length} 张）
          </button>
        </>
      )}

      <div className="ticket-history-archive">
        <button
          type="button"
          className="export-btn secondary"
          onClick={handleArchiveExport}
          disabled={selectedIds.length === 0}
        >
          导出存档（已选 {selectedIds.length} 张）
        </button>
        <input
          ref={archiveInputRef}
          type="file"
          accept=".ticketgo,application/json"
          style={{ display: "none" }}
          onChange={handleArchiveImport}
        />
        <button
          type="button"
          className="export-btn secondary"
          onClick={() => { setImportResult(null); archiveInputRef.current?.click(); }}
        >
          导入存档
        </button>
      </div>
      {importResult !== null && (
        <p className="import-result">
          {importResult > 0
            ? `已导入 ${importResult} 张票根`
            : "全部已存在，未重复导入"}
        </p>
      )}

      {collagePages.map((pageTickets, i) => (
        <A4CollageSheet
          key={i}
          tickets={pageTickets}
          forwardedRef={(node) => {
            if (node) pageRefs.current.set(i, node);
            else pageRefs.current.delete(i);
          }}
        />
      ))}

      <div className="ticket-history-offscreen">
        {selectedEntries.map((entry) => {
          const Template = getTemplateComponent(entry.ticket.template);
          return (
            <Template
              key={entry.id}
              ticket={entry.ticket}
              editable={false}
              printMode
              onDecorationChange={() => {}}
              forwardedRef={(node) => {
                if (node) nodeRefs.current.set(entry.id, node);
                else nodeRefs.current.delete(entry.id);
              }}
            />
          );
        })}
      </div>

      {stackView && (
        <div className="stack-overlay" onClick={() => setStackView(null)}>
          <div className="stack-layout" onClick={(e) => e.stopPropagation()}>
          <div className="stack-dialog">
            <div className="stack-preview-area">
              <TicketStack
                entries={selectedEntries}
                mode={stackView.mode}
                seed={stackView.seed}
                validate={stackView.mode === "fan" || stackView.mode === "cascade"}
                canvasRatio={stackView.ratio ?? "3:2"}
                customW={stackView.customW}
                customH={stackView.customH}
                orientation={stackView.orientation ?? "landscape"}
                bgColor={stackBg}
                bgImage={stackBgImage}
                cardScale={stackCardScale}
                fanSpreadDeg={stackFanSpread}
                fanPivot={stackFanPivot}
                onFanPivotChange={setStackFanPivot}
                fanAnchor={stackFanAnchor}
                viewport={stackViewport}
                onViewportChange={setStackViewport}
                canvasRef={stackCanvasRef}
                outputCanvasRef={stackOutputRef}
              />
            </div>

            {/* Row 1: mode + shuffle + export + close */}
            <div className="stack-toolbar">
              <div className="stack-mode-toggle">
                {[
                  { key: "fan",     label: "扇形" },
                  { key: "radial",  label: "辐射" },
                  { key: "scatter", label: "散落" },
                  { key: "cascade", label: "层叠" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={stackView.mode === key ? "export-btn" : "export-btn secondary"}
                    onClick={() => setStackView((v) => ({ ...v, mode: key }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="export-btn secondary"
                onClick={() => setStackView((v) => ({ ...v, seed: Date.now() % 99991 }))}
              >
                换一个排法
              </button>
              <button
                type="button"
                className="export-btn"
                onClick={handleStackExport}
                disabled={busy}
              >
                {busy ? "导出中…" : "导出 PNG"}
              </button>
              <button type="button" className="export-btn secondary" onClick={() => setStackView(null)}>
                关闭
              </button>
            </div>

            {/* Row 2: ratio picker */}
            <div className="stack-ratio-row">
              <span className="stack-ratio-label">画布比例</span>
              <div className="stack-ratio-picker">

                {RATIO_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={p.hint}
                    className={(stackView.ratio ?? "3:2") === p.key ? "export-btn" : "export-btn secondary"}
                    onClick={() => setStackView((v) => ({ ...v, ratio: p.key }))}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={(stackView.ratio ?? "") === "custom" ? "export-btn" : "export-btn secondary"}
                  onClick={() => setStackView((v) => ({ ...v, ratio: "custom" }))}
                >
                  自定义
                </button>
              </div>
              {/* Orientation toggle — hidden for square and custom ratios */}
              {(stackView.ratio ?? "3:2") !== "1:1" && (stackView.ratio ?? "3:2") !== "custom" && (
                <div className="stack-orientation-toggle">
                  {[
                    { key: "landscape", label: "横屏" },
                    { key: "portrait",  label: "竖屏" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={(stackView.orientation ?? "landscape") === key ? "export-btn" : "export-btn secondary"}
                      onClick={() => setStackView((v) => ({ ...v, orientation: key }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {(stackView.ratio ?? "") === "custom" && (
                <div className="stack-ratio-custom">
                  <input
                    type="number"
                    min="100" max="8000" step="1"
                    value={stackView.customW ?? 1080}
                    onChange={(e) => setStackView((v) => ({ ...v, customW: Number(e.target.value) }))}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    min="100" max="8000" step="1"
                    value={stackView.customH ?? 1080}
                    onChange={(e) => setStackView((v) => ({ ...v, customH: Number(e.target.value) }))}
                  />
                  <span className="stack-ratio-unit">px</span>
                </div>
              )}
            </div>

            {/* Row 3: card scale */}
            <div className="stack-scale-row">
              <span className="stack-ratio-label">票根大小</span>
              <input
                type="range"
                min="0.4"
                max="1.8"
                step="0.05"
                value={stackCardScale}
                onChange={(e) => setStackCardScale(Number(e.target.value))}
                className="stack-scale-slider"
              />
              <span className="stack-scale-value">{Math.round(stackCardScale * 100)}%</span>
            </div>

            {/* Row 3b: fan spread — only meaningful in fan mode */}
            {stackView.mode === "fan" && (
              <div className="stack-scale-row">
                <span className="stack-ratio-label">扇形角度</span>
                <input
                  type="range"
                  min={FAN_SPREAD_MIN}
                  max={FAN_SPREAD_MAX}
                  step="1"
                  value={stackFanSpread}
                  onChange={(e) => setStackFanSpread(Number(e.target.value))}
                  className="stack-scale-slider"
                />
                <span className="stack-scale-value">{stackFanSpread}°</span>
              </div>
            )}

            {/* Row 3c: fan rotation anchor — only meaningful in fan mode */}
            {stackView.mode === "fan" && (
              <div className="stack-mode-toggle">
                {FAN_ANCHORS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={stackFanAnchor === key ? "export-btn" : "export-btn secondary"}
                    onClick={() => setStackFanAnchor(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Row 4: background */}
            <div className="stack-bg-row">
              <span className="stack-ratio-label">背景</span>
              <label className="stack-bg-color">
                <input
                  type="color"
                  value={stackBg}
                  onChange={(e) => setStackBg(e.target.value)}
                />
                <span>背景色</span>
              </label>
              <input
                ref={stackBgImageInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setStackBgImage(reader.result);
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
              {stackBgImage ? (
                <>
                  <img src={stackBgImage} alt="" className="collage-bg-thumb" />
                  <button
                    type="button"
                    className="export-btn secondary"
                    onClick={() => setStackBgImage(null)}
                  >
                    移除背景图
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="export-btn secondary"
                  onClick={() => stackBgImageInputRef.current?.click()}
                >
                  上传背景图
                </button>
              )}
            </div>
          </div>

          {/* Right: read-only mirror preview */}
          <div className="stack-side-preview">
            <TicketStack
              entries={selectedEntries}
              mode={stackView.mode}
              seed={stackView.seed}
              validate={stackView.mode === "fan" || stackView.mode === "cascade"}
              canvasRatio={stackView.ratio ?? "3:2"}
              customW={stackView.customW}
              customH={stackView.customH}
              orientation={stackView.orientation ?? "landscape"}
              bgColor={stackBg}
              bgImage={stackBgImage}
              cardScale={stackCardScale}
              fanSpreadDeg={stackFanSpread}
              fanPivot={stackFanPivot}
              fanAnchor={stackFanAnchor}
              viewport={stackViewport}
              interactive={false}
            />
          </div>

          </div>
        </div>
      )}

      {progress !== null && (
        <div className="loading-overlay">
          <div className="loading-content">
            <span className="loading-percent">{progress}%</span>
            <span className="loading-hint">请稍候 赛博票房工作中</span>
          </div>
        </div>
      )}

      {preview && (
        <div className="export-preview-overlay" onClick={() => setPreview(null)}>
          <div className="export-preview-dialog" onClick={(e) => e.stopPropagation()}>
            <img src={preview.dataUrl} alt="拼图预览" className="export-preview-img" />
            <div className="export-preview-actions">
              <button
                className="export-btn"
                onClick={() => downloadDataUrl(preview.dataUrl, `票根拼图_${preview.count}张_300dpi.png`)}
              >
                下载 PNG
              </button>
              <button className="export-btn secondary" onClick={() => setPreview(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
