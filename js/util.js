/* 共用小工具：數字格式與 HTML 跳脫。
   每個 js/ 檔案都把功能掛在全域的 LD 底下，瀏覽器直接用 <script> 載入，Node 測試用 vm 載入。 */
(function (LD) {
  'use strict';

  const nf = new Intl.NumberFormat('zh-TW');

  /** 跳脫 HTML 特殊字元，所有放進 innerHTML 的文字都要經過這裡。 */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** 1234567 → "1,234,567" */
  const fmt = n => nf.format(Math.round(n));

  /** 以「萬」顯示：177000 → "17.7 萬"；100 萬以上取整數：1416375 → "142 萬" */
  const wan = n => {
    const w = n / 10000;
    const s = Math.abs(w) >= 100 ? Math.round(w) : Math.round(w * 10) / 10;
    return nf.format(s) + ' 萬';
  };

  /** 0.026 → "2.6%" */
  const pct = r => (Math.round(r * 10000) / 100) + '%';

  const clampInt = (v, d, lo, hi) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };

  const today = (d = new Date()) =>
    d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');

  const uid = () => Math.random().toString(36).slice(2, 9);

  /** 含中文的網址先編碼，已編碼的保持原樣。 */
  const hrefOf = u => /[^\x00-\x7F]/.test(u) ? encodeURI(u) : u;

  /** 把來源代碼（LD.SRC 的 key）變成連結清單。 */
  function srcLinks(keys) {
    return keys.map(k => {
      const s = LD.SRC[k];
      return `<a href="${esc(hrefOf(s.u))}" target="_blank" rel="noopener">${esc(s.t)}</a>`;
    }).join('、');
  }

  LD.util = { esc, fmt, wan, pct, clampInt, today, uid, hrefOf, srcLinks };
})(globalThis.LD = globalThis.LD || {});
