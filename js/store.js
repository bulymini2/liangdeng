/* 案件保存：案件內容存在 localStorage，照片與圖片存在 IndexedDB。
   兩者都只存在「這台裝置的這個瀏覽器」，換手機或清除網站資料就會不見；無法使用時一律改成只存在記憶體，畫面照常運作。
   persistent 為 false 時（例如無痕視窗、預覽畫面），畫面會提醒使用者資料不會留下。 */
(function (LD) {
  'use strict';

  const CASES_KEY = 'liangdeng-cases-v2';
  const PREFS_KEY = 'liangdeng-prefs-v2';

  const persistent = (() => {
    try { const k = 'liangdeng-test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  })();
  const memory = {};

  function readJSON(key, fallback) {
    try { const raw = persistent ? localStorage.getItem(key) : memory[key]; return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    const raw = JSON.stringify(value);
    memory[key] = raw;
    try { if (persistent) localStorage.setItem(key, raw); return persistent; } catch (e) { return false; }
  }

  /* ---------- 案件 ---------- */
  const loadCases = () => { const v = readJSON(CASES_KEY, []); return Array.isArray(v) ? v : []; };
  const saveCases = list => writeJSON(CASES_KEY, list);

  /* ---------- 偏好（看過開場、收入假設、是否顯示示範） ---------- */
  const loadPrefs = () => Object.assign({ seenIntro: false, showDemo: true, fees: null }, readJSON(PREFS_KEY, {}));
  const savePrefs = p => writeJSON(PREFS_KEY, p);

  /* ---------- 圖片（IndexedDB）；任何一步卡住都在時限內放棄，不擋住畫面 ---------- */
  const within = (p, ms) => Promise.race([p, new Promise(resolve => setTimeout(() => resolve(null), ms))]);
  const mem = new Map();
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = within(new Promise(resolve => {
      try {
        const req = indexedDB.open('liangdeng', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('blobs');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    }), 4000);
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    if (!d) return null;
    return within(new Promise(resolve => {
      try {
        const t = d.transaction('blobs', mode);
        const out = fn(t.objectStore('blobs'));
        t.oncomplete = () => resolve(out && 'result' in out ? out.result : true);
        t.onerror = t.onabort = () => resolve(null);
      } catch (e) { resolve(null); }
    }), 8000);
  }
  async function putBlob(key, blob) {
    mem.set(key, blob);
    return tx('readwrite', s => s.put(blob, key));
  }
  async function getBlob(key) {
    if (mem.has(key)) return mem.get(key);
    const b = await tx('readonly', s => s.get(key));
    if (b) mem.set(key, b);
    return b || null;
  }
  async function deletePrefix(prefix) {
    for (const k of Array.from(mem.keys())) if (k.startsWith(prefix)) mem.delete(k);
    const d = await db();
    if (!d) return;
    try {
      const t = d.transaction('blobs', 'readwrite');
      const req = t.objectStore('blobs').openCursor();
      req.onsuccess = () => { const cur = req.result; if (!cur) return; if (String(cur.key).startsWith(prefix)) cur.delete(); cur.continue(); };
    } catch (e) { /* 略過 */ }
  }

  LD.store = { persistent, loadCases, saveCases, loadPrefs, savePrefs, putBlob, getBlob, deletePrefix };
})(globalThis.LD = globalThis.LD || {});
