import { useRef, useState } from "react";
import { exportNodeToPng, downloadDataUrl } from "../utils/export";
import { EXPORT_PIXEL_RATIO } from "../utils/dimensions";
import A4Sheet from "./A4Sheet";
import "./ExportPanel.css";

const SHARE_PIXEL_RATIO = 2;

export default function ExportPanel({ ticketRef, ticket }) {
  const a4Ref = useRef(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  function fileName(suffix) {
    const base = (ticket.show.title || "ticket").trim().replace(/\s+/g, "_");
    return `${base}_${suffix}.png`;
  }

  async function runExport(mode, node, options, suffix) {
    if (!node) return;
    setBusy(mode);
    setError(null);
    try {
      const dataUrl = await exportNodeToPng(node, options);
      downloadDataUrl(dataUrl, fileName(suffix));
    } catch (err) {
      console.error(err);
      setError("导出失败，请重试");
    } finally {
      setBusy(null);
    }
  }

  async function previewA4() {
    if (!a4Ref.current) return;
    setBusy("a4");
    setError(null);
    try {
      const dataUrl = await exportNodeToPng(a4Ref.current, {
        pixelRatio: EXPORT_PIXEL_RATIO,
        backgroundColor: "#ffffff",
      });
      setPreview(dataUrl);
    } catch (err) {
      console.error(err);
      setError("导出失败，请重试");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="export-panel">
      <button
        className="export-btn"
        onClick={() => runExport("share", ticketRef.current, { pixelRatio: SHARE_PIXEL_RATIO }, "分享版")}
        disabled={busy !== null}
      >
        {busy === "share" ? "正在生成…" : "导出 PNG（社交分享）"}
      </button>
      <button
        className="export-btn secondary"
        onClick={() => runExport("original", ticketRef.current, { pixelRatio: EXPORT_PIXEL_RATIO }, "原尺寸_300dpi")}
        disabled={busy !== null}
      >
        {busy === "original" ? "正在生成…" : "导出单张原尺寸（300 DPI 打印）"}
      </button>
      <button className="export-btn secondary" onClick={previewA4} disabled={busy !== null}>
        {busy === "a4" ? "正在生成…" : "预览 / 导出 A4 拼版（含裁切线）"}
      </button>
      {error && <p className="export-error">{error}</p>}

      <A4Sheet ticket={ticket} forwardedRef={a4Ref} />

      {preview && (
        <div className="export-preview-overlay" onClick={() => setPreview(null)}>
          <div className="export-preview-dialog" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="A4 拼版预览" className="export-preview-img" />
            <div className="export-preview-actions">
              <button
                className="export-btn"
                onClick={() => downloadDataUrl(preview, fileName("A4拼版_300dpi"))}
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
