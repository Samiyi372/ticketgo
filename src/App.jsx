import { useEffect, useRef, useState } from "react";
import TicketForm from "./components/TicketForm";
import TicketPreview from "./components/TicketPreview";
import ExportPanel from "./components/ExportPanel";
import TicketHistory from "./components/TicketHistory";
import { defaultTicket } from "./defaultTicket";
import { NOISE_BACKGROUND } from "./utils/noise";
import "./App.css";

function App() {
  const [ticket, setTicket] = useState(defaultTicket);
  const ticketRef = useRef(null);

  useEffect(() => {
    document.documentElement.style.setProperty("--noise-bg", NOISE_BACKGROUND);
  }, []);

  function handleDecorationChange(decoration) {
    setTicket((prev) => ({ ...prev, decoration }));
  }

  return (
    <div className="app-layout">
      <aside className="app-form-panel">
        <div className="app-form-header">
          <h1 className="app-title">票根生成器</h1>
          <button
            type="button"
            className="reset-btn"
            onClick={() => setTicket(defaultTicket)}
            title="清除当前设计，恢复默认值（不影响历史记录）"
          >
            清除设计
          </button>
        </div>
        <TicketForm ticket={ticket} onChange={setTicket} />
      </aside>
      <main className="app-preview-panel">
        <TicketPreview
          ticket={ticket}
          onDecorationChange={handleDecorationChange}
          ticketRef={ticketRef}
        />
        <ExportPanel ticketRef={ticketRef} ticket={ticket} />
        <TicketHistory ticket={ticket} onLoad={setTicket} />
      </main>
    </div>
  );
}

export default App;
