/* 動效與微互動：電表式數字滾輪、數字補間、燈管閃爍、點擊火花、磁吸按鈕、進場、提示訊息。
   部分效果的概念參考 React Bits（David Haz，MIT + Commons Clause），以純 JavaScript 重寫，只在這個網站內使用。
   使用者設定「減少動態效果」時，一律直接顯示結果。載入時只定義函式，不碰畫面。 */
(function (LD) {
  'use strict';

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** 第一次進入畫面時才執行 fn（沒有 IntersectionObserver 就直接執行） */
  function whenVisible(el, fn, threshold = 0.35) {
    if (typeof IntersectionObserver !== 'function') { fn(); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { threshold });
    io.observe(el);
  }

  /**
   * 電表式數字：字串裡每個數字做成一格滾輪，其他字元照原樣顯示，進入畫面時滾到定位。
   * 螢幕報讀器讀到的是完整的字串。opts：{ delay（毫秒）, immediate（不等進入畫面） }
   */
  function meter(el, text, opts = {}) {
    const s = String(text);
    let face = '', k = 0;
    for (const ch of s) {
      if (/\d/.test(ch)) face += `<span class="drum"><span class="reel" style="--d:${ch};--k:${k++}">0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9</span></span>`;
      else face += `<span class="drum-sep">${esc(ch)}</span>`;
    }
    el.innerHTML = `<span class="vh">${esc(s)}</span><span class="drums" aria-hidden="true">${face}</span>`;
    el.style.setProperty('--meter-delay', (opts.delay || 0) + 'ms');
    if (reduced()) { el.classList.add('run'); return; }
    const go = () => requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('run')));
    if (opts.immediate) go(); else whenVisible(el, go);
  }

  /** 數字補間：從 from 跑到 to，每一格用 format 顯示；最後一定停在 format(to) */
  function tween(el, from, to, format, duration = 650) {
    cancelAnimationFrame(el._tw || 0);
    if (!Number.isFinite(from) || from === to || reduced()) { el.textContent = format(to); return; }
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / duration);
      el.textContent = t < 1 ? format(from + (to - from) * easeOut(t)) : format(to);
      if (t < 1) el._tw = requestAnimationFrame(step);
    };
    el._tw = requestAnimationFrame(step);
  }

  /** 重新播放一次 CSS 動畫（燈管閃爍、進場等）：移除 class、強制重排、再加回去 */
  function replay(el, cls) {
    if (!el || reduced()) return;
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
  }

  /* ---------- 點擊火花（畫在一張蓋住整個畫面、不擋點擊的 canvas 上） ---------- */
  let cv = null, ctx = null, sparks = [], raf = 0;
  function spark(x, y, opts = {}) {
    if (reduced()) return;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.className = 'spark-layer';
      cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv);
      ctx = cv.getContext('2d');
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(innerWidth * dpr) || cv.height !== Math.round(innerHeight * dpr)) {
      cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const n = opts.count || 10, t = performance.now();
    for (let i = 0; i < n; i++) sparks.push({ x, y, a: (Math.PI * 2 * i) / n + Math.random() * 0.3, t, color: opts.color || '#FFB547', reach: opts.reach || 34 });
    if (!raf) raf = requestAnimationFrame(drawSparks);
  }
  function drawSparks(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    sparks = sparks.filter(s => now - s.t < 560);
    for (const s of sparks) {
      const p = (now - s.t) / 560, e = easeOut(p), d = e * s.reach, len = 11 * (1 - e) + 2;
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x + d * Math.cos(s.a), s.y + d * Math.sin(s.a));
      ctx.lineTo(s.x + (d + len) * Math.cos(s.a), s.y + (d + len) * Math.sin(s.a));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    raf = sparks.length ? requestAnimationFrame(drawSparks) : 0;
  }
  /** 在元素中心放火花 */
  function sparkAt(el, opts) {
    const r = el.getBoundingClientRect();
    spark(r.left + r.width / 2, r.top + r.height / 2, opts);
  }

  /** 磁吸按鈕：滑鼠靠近時按鈕微微往游標移動（只在有滑鼠的裝置） */
  function magnet(el, strength = 0.22) {
    if (!el || el._magnet || reduced() || !finePointer()) return;
    el._magnet = true;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }

  /** 燈光跟著游標：在元素上設定 --mx、--my（CSS 用 radial-gradient 畫光） */
  function follow(el) {
    if (!el || el._follow || !finePointer()) return;
    el._follow = true;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    });
  }

  /**
   * 畫面下方的提示訊息，可附一個動作按鈕（例如「復原」）。
   * opts：{ action, onAction, onExpire, timeout }。回傳一個可以提早關閉的函式。
   */
  function toast(message, opts = {}) {
    const box = document.getElementById('toast');
    if (!box) return () => {};
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(message)}</span>${opts.action ? `<button type="button" class="toast-act">${esc(opts.action)}</button>` : ''}`;
    box.appendChild(el);
    let done = false;
    const close = expired => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.classList.add('out');
      setTimeout(() => el.remove(), reduced() ? 0 : 220);
      if (expired && opts.onExpire) opts.onExpire();
    };
    const timer = setTimeout(() => close(true), opts.timeout || 5000);
    const btn = el.querySelector('.toast-act');
    if (btn) btn.addEventListener('click', () => { if (opts.onAction) opts.onAction(); close(false); });
    return () => close(true);
  }

  LD.motion = { reduced, finePointer, whenVisible, meter, tween, replay, spark, sparkAt, magnet, follow, toast };
})(globalThis.LD = globalThis.LD || {});
