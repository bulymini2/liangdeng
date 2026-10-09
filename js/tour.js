/* 一鍵導覽：聚光燈框住畫面上的區塊，旁邊一張說明卡。步驟內容由 app.js 提供。
   steps：[{ before: async () => {}, target: 'CSS 選擇器', title, text }] */
(function (LD) {
  'use strict';

  const $ = s => document.querySelector(s);
  let steps = [], i = 0, timer = null, active = false, onEnd = null, seq = 0;
  const AUTO_MS = 7000;

  /** 畫面上方固定不動的區域高度（上方列＋拜訪頁的步驟列），捲動時要避開 */
  function headerOffset() {
    let h = 0;
    for (const el of document.querySelectorAll('.topbar, .visit-head')) {
      if (!el.offsetHeight) continue;
      const top = parseFloat(getComputedStyle(el).top) || 0;
      h = Math.max(h, top + el.offsetHeight);
    }
    return h + 16;
  }

  function place() {
    if (!active) return;
    const s = steps[i];
    const el = s.target && document.querySelector(s.target);
    const spot = $('#tourSpot'), card = $('#tourCard');
    const r = el && el.getBoundingClientRect();
    if (r && r.width) {
      const pad = 8;
      Object.assign(spot.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px', opacity: 1 });
      // 卡片放在目標下方，放不下就放上方，再不行就放畫面下緣（手機版由 CSS 固定在底部）
      const cw = card.offsetWidth, ch = card.offsetHeight, vw = innerWidth, vh = innerHeight;
      let top = r.bottom + 16;
      if (top + ch > vh - 12) top = r.top - ch - 16;
      if (top < 12) top = vh - ch - 16;
      const left = Math.max(16, Math.min(vw - cw - 16, r.left));
      Object.assign(card.style, { top: top + 'px', left: left + 'px' });
    } else {
      Object.assign(spot.style, { left: '50%', top: '50%', width: '0px', height: '0px', opacity: 0 });
      Object.assign(card.style, { top: Math.max(16, innerHeight / 2 - card.offsetHeight / 2) + 'px', left: Math.max(16, innerWidth / 2 - card.offsetWidth / 2) + 'px' });
    }
  }

  async function show(n) {
    clearTimeout(timer);
    const my = ++seq;
    i = Math.max(0, Math.min(steps.length - 1, n));
    const s = steps[i];
    $('#tourCount').textContent = `${i + 1} / ${steps.length}`;
    $('#tourTitle').textContent = s.title;
    $('#tourText').textContent = s.text;
    $('#tourBar').style.width = ((i + 1) / steps.length * 100) + '%';
    $('#tourPrev').disabled = i === 0;
    $('#tourNext').textContent = i === steps.length - 1 ? '完成' : '下一步';
    if (s.before) await s.before();
    if (my !== seq || !active) return;   // 等待期間又按了下一步或結束導覽
    const el = s.target && document.querySelector(s.target);
    if (el) {
      const r = el.getBoundingClientRect();
      // 太高的區塊只對齊上緣，避免卡片被擠出畫面
      const head = headerOffset();
      const y = window.scrollY + r.top - (r.height > innerHeight * 0.55 ? head : Math.max(head, (innerHeight - r.height) / 3));
      window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
    }
    requestAnimationFrame(() => requestAnimationFrame(place));
    if ($('#tourAuto').checked && i < steps.length - 1) timer = setTimeout(() => show(i + 1), AUTO_MS);
  }

  function start(list, end) {
    steps = list; onEnd = end; active = true;
    $('#tour').hidden = false;
    document.documentElement.classList.add('touring');
    show(0);
    $('#tourNext').focus({ preventScroll: true });
  }
  function stop() {
    if (!active) return;
    active = false; seq++; clearTimeout(timer);
    $('#tour').hidden = true;
    document.documentElement.classList.remove('touring');
    if (onEnd) onEnd();
  }
  const next = () => (i >= steps.length - 1 ? stop() : show(i + 1));

  function bind() {
    $('#tourNext').addEventListener('click', next);
    $('#tourPrev').addEventListener('click', () => show(i - 1));
    $('#tourExit').addEventListener('click', stop);
    $('#tourAuto').addEventListener('change', () => show(i));
    addEventListener('resize', place);
    addEventListener('scroll', place, { passive: true });
    addEventListener('keydown', e => {
      if (!active) return;
      if (e.key === 'Escape') { stop(); return; }
      if (e.target.closest && e.target.closest('input,select,textarea')) return;   // 正在操作表單時不搶方向鍵
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
    });
  }

  LD.tour = { start, stop, bind, isActive: () => active };
})(globalThis.LD = globalThis.LD || {});
