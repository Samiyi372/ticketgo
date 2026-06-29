const DB_NAME = "ticketgo";
const DB_VERSION = 1;
const STORE_NAME = "history";
const LEGACY_KEY = "ticketgo-history";
const MAX_HISTORY = 30;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function runTransaction(mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const result = work(store);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      })
  );
}

function getAllEntries() {
  return runTransaction("readonly", (store) => {
    const entries = [];
    store.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        entries.push(cursor.value);
        cursor.continue();
      }
    };
    return entries;
  }).then((entries) => entries.sort((a, b) => b.savedAt - a.savedAt));
}

// One-time import of any pre-existing localStorage history, since older
// versions of the app stored entries there before this migrated to IndexedDB.
async function migrateLegacyHistory() {
  let raw;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      await runTransaction("readwrite", (store) => {
        for (const entry of parsed) store.put(entry);
      });
    }
  } catch {
    // Ignore malformed legacy data.
  } finally {
    localStorage.removeItem(LEGACY_KEY);
  }
}

let migrated = false;

export async function loadHistory() {
  try {
    if (!migrated) {
      migrated = true;
      await migrateLegacyHistory();
    }
    return await getAllEntries();
  } catch {
    return [];
  }
}

export async function addToHistory(ticket) {
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, savedAt: Date.now(), ticket };
  try {
    await runTransaction("readwrite", (store) => store.put(entry));
    let history = await getAllEntries();
    if (history.length > MAX_HISTORY) {
      const overflow = history.slice(MAX_HISTORY);
      await runTransaction("readwrite", (store) => {
        for (const old of overflow) store.delete(old.id);
      });
      history = history.slice(0, MAX_HISTORY);
    }
    return { history, ok: true };
  } catch {
    const history = await getAllEntries().catch(() => []);
    return { history, ok: false };
  }
}

export async function removeFromHistory(id) {
  await runTransaction("readwrite", (store) => store.delete(id));
  return getAllEntries();
}
