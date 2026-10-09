/* 開場頁：夜裡的一條街（100 戶，其中 10 戶沒亮燈），往下捲動時一戶一戶亮燈；
   電表、市場數字、三條路小圖、五步驟展示。畫面上的金額都由 calc.js 算出來。
   street() 是純函式（只產生 SVG 字串），其餘函式在 mount() 之後才碰畫面。 */
(function (LD) {
  'use strict';

  /* ================= 街景 ================= */
  const W = 1200, H = 560, GROUND = 500, SHOP_H = 52;
  // 主街以外往左右各延伸 1400（遠方的樓、人行道、馬路），寬螢幕不會露出空白；窄螢幕從兩側裁掉
  const X0 = -1400, X1 = W + 1400;
  // 六棟房子，合計 100 戶（一扇窗一戶）。最高的大樓放在右邊，左邊低矮，讓出標題的位置。
  const BUILDINGS = [
    { x: 50, w: 190, floors: 5, cols: 4, kind: 'apt', fh: 40, tone: '#16223A', shed: true },
    { x: 256, w: 110, floors: 4, cols: 2, kind: 'house', fh: 42, tone: '#1B2944' },
    { x: 382, w: 170, floors: 5, cols: 3, kind: 'apt', fh: 40, tone: '#1A2742', plate: true },
    { x: 568, w: 200, floors: 6, cols: 3, kind: 'apt', fh: 40, tone: '#17233C', shed: true },
    { x: 784, w: 230, floors: 11, cols: 3, kind: 'tower', fh: 34, tone: '#141F36' },
    { x: 1030, w: 120, floors: 3, cols: 2, kind: 'house', fh: 42, tone: '#1C2A45' }
  ];
  // 沒亮燈的 10 戶：[棟, 樓層（0 是最上層）, 欄]，依點亮順序排列。
  // 都在橫座標 270–930 之間，手機裁掉兩側也看得到。
  const DARK = [[4, 5, 1], [2, 2, 0], [3, 1, 0], [1, 1, 1], [4, 8, 1], [2, 0, 1], [4, 2, 0], [3, 4, 0], [2, 4, 2], [4, 10, 0]];
  const SIGN = ['#C2503E', '#2D8A80', '#C4973A', '#3D63B5'];

  function rng(seed) { return () => (seed = (seed * 9301 + 49297) % 233280) / 233280; }
  const f1 = n => Math.round(n * 10) / 10;

  /**
   * 產生街景 SVG。opts：{ id（defs 用的前綴）, allLit（全部亮燈） }
   * 回傳 { svg, dark：沒亮燈那 10 戶的編號（依點亮順序）, units：總戶數 }
   * viewBox 比主街寬（X0–X1），畫面用高度決定大小、水平置中，主街永遠完整、不裁到屋頂。
   */
  function street(opts = {}) {
    const p = opts.id || 's', r = rng(17);
    const darkKey = new Map(DARK.map((d, i) => [d.join(','), i]));
    const dark = new Array(DARK.length);
    let back = '', bodies = '', glows = '', units = '', front = '';

    // 遠方的樓（主街兩側也有，寬螢幕才不會空著）
    for (let x = X0; x < X1; x += 70 + r() * 60) {
      const w = 60 + r() * 70, h = 150 + r() * 170, y = GROUND - h;
      back += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="#0F182C"/>`;
      for (let k = 0; k < 7; k++) if (r() < 0.6) back += `<rect x="${f1(x + 8 + r() * (w - 16))}" y="${f1(y + 10 + r() * (h - 30))}" width="3" height="4" fill="${r() < 0.5 ? '#8A6A3D' : '#3B4560'}" opacity=".55"/>`;
    }

    let u = 0;
    BUILDINGS.forEach((b, bi) => {
      const top = GROUND - SHOP_H - b.floors * b.fh;
      const pad = b.kind === 'tower' ? 20 : 18, gap = b.kind === 'tower' ? 12 : 14;
      const ww = (b.w - 2 * pad - (b.cols - 1) * gap) / b.cols, wh = b.fh * (b.kind === 'tower' ? 0.56 : 0.58);
      // 樓身與磁磚紋
      bodies += `<rect x="${b.x}" y="${top}" width="${b.w}" height="${GROUND - top}" fill="${b.tone}"/>`;
      if (b.kind !== 'tower') bodies += `<rect x="${b.x}" y="${top}" width="${b.w}" height="${GROUND - SHOP_H - top}" fill="url(#${p}Tile)"/>`;
      bodies += `<rect x="${b.x}" y="${top}" width="${b.w}" height="3" fill="#2A3858"/>`;
      // 屋頂
      if (b.kind === 'apt') {
        if (b.shed) {   // 鐵皮加蓋
          const sx = b.x + 14, sw = b.w * 0.55;
          bodies += `<rect x="${f1(sx)}" y="${top - 20}" width="${f1(sw)}" height="20" fill="#1E2A44"/>`;
          for (let x = sx + 4; x < sx + sw; x += 6) bodies += `<line x1="${f1(x)}" y1="${top - 20}" x2="${f1(x)}" y2="${top}" stroke="#26344F" stroke-width="1"/>`;
          bodies += `<polygon points="${f1(sx - 4)},${top - 19} ${f1(sx + sw / 2)},${top - 31} ${f1(sx + sw + 4)},${top - 19}" fill="#24324F"/>`;
        }
        const tx = b.x + b.w - 50;   // 水塔
        for (let k = 0; k < 2; k++) {
          const x = tx + k * 22;
          bodies += `<rect x="${x + 3}" y="${top - 8}" width="2" height="8" fill="#2B3854"/><rect x="${x + 13}" y="${top - 8}" width="2" height="8" fill="#2B3854"/>` +
            `<rect x="${x}" y="${top - 25}" width="18" height="17" rx="4" fill="#2C3A58"/><rect x="${x + 2}" y="${top - 23}" width="4" height="13" rx="2" fill="#3A4A6C" opacity=".7"/>`;
        }
      } else if (b.kind === 'tower') {
        const cx = b.x + b.w / 2;
        bodies += `<rect x="${cx - 32}" y="${top - 26}" width="64" height="26" fill="#18233B"/><line x1="${cx + 20}" y1="${top - 26}" x2="${cx + 20}" y2="${top - 62}" stroke="#2E3D5C" stroke-width="2"/>` +
          `<circle class="beacon" cx="${cx + 20}" cy="${top - 64}" r="2.6" fill="#FF5A47"/>`;
      } else {
        bodies += `<rect x="${b.x - 2}" y="${top - 8}" width="${b.w + 4}" height="8" fill="#24324F"/><rect x="${b.x + b.w - 30}" y="${top - 24}" width="16" height="16" rx="4" fill="#2C3A58"/>`;
      }
      // 窗戶（一扇一戶）
      for (let f = 0; f < b.floors; f++) {
        for (let c = 0; c < b.cols; c++) {
          const x = b.x + pad + c * (ww + gap), y = top + f * b.fh + (b.fh - wh) / 2 + (b.kind === 'tower' ? 2 : 0);
          const di = opts.allLit ? undefined : darkKey.get([bi, f, c].join(','));
          const isDark = di !== undefined;
          if (isDark) dark[di] = u;
          const v = r(), fill = v < 0.66 ? 'Warm' : v < 0.86 ? 'Dim' : 'Tv';
          const curtain = r() < 0.32 ? `<rect x="${f1(r() < 0.5 ? x : x + ww * 0.62)}" y="${f1(y)}" width="${f1(ww * 0.38)}" height="${f1(wh)}" fill="#7A4A16" opacity=".32"/>` : '';
          const glowFill = fill === 'Tv' ? '#7FB4F5' : '#FFB547';
          glows += `<rect class="g${isDark ? ' dark' : ''}" data-u="${u}" x="${f1(x - 5)}" y="${f1(y - 5)}" width="${f1(ww + 10)}" height="${f1(wh + 10)}" fill="${glowFill}" opacity="${isDark ? 0 : fill === 'Dim' ? 0.32 : 0.48}"/>`;
          units += `<g class="u${isDark ? ' dark' : ''}" data-u="${u}"><rect class="u-off" x="${f1(x)}" y="${f1(y)}" width="${f1(ww)}" height="${f1(wh)}" rx="1.5" fill="#09101D"/>` +
            `<line x1="${f1(x + 3)}" y1="${f1(y + wh - 3)}" x2="${f1(x + ww * 0.45)}" y2="${f1(y + 3)}" stroke="#1E2A44" stroke-width="1.4"/>` +
            `<g class="u-on"><rect x="${f1(x)}" y="${f1(y)}" width="${f1(ww)}" height="${f1(wh)}" rx="1.5" fill="url(#${p}${fill})"/>${curtain}</g>` +
            `<line x1="${f1(x + ww / 2)}" y1="${f1(y)}" x2="${f1(x + ww / 2)}" y2="${f1(y + wh)}" stroke="#0C1424" stroke-opacity=".5" stroke-width="1.2"/></g>`;
          // 鐵窗、冷氣、陽台欄杆
          if (b.kind !== 'tower' && (f >= b.floors - 2 || r() < 0.35)) {
            units += `<rect x="${f1(x - 3)}" y="${f1(y - 3)}" width="${f1(ww + 6)}" height="${f1(wh + 6)}" fill="none" stroke="#3A4866" stroke-width="1.3"/>`;
            for (let bx = x + 3; bx < x + ww; bx += 5) units += `<line x1="${f1(bx)}" y1="${f1(y - 3)}" x2="${f1(bx)}" y2="${f1(y + wh + 3)}" stroke="#2F3C58" stroke-width=".9" opacity=".8"/>`;
          }
          if (b.kind === 'apt' && r() < 0.32) units += `<rect x="${f1(x + ww - 15)}" y="${f1(y + wh + 5)}" width="15" height="8" rx="1" fill="#2A3753"/><circle cx="${f1(x + ww - 7.5)}" cy="${f1(y + wh + 9)}" r="2.6" fill="none" stroke="#3E4D6E" stroke-width="1"/>`;
          if (b.kind === 'tower') units += `<line x1="${f1(x - 4)}" y1="${f1(y + wh + 5)}" x2="${f1(x + ww + 4)}" y2="${f1(y + wh + 5)}" stroke="#2C3A57" stroke-width="2"/>`;
          u++;
        }
      }
      // 一樓：騎樓、店面或鐵捲門、招牌
      const sy = GROUND - SHOP_H;
      front += `<rect x="${b.x}" y="${sy}" width="${b.w}" height="${SHOP_H}" fill="#0B1220"/><rect x="${b.x}" y="${sy}" width="${b.w}" height="6" fill="#1F2B46"/>`;
      const bays = Math.max(1, Math.round(b.w / 72)), bw = b.w / bays;
      for (let k = 0; k < bays; k++) {
        const bx = b.x + k * bw;
        if (r() < 0.55) front += `<rect x="${f1(bx + 8)}" y="${sy + 14}" width="${f1(bw - 16)}" height="${SHOP_H - 14}" fill="url(#${p}Shop)"/>`;
        else {
          front += `<rect x="${f1(bx + 8)}" y="${sy + 14}" width="${f1(bw - 16)}" height="${SHOP_H - 14}" fill="#222E46"/>`;
          for (let ly = sy + 18; ly < GROUND; ly += 4) front += `<line x1="${f1(bx + 8)}" y1="${ly}" x2="${f1(bx + bw - 8)}" y2="${ly}" stroke="#2D3A55" stroke-width="1"/>`;
        }
        front += `<rect x="${f1(bx + 6)}" y="${sy - 13}" width="${f1(bw - 12)}" height="10" rx="1.5" fill="${SIGN[Math.floor(r() * SIGN.length)]}" opacity=".5"/>`;
        front += `<rect x="${f1(bx)}" y="${sy + 6}" width="7" height="${SHOP_H - 6}" fill="#18233A"/>`;
      }
      if (b.plate) front += `<rect x="${b.x + 14}" y="${sy + 20}" width="12" height="7" rx="1" fill="#1D4E9E" stroke="#DCE6F7" stroke-width=".8"/>`;   // 門牌
    });
    // 直立招牌
    front += `<rect x="236" y="${GROUND - SHOP_H - 96}" width="13" height="78" rx="2" fill="#B8473A" opacity=".75"/><rect x="239" y="${GROUND - SHOP_H - 90}" width="7" height="66" rx="1" fill="#F2C9A8" opacity=".35"/>` +
      `<rect x="753" y="${GROUND - SHOP_H - 84}" width="13" height="66" rx="2" fill="#2C8178" opacity=".75"/><rect x="756" y="${GROUND - SHOP_H - 78}" width="7" height="54" rx="1" fill="#BFE7DF" opacity=".3"/>`;
    // 人行道、馬路、路燈
    front += `<rect x="${X0}" y="${GROUND}" width="${X1 - X0}" height="14" fill="#111A2D"/><rect x="${X0}" y="${GROUND + 14}" width="${X1 - X0}" height="2" fill="#1F2A42"/><rect x="${X0}" y="${GROUND + 16}" width="${X1 - X0}" height="${H - GROUND - 16}" fill="#0A101D"/>`;
    for (let x = X0 + 10; x < X1; x += 64) front += `<rect x="${x}" y="${GROUND + 37}" width="30" height="2" fill="#26314A"/>`;
    for (const lx of [-380, -60, 620, 1022, 1300, 1640]) {
      front += `<polygon points="${lx + 16},${GROUND - 151} ${lx + 26},${GROUND - 151} ${lx + 82},${GROUND} ${lx - 36},${GROUND}" fill="url(#${p}Cone)"/>` +
        `<ellipse cx="${lx + 21}" cy="${GROUND + 6}" rx="56" ry="6" fill="#FFC56B" opacity=".14"/>` +
        `<rect x="${lx - 2}" y="${GROUND - 150}" width="4" height="150" fill="#2A3753"/><path d="M${lx} ${GROUND - 150} q 6 -8 20 -6" stroke="#2A3753" stroke-width="3" fill="none"/>` +
        `<rect x="${lx + 14}" y="${GROUND - 158}" width="15" height="5" rx="2" fill="#FFE3AA"/>`;
    }

    const defs = `<defs>
      <linearGradient id="${p}Warm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFDB93"/><stop offset="1" stop-color="#FFAC3E"/></linearGradient>
      <linearGradient id="${p}Dim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0B460"/><stop offset="1" stop-color="#C9802B"/></linearGradient>
      <linearGradient id="${p}Tv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B4DAFF"/><stop offset="1" stop-color="#5F95DE"/></linearGradient>
      <linearGradient id="${p}Shop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7C277" stop-opacity=".85"/><stop offset="1" stop-color="#C98A3A" stop-opacity=".55"/></linearGradient>
      <linearGradient id="${p}Cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC56B" stop-opacity=".34"/><stop offset="1" stop-color="#FFC56B" stop-opacity="0"/></linearGradient>
      <pattern id="${p}Tile" width="10" height="6" patternUnits="userSpaceOnUse"><path d="M0 5.5H10" stroke="#FFFFFF" stroke-opacity=".035"/></pattern>
      <filter id="${p}Glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
    </defs>`;
    const svg = `<svg viewBox="${X0} 0 ${X1 - X0} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${defs}${back}${bodies}<g class="glows" filter="url(#${p}Glow)">${glows}</g>${units}${front}</svg>`;
    return { svg, dark, units: u };
  }

  /** 夜空的星星（開場整個舞台的背景） */
  function sky() {
    const r = rng(5);
    let s = '';
    for (let i = 0; i < 64; i++) s += `<circle cx="${f1(r() * 1600)}" cy="${f1(r() * 560)}" r="${f1(0.5 + r() * 0.9)}" fill="#DCE6F7" opacity="${f1(0.16 + r() * 0.5)}"/>`;
    return `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMin slice" aria-hidden="true">${s}</svg>`;
  }

  /* ================= 示範數字（全部由 calc.js 計算） ================= */
  function demoNumbers() {
    const m = LD.demo.mainDemo();
    const lines = LD.calc.autoRepairLines(m.diagnosis).map(l => ({ ...l, on: true }));
    const totals = LD.calc.repairTotals(lines, m.case.ping);
    const res = LD.calc.computePaths({ ...m.calc, city: m.case.city }, totals.mid, LD.RULES, LD.NATIONAL);
    const repairs = lines.map(l => { const [lo, hi] = LD.calc.lineCost(l, m.case.ping); return { ...l, lo, hi, name: LD.CATALOG[l.id].name }; });
    return { m, lines, totals, res, repairs };
  }

  /* ================= 畫面 ================= */
  const S = { mounted: false, dark: [], lit: new Set(), manual: new Set(), raf: 0, teaserW: 0, active: 0 };
  const $ = s => document.querySelector(s);

  function setLit(i, on, animate) {
    const id = S.dark[i];
    if (id === undefined) return;
    if (on) S.lit.add(i); else { S.lit.delete(i); S.manual.delete(i); }
    document.querySelectorAll(`#street [data-u="${id}"]`).forEach(el => {
      el.classList.toggle('lit', on);
      if (on && animate) LD.motion.replay(el, 'flick');
    });
    updateCount();
  }
  function updateCount() {
    const n = S.lit.size, out = $('#litCount'), wins = $('#litWins');
    if (wins) {
      if (wins.children.length !== S.dark.length) wins.innerHTML = '<i></i>'.repeat(S.dark.length);
      Array.from(wins.children).forEach((w, i) => w.classList.toggle('on', i < n));
    }
    if (out) out.textContent = n >= S.dark.length ? `${S.dark.length} 戶全部亮燈` : `已點亮 ${n} / ${S.dark.length} 戶`;
    const hero = $('#hero');
    if (hero) hero.classList.toggle('all-lit', n >= S.dark.length);
  }

  function heroProgress() {
    const hero = $('#hero'), stage = hero && hero.querySelector('.hero-stage');
    if (!hero || !stage || hero.offsetParent === null) return null;
    const total = hero.offsetHeight - stage.offsetHeight;
    if (total < 40) return null;   // 減少動態效果時不做捲動亮燈
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    return Math.min(1, Math.max(0, (top - hero.getBoundingClientRect().top) / total));
  }
  function onScroll() {
    if (S.raf) return;
    S.raf = requestAnimationFrame(() => {
      S.raf = 0;
      const p = heroProgress();
      if (p === null) return;
      const n = Math.min(S.dark.length, Math.floor(p * (S.dark.length + 1.4)));
      for (let i = 0; i < S.dark.length; i++) {
        const want = i < n;
        if (want && !S.lit.has(i)) setLit(i, true, true);
        else if (!want && S.lit.has(i) && !S.manual.has(i)) setLit(i, false, false);
      }
    });
  }
  function lightAll() {
    const rest = S.dark.map((_, i) => i).filter(i => !S.lit.has(i));
    rest.forEach((i, k) => setTimeout(() => { S.manual.add(i); setLit(i, true, true); }, LD.motion.reduced() ? 0 : k * 140));
  }

  function renderTeaser() {
    const box = $('#teaserChart');
    if (!box) return;
    const w = Math.round(box.clientWidth || 0);
    if (!w || Math.abs(w - S.teaserW) < 4) return;
    S.teaserW = w;
    const { res, m } = demoNumbers();
    box.innerHTML = LD.charts.lineChartSVG(res, m.calc.mode, false, w).svg;
    LD.motion.whenVisible(box, () => box.classList.add('draw'), 0.4);
  }

  function fillNumbers() {
    const { wan } = LD.util;
    const { m, totals, res, repairs, lines } = demoNumbers();
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    set('teaserGap', wan(res.C.total - res.A.total));
    set('teaserNote', `示範案例：整理費用約 ${wan(totals.mid)}，月租 ${LD.util.fmt(m.calc.rent)} 元，社宅包租 8 折。`);
    set('mockReno', wan(totals.mid));
    const bars = document.getElementById('mockBars');
    if (bars) bars.innerHTML = LD.charts.barsHTML(res, m.calc.mode);
    const checks = document.getElementById('mockChecks');
    if (checks) checks.innerHTML = LD.deed.deedChecks(m.deedFields).slice(0, 3).map(c => `<li><span class="st ${c.s}">${c.l}</span><span>${LD.util.esc(c.t)}</span></li>`).join('');
    const title = m.case.addr.replace(/（示範）/, '') + ' ' + m.case.ping + ' 坪';
    set('mockMsg', LD.report.lineMessage({ title, ready: true, res, repairs: repairs.length ? repairs : lines, totals, mode: m.calc.mode }));
  }

  function setupHow() {
    const screens = Array.from(document.querySelectorAll('.how-screen'));
    const btns = Array.from(document.querySelectorAll('#howList [data-how]'));
    const activate = n => {
      if (n === S.active) return;
      S.active = n;
      btns.forEach(b => { if (Number(b.dataset.how) === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
      screens.forEach(s => s.classList.toggle('is-active', Number(s.dataset.how) === n));
    };
    activate(1);
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(entries => {
        for (const e of entries) if (e.isIntersecting) activate(Number(e.target.dataset.how));
      }, { rootMargin: '-45% 0px -45% 0px' });
      screens.forEach(s => io.observe(s));
    }
    btns.forEach(b => b.addEventListener('click', () => {
      const s = screens.find(x => x.dataset.how === b.dataset.how);
      if (s) s.scrollIntoView({ behavior: LD.motion.reduced() ? 'auto' : 'smooth', block: 'center' });
    }));
  }

  function mount() {
    if (S.mounted || !$('#street')) return;
    S.mounted = true;
    const hero = street({ id: 'hs' });
    $('#street').innerHTML = hero.svg;
    if ($('#sky')) $('#sky').innerHTML = sky();
    S.dark = hero.dark;
    const dawn = $('#dawnStreet');
    if (dawn) dawn.innerHTML = street({ id: 'ds', allLit: true }).svg;
    $('#street').addEventListener('click', e => {
      const g = e.target.closest('.u.dark');
      if (!g || g.classList.contains('lit')) return;
      const i = S.dark.indexOf(Number(g.dataset.u));
      if (i < 0) return;
      S.manual.add(i);
      setLit(i, true, true);
      LD.motion.spark(e.clientX, e.clientY);
    });
    const all = $('#btnLightAll');
    if (all) all.addEventListener('click', lightAll);
    LD.motion.meter($('#heroMeter'), '0028', { immediate: true, delay: 450 });
    document.querySelectorAll('#view-intro [data-meter]').forEach(el => LD.motion.meter(el, el.dataset.meter));
    document.querySelectorAll('#view-intro .magnet').forEach(el => LD.motion.magnet(el));
    fillNumbers();
    setupHow();
    addEventListener('scroll', onScroll, { passive: true });
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { renderTeaser(); onScroll(); }, 150); });
    updateCount();
  }
  /** 開場頁顯示時呼叫：量寬度畫小圖，依捲動位置更新亮燈 */
  function enter() {
    mount();
    renderTeaser();
    onScroll();
  }
  /** 示範圖片準備好時呼叫：{ before, after, deed }（data: 網址） */
  function setImages(img) {
    const set = (id, src) => { const el = document.getElementById(id); if (el && src) el.src = src; };
    set('mockPhoto', img.before); set('mockBefore', img.before); set('mockAfter', img.after); set('mockDeed', img.deed);
  }

  LD.intro = { street, sky, DARK, mount, enter, setImages };
})(globalThis.LD = globalThis.LD || {});
