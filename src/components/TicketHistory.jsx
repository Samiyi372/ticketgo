import { useEffect, useRef, useState } from "react";
import { loadHistory, addToHistory, removeFromHistory } from "../utils/history";
import { exportNodeToPng, downloadDataUrl } from "../utils/export";
import { exportCollage } from "../utils/collage";
import { EXPORT_PIXEL_RATIO } from "../utils/dimensions";
import { getTemplateComponent } from "./templates";
import A4CollageSheet, { A4_COLLAGE_MAX_PER_PAGE } from "./A4CollageSheet";
import "./TicketHistory.css";

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
  const [collageBg, setCollageBg] = useState("#ffffff");
  const [collageBgImage, setCollageBgImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const nodeRefs = useRef(new Map());
  const pageRefs = useRef(new Map());
  const bgImageInputRef = useRef(null);

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

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
    try {
      const nodes = selected.map((entry) => nodeRefs.current.get(entry.id)).filter(Boolean);
      const dataUrl = await exportCollage(nodes, { backgroundColor: collageBg, backgroundImage: collageBgImage });
      setPreview({ dataUrl, count: selected.length });
    } catch (err) {
      console.error(err);
      setError("拼图导出失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function handleA4CollageExport() {
    const selected = history.filter((entry) => selectedIds.includes(entry.id));
    if (selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const pageCount = chunk(selected, A4_COLLAGE_MAX_PER_PAGE).length;
      for (let i = 0; i < pageCount; i++) {
        const node = pageRefs.current.get(i);
        if (!node) continue;
        const dataUrl = await exportNodeToPng(node, {
          pixelRatio: EXPORT_PIXEL_RATIO,
          backgroundColor: "#ffffff",
        });
        downloadDataUrl(dataUrl, `票根A4拼版_第${i + 1}页_300dpi.png`);
        // A short gap between downloads keeps browsers from treating a burst
        // of same-tick downloads as popup spam and silently blocking them.
        if (i < pageCount - 1) await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (err) {
      console.error(err);
      setError("A4 拼版导出失败，请重试");
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
          <ul className="ticket-history-list">
            {history.map((entry) => (
              <li key={entry.id} className="ticket-history-item">
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
        </>
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
