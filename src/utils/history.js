const HISTORY_KEY = "ticketgo-history";
const MAX_HISTORY = 12;

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch {
    // Most likely a quota error from the decoration/background images baked
    // into the ticket — surfaced to the caller instead of throwing, since
    // losing the in-memory list over a failed save would be worse.
    return false;
  }
}

export function addToHistory(ticket) {
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, savedAt: Date.now(), ticket };
  const history = [entry, ...loadHistory()].slice(0, MAX_HISTORY);
  const ok = saveHistory(history);
  return { history, ok };
}

export function removeFromHistory(id) {
  const history = loadHistory().filter((entry) => entry.id !== id);
  saveHistory(history);
  return history;
}
