/**
 * Tiny IndexedDB wrapper for the offline vault and registration drafts.
 */
import { OFFLINE_DB_NAME, OFFLINE_DB_VERSION } from "./constants";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("drafts")) {
        const drafts = db.createObjectStore("drafts", { keyPath: "idempotency_key" });
        drafts.createIndex("by_user", "user_id", { unique: false });
        drafts.createIndex("by_status", "status", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

export async function metaGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const req = tx.objectStore("meta").get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

export async function metaSet(key, value) {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value });
  await txDone(tx);
}

export async function metaDelete(key) {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").delete(key);
  await txDone(tx);
}

export async function draftPut(record) {
  const db = await openDb();
  const tx = db.transaction("drafts", "readwrite");
  tx.objectStore("drafts").put(record);
  await txDone(tx);
}

export async function draftGet(idempotencyKey) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const req = tx.objectStore("drafts").get(idempotencyKey);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function draftDelete(idempotencyKey) {
  const db = await openDb();
  const tx = db.transaction("drafts", "readwrite");
  tx.objectStore("drafts").delete(idempotencyKey);
  await txDone(tx);
}

export async function draftsByUser(userId) {
  const db = await openDb();
  const key = String(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const index = tx.objectStore("drafts").index("by_user");
    const req = index.getAll(key);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function draftsDeleteByUser(userId) {
  const rows = await draftsByUser(String(userId));
  const db = await openDb();
  const tx = db.transaction("drafts", "readwrite");
  const store = tx.objectStore("drafts");
  rows.forEach((row) => store.delete(row.idempotency_key));
  await txDone(tx);
}

/** Wipe every offline store (logout / revoke). */
export async function wipeOfflineDb() {
  const db = await openDb();
  const tx = db.transaction(["meta", "drafts"], "readwrite");
  tx.objectStore("meta").clear();
  tx.objectStore("drafts").clear();
  await txDone(tx);
}
