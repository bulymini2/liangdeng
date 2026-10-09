/* 畫面、狀態與路由。三個畫面：開場（#intro）、案件總覽（#cases）、拜訪流程（#visit/案件ID/步驟）。
   資料格式在 pipeline.js、保存在 store.js、金額在 calc.js；這裡只負責把它們接到畫面上。 */
(function (LD) {
  'use strict';

  const { esc, fmt, wan, pct, clampInt, today, uid, srcLinks } = LD.util;
  const { computePaths, rankPaths, pathName, conclusionText, lineCost, repairTotals, autoRepairLines } = LD.calc;
  const P = LD.pipeline;
  const { STATUSES, STATUS, DEFAULT_FEES } = P;
  const { CATALOG, ITEM_LABEL, ROOMS, CONCERNS, RULES, NATIONAL, SRC } = LD;
  const platform = LD.platform, store = LD.store;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const pad2 = n => String(n).padStart(2, '0');
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const md = s => s ? s.slice(5).replace('-', '/') : '';
  const stamp = () => new Date().toISOString();

  /* ================= 狀態 ================= */
  const prefs = store.loadPrefs();
  function fees() {
    const f = prefs.fees, n = (v, d) => Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d;
    if (!f || !f.devFee) return DEFAULT_FEES;
    return { devFee: { '包租': n(f.devFee['包租'], 18000), '代管': n(f.devFee['代管'], 13000) }, serviceFee: n(f.serviceFee, 2500) };
  }
  const autoLines = d => autoRepairLines(d).map(l => ({ key: uid(), auto: true, on: true, qty: 1, ...l }));
  function withRepairs(c) { if (!Array.isArray(c.repairs)) c.repairs = autoLines(c.diagnosis); return c; }

  let userCases = store.loadCases().map(c => P.normalizeCase(c, isoDate())).filter(Boolean).map(withRepairs);
  let demoCases = [];
  let C = null;                 // 目前開啟的案件
  const BL = {};                // 圖片：圖片 ID → { blob, url（data URL）, w, h }
  let listFilter = 'all';
  let currentView = null;
  let shownHash = null;

  function buildDemos() {
    const main = withRepairs(LD.demo.mainDemo());
    main.after.afterId = 'demo-after';
    main.deedImgId = 'demo-deed';
    demoCases = [main, ...LD.demo.otherDemos()];
  }
  buildDemos();

  const blobToDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const imageOf = async (blob, w, h) => ({ blob, url: await blobToDataURL(blob), w: w || 0, h: h || 0 });
  function dataURLToBlob(url) {
    const comma = url.indexOf(',');
    const mime = url.slice(5, url.indexOf(';'));
    const bin = atob(url.slice(comma + 1)), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  /** 示範圖片：程式畫好的插圖轉成 JPEG（AI 也能讀），只放在記憶體 */
  const demoReady = (async () => {
    const m = LD.demo.mainDemo();
    const jobs = m.photos.map(p => [p.id, LD.demo.room(p.art, false), p.w, p.h])
      .concat([['demo-after', LD.demo.room(m.after.afterArt, true), 800, 600], ['demo-deed', LD.demo.deedSVG(), 800, 900]]);
    for (const [id, svg, w, h] of jobs) {
      try { BL[id] = await imageOf(await LD.demo.svgToJpeg(svg, w, h), w, h); } catch (e) { /* 示範圖失敗不影響其他功能 */ }
    }
  })();

  const allCases = () => (prefs.showDemo ? demoCases : []).concat(userCases);
  const findCase = id => demoCases.find(c => c.id === id) || userCases.find(c => c.id === id);

  /* ---------- 保存（示範案件不保存；空白案件不保存） ---------- */
  let saveTimer = null, saveOK = true;
  function persist() {
    clearTimeout(saveTimer); saveTimer = null;
    saveOK = store.saveCases(userCases.filter(c => !P.isBlankCase(c)));
    renderStoreWarn();
  }
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400); };
  const flush = () => { if (saveTimer) persist(); };
  function markChanged(c) { if (c && !c.demo) { c.updatedAt = stamp(); scheduleSave(); } }
  const touch = () => markChanged(C);
  function renderStoreWarn() {
    const relevant = currentView === 'cases' || (currentView === 'visit' && C && !C.demo);
    $('#storeWarn').hidden = !relevant || (store.persistent && saveOK);
  }
  function keepImage(id, im) {
    BL[id] = im;
    if (C && !C.demo) store.putBlob(C.id + '/' + id, im.blob);
  }
  async function loadImages(c) {
    if (c.demo) { await demoReady; return; }
    for (const id of P.imageIds(c)) {
      if (BL[id]) continue;
      const blob = await store.getBlob(c.id + '/' + id);
      if (blob) { try { BL[id] = await imageOf(blob); } catch (e) { /* 略過壞掉的圖片 */ } }
    }
  }

  /* ================= 衍生資料 ================= */
  const ping = (c = C) => c.case.ping || 0;
  const totals = (c = C) => repairTotals(c.repairs || [], ping(c));
  const renoUsed = (c = C) => c.calc.renoAuto ? totals(c).mid : c.calc.reno;
  const result = (c = C) => computePaths({ ...c.calc, city: c.case.city }, renoUsed(c), RULES, NATIONAL);
  const calcReady = (c = C) => c.calc.rent > 0 && c.calc.houseValue > 0;
  const name = k => pathName(k, C.calc.mode);
  const cityName = (c = C) => RULES[c.case.city].name;
  /** 案件名稱（放在門牌上）：地址，沒有地址就用縣市 */
  function caseName(c = C) {
    const addr = (c.case.addr || '').replace(/（示範）/, '').trim();
    return addr || (c.case.ping ? cityName(c) + '的房子' : '新案件');
  }
  const pingText = (c = C) => c.case.ping ? `${c.case.ping} 坪` : '';
  /** 文字用的完整名稱（LINE 訊息、CSV、AI 說明）：地址加坪數 */
  function caseTitle(c = C) { const n = caseName(c), pt = pingText(c); return pt && n !== '新案件' ? `${n} ${pt}` : n; }
  /** 這個案件五個步驟各自完成了沒（依資料判斷，給案件列表的五扇窗用） */
  function doneSteps(c) {
    return [(c.repairs || []).some(l => l.on), !!(c.after.afterId && c.after.photoId), !!c.deedFields, calcReady(c), !!c.explanation || c.status !== 'visit'];
  }
  function view() {
    return {
      case: C.case, cityName: cityName(), title: caseTitle(), mode: C.calc.mode,
      res: result(), ready: calcReady(), totals: totals(),
      repairs: C.repairs.map(l => { const [lo, hi] = lineCost(l, ping()); return { ...l, lo, hi, name: l.id === 'custom' ? l.name : CATALOG[l.id].name }; }),
      diagnosis: C.diagnosis, checks: C.deedFields ? LD.deed.deedChecks(C.deedFields) : [],
      explanation: C.explanation, demo: C.demo, date: today()
    };
  }

  /* ================= 路由 ================= */
  function parseHash(h) {
    h = String(h == null ? location.hash : h).replace(/^#/, '');
    const m = h.match(/^visit\/([A-Za-z0-9_-]{1,64})(?:\/(\d))?$/);
    if (m) return { view: 'visit', id: m[1], step: clampInt(m[2], 0, 0, 5) };   // 0：回到案件上次的步驟
    if (h === 'cases' || h === 'intro') return { view: h };
    return { view: prefs.seenIntro ? 'cases' : 'intro' };
  }
  function setHash(h, replace) {
    shownHash = h;
    if (location.hash === h) return;
    try { history[replace ? 'replaceState' : 'pushState'](null, '', h); }
    catch (e) { try { location.hash = h; } catch (e2) { /* 不能改網址時只更新畫面 */ } }
  }
  async function nav(r, replace) {
    setHash(r.view === 'visit' ? `#visit/${r.id}` + (r.step ? '/' + r.step : '') : '#' + r.view, replace);
    await render(r);
  }
  function onHistory() {
    if (location.hash === shownHash) return;
    shownHash = location.hash;
    render(parseHash());
  }
  /** 離開一個什麼都沒填的新案件時，直接丟掉，不計入總覽 */
  function leaveBlank(r) {
    if (!C || C.demo || !P.isBlankCase(C) || (r.view === 'visit' && r.id === C.id)) return;
    const id = C.id;
    userCases = userCases.filter(c => c.id !== id);
    C = null;
    persist();
  }
  async function render(r) {
    flush();
    leaveBlank(r);
    if (r.view === 'visit') {
      const c = findCase(r.id);
      if (!c) return nav({ view: 'cases' }, true);
      if (c !== C) {
        abortAll();
        C = withRepairs(c);
        await loadImages(c);
        if (C !== c) return;   // 載入圖片時又切換了案件
        renderVisitAll();
      } else renderCaseHead();
      showView('visit');
      go(r.step || C.step || 1, true);
    } else {
      showView(r.view);
      if (r.view === 'cases') renderCases();
      if (r.view === 'intro') {
        LD.intro.enter();
        if (!prefs.seenIntro) { prefs.seenIntro = true; store.savePrefs(prefs); }
      }
      window.scrollTo(0, 0);
    }
  }
  function showView(v) {
    const changed = currentView !== v;
    currentView = v;
    $$('main[data-view]').forEach(el => { el.hidden = el.dataset.view !== v; });
    if (changed && v !== 'intro') LD.motion.replay($(`main[data-view="${v}"]`), 'enter');
    $$('[data-nav]').forEach(a => { if (a.dataset.nav === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    updateAIState();
    renderStoreWarn();
  }
  const openCase = (id, step) => nav({ view: 'visit', id, step: step || 0 });
  function newCase() {
    const c = P.blankCase('c' + Date.now().toString(36) + uid(), isoDate());
    c.updatedAt = stamp();
    userCases.unshift(c);
    openCase(c.id, 1);
  }

  /* ================= 案件總覽 ================= */
  function caseBest(c) {
    if (!calcReady(c)) return null;
    const best = rankPaths(result(c))[0];
    return { name: pathName(best.key, c.calc.mode), total: best.total };
  }
  function statusPill(s) { const st = STATUS[s] || STATUS.visit; return `<span class="pill t-${st.tone}">${st.label}</span>`; }
  function kpisHTML(s) {
    return `
      <div class="kpi"><span>拜訪</span><b class="num">${s.visits}<small>戶</small></b><em>進行中 ${s.openCases} 戶</em></div>
      <div class="kpi"><span>已出報告</span><b class="num">${s.reported}<small>戶</small></b><em>出報告率 ${Math.round(s.reportRate * 100)}%</em></div>
      <div class="kpi"><span>已簽約</span><b class="num">${s.signed}<small>戶</small></b><em>簽約率\u00a0${Math.round(s.signRate * 100)}%，已決定的\u00a0${s.decided}\u00a0戶成交\u00a0${Math.round(s.closeRate * 100)}%</em></div>
      <div class="kpi lit"><span>預估開發費收入</span><b class="num">${fmt(s.devIncome)}<small>元</small></b><em>亮燈服務費 ${fmt(s.serviceIncome)} 元</em></div>`;
  }
  function renderCases() {
    const list = allCases();
    const s = P.pipelineStats(list, fees());
    $('#kpis').innerHTML = kpisHTML(s);
    const bar = (label, n, cls) => `<div class="fn-row"><div class="fn-top"><span>${label}</span><b>${n}</b></div><div class="fn-track"><div class="fn-bar ${cls}" style="width:${s.visits ? Math.max(2, n / s.visits * 100) : 0}%"></div></div></div>`;
    $('#funnel').innerHTML = `<div class="funnel">${bar('拜訪', s.visits, '')}${bar('出報告', s.reported, 'l2')}${bar('簽約', s.signed, 'l3')}</div>`;
    $('#funnelNote').textContent = prefs.showDemo ? '含示範案件' : '';

    const fu = P.followUps(list, isoDate());
    $('#followList').innerHTML = fu.length
      ? fu.map(({ c, overdue }) => `<li><span class="date-chip${overdue ? ' over' : ''}">${md(c.followUp)}${overdue ? ' 已過' : ''}</span><span><a href="#visit/${esc(c.id)}/5" data-open="${esc(c.id)}" data-step="5">${esc(caseName(c))}</a> ${statusPill(c.status)}</span></li>`).join('')
      : '<li class="hint">目前沒有要追蹤的案件。在報告頁設定「下次追蹤日期」就會出現在這裡。</li>';

    $('#statusFilter').innerHTML = [{ key: 'all', label: '全部' }].concat(STATUSES).map(o => `<button type="button" role="radio" data-filter="${o.key}" aria-checked="${listFilter === o.key}">${o.label}</button>`).join('');
    $('#showDemo').checked = prefs.showDemo;

    const rows = list.filter(c => listFilter === 'all' || c.status === listFilter);
    $('#caseList').innerHTML = rows.length ? rows.map(c => {
      const b = caseBest(c), id = esc(c.id), done = doneSteps(c);
      const meta = [cityName(c), c.case.ping ? c.case.ping + ' 坪' : '', c.case.age ? '屋齡 ' + c.case.age + ' 年' : '', '建立 ' + md(c.createdAt)].filter(Boolean);
      return `<div class="case-row" data-open="${id}">
        <span class="case-wins" role="img" aria-label="五個步驟完成 ${done.filter(Boolean).length} 個">${done.map(d => `<i${d ? ' class="on"' : ''}></i>`).join('')}</span>
        <div class="case-main">
          <div class="case-name"><a href="#visit/${id}/${c.step || 1}" data-open="${id}">${esc(caseName(c))}</a>${statusPill(c.status)}${c.demo ? '<span class="pill pill-demo">示範</span>' : ''}</div>
          <div class="case-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}${c.note ? `<span>${esc(c.note)}</span>` : ''}</div>
        </div>
        <div class="case-best">${b ? `<span>十年最佳：${esc(b.name)}</span><b class="num">${wan(b.total)}</b>` : '<span>尚未試算</span>'}</div>
        <div class="case-actions">
          <label><span class="vh">狀態</span><select data-status-of="${id}">${STATUSES.map(st => `<option value="${st.key}"${st.key === c.status ? ' selected' : ''}>${st.label}</option>`).join('')}</select></label>
          ${c.followUp ? `<span class="date-chip">追蹤 ${md(c.followUp)}</span>` : ''}
          ${c.demo ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-del="${id}">刪除</button>`}
        </div>
      </div>`;
    }).join('') : `<div class="empty"><span>${listFilter === 'all' ? '還沒有案件。拜訪屋主時按「新拜訪」，做完五個步驟就會出現在這裡。' : '這個狀態目前沒有案件。'}</span>${listFilter === 'all' ? '<button type="button" class="btn btn-primary" data-action="new-case">新拜訪</button>' : ''}</div>`;

    const f = fees();
    $('#feeLease').value = f.devFee['包租']; $('#feeManage').value = f.devFee['代管']; $('#feeService').value = f.serviceFee;
  }
  function exportCSV() {
    const rows = allCases().map(c => {
      const res = calcReady(c) ? result(c) : null;
      return { created: c.createdAt, title: caseTitle(c), city: cityName(c), ping: c.case.ping || '', age: c.case.age || '', status: (STATUS[c.status] || STATUS.visit).label, followUp: c.followUp || '', mode: c.calc.mode, reno: renoUsed(c) || '', vacant: res ? res.A.total : '', self: res ? res.B.total : '', social: res ? res.C.total : '', note: c.note || '', demo: c.demo };
    });
    const d = today().replace(/\//g, '');
    platform.saveFile(`亮燈案件-${d}.csv`, P.casesCSV(rows), `liangdeng-cases-${d}.csv`, 'text/csv;charset=utf-8')
      .then(() => setStatus('#casesStatus', '已匯出 CSV，可以用 Excel 或 Google 試算表開啟。'))
      .catch(e => setStatus('#casesStatus', e && e.code === 'declined' ? '已取消匯出。' : '這個檢視不能下載檔案。'));
  }

  /* ---------- 備份與還原 ---------- */
  async function backup() {
    const st = '#backupStatus';
    flush();
    const list = userCases.filter(c => !P.isBlankCase(c));
    if (!list.length) { setStatus(st, '還沒有自己的案件可以備份（示範案件不需要備份）。'); return; }
    if (!platform.canSave()) { setStatus(st, '這個檢視不能下載檔案。'); return; }
    setStatus(st, '正在準備備份檔…', true);
    const images = {};
    for (const c of list) {
      for (const id of P.imageIds(c)) {
        try {
          if (BL[id]) images[c.id + '/' + id] = BL[id].url;
          else { const b = await store.getBlob(c.id + '/' + id); if (b) images[c.id + '/' + id] = await blobToDataURL(b); }
        } catch (e) { /* 單張讀不到就略過 */ }
      }
    }
    const d = today().replace(/\//g, '');
    const data = JSON.stringify({ app: 'liangdeng', kind: 'backup', version: 1, exportedAt: stamp(), cases: list, images });
    try {
      await platform.saveFile(`亮燈備份-${d}.json`, data, `liangdeng-backup-${d}.json`, 'application/json');
      setStatus(st, `已備份 ${list.length} 件案件、${Object.keys(images).length} 張圖片。`);
    } catch (e) {
      setStatus(st, e && e.code === 'declined' ? '已取消備份。' : '這個檢視不能下載檔案。');
    }
  }
  async function restore(file) {
    const st = '#backupStatus';
    setStatus(st, '正在讀取備份檔…', true);
    let obj = null;
    try { obj = JSON.parse(await file.text()); } catch (e) { obj = null; }
    if (!obj || obj.app !== 'liangdeng' || !Array.isArray(obj.cases)) { setStatus(st, '這個檔案不是亮燈的備份檔。'); return; }
    const incoming = obj.cases.map(c => P.normalizeCase(c, isoDate())).filter(Boolean).map(withRepairs);
    const m = P.mergeCases(userCases, incoming);
    const imgs = obj.images && typeof obj.images === 'object' ? obj.images : {};
    let nImg = 0;
    for (const id of m.accepted) {
      const c = m.list.find(x => x.id === id);
      for (const imgId of P.imageIds(c)) {
        const url = imgs[id + '/' + imgId];
        if (typeof url !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) continue;
        try {
          const blob = dataURLToBlob(url);
          BL[imgId] = { blob, url, w: 0, h: 0 };
          await store.putBlob(id + '/' + imgId, blob);
          nImg++;
        } catch (e) { /* 壞掉的圖片略過 */ }
      }
    }
    userCases = m.list;
    if (C && m.accepted.includes(C.id)) C = null;   // 開著的案件被備份覆蓋：下次打開時重新載入
    persist();
    renderCases();
    setStatus(st, `還原完成：新增 ${m.added} 件、更新 ${m.updated} 件${m.skipped ? `；${m.skipped} 件本機已是相同或更新的版本，保留不動` : ''}；圖片 ${nImg} 張。`);
  }

  /* ================= AI 狀態 ================= */
  const AI = { checked: false, blocked: false, noticeClosed: false };
  const running = {};
  const HIDE_CODES = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
  function aiError(e) {
    const code = e && e.code;
    if (HIDE_CODES.includes(code)) { AI.blocked = true; updateAIState(); return '這個頁面沒有取得使用 Claude 的權限，AI 功能已關閉。試算和報告仍可使用。'; }
    switch (code) {
      case 'cancelled': return '已停止。';
      case 'not_available': return 'AI 目前不能用，請在 Claude 線上原型裡開啟。';
      case 'images_unavailable': platform.ai.images = false; updateAIState(); return '這個檢視無法把照片傳給 Claude。';
      case 'image_rejected': return '照片格式或大小不支援，請改用 JPG 或 PNG 再試一次。';
      case 'rate_limited': return 'AI 使用太頻繁或已達用量上限，請稍後再試。';
      case 'session_expired': return 'Claude 登入已過期，請重新登入後再試。';
      case 'refused': return 'Claude 沒有處理這次的內容，請換一張照片再試。';
      case 'invalid_json': return 'AI 回覆的格式不完整，請再按一次。';
      case 'prompt_too_large': return '內容太多，請減少照片張數後再試。';
      case 'empty_completion': return 'AI 沒有產生內容，請換一張照片再試。';
      default: return '連線中斷，請再試一次。';
    }
  }
  const aiText = () => platform.ai.text && !AI.blocked;
  const explainPlaceholder = () => !AI.checked || aiText() ? '選好屋主的顧慮後，按「AI 白話說明」。' : '這個版本沒有 AI 白話說明；報告仍會列出所有試算數字和來源。';
  function updateAIState() {
    const textOK = aiText(), imgOK = textOK && platform.ai.images;
    const off = $('#aiOff');
    off.hidden = textOK || !AI.checked || currentView !== 'visit' || AI.noticeClosed;
    $('#aiOffText').textContent = platform.kind === 'claude'
      ? 'AI 功能目前無法使用（可能沒有取得 Claude 權限）。示範內容、三條路試算和報告不受影響。'
      : '在一般瀏覽器開啟時沒有 AI 功能（要在 Claude 線上原型裡使用）；試算、案件總覽和報告都能照常操作。';
    if (!C) return;
    $('#btnDiag').disabled = !imgOK || !C.photos.some(p => BL[p.id]) || !!running.diag;
    $('#btnPrompt').disabled = !imgOK || !currentBefore() || !!running.prompt;
    $('#btnDeed').disabled = !imgOK || !(C.deedImgId && BL[C.deedImgId]) || !!running.deed;
    $('#btnExplain').disabled = !textOK || !!running.explain;
    if (!running.explain && !C.explanation) $('#explainOut').textContent = explainPlaceholder();
  }
  function setStatus(id, text, busy) { const el = $(id); el.textContent = text || ''; el.classList.toggle('busy', !!busy); }
  function setBusy(key, on) {
    const stop = { diag: '#btnDiagStop', prompt: '#btnPromptStop', deed: '#btnDeedStop', explain: '#btnExplainStop' }[key];
    $(stop).hidden = !on;
    updateAIState();
  }
  function abortAll() { for (const k of Object.keys(running)) if (running[k]) running[k].abort(); }

  /* ================= 圖片 ================= */
  async function decode(file) {
    try { const b = await createImageBitmap(file, { imageOrientation: 'from-image' }); return { src: b, w: b.width, h: b.height }; } catch (e) { /* 改用下一種 */ }
    try { const b = await createImageBitmap(file); return { src: b, w: b.width, h: b.height }; } catch (e) { /* 改用 <img> */ }
    const url = await blobToDataURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  }
  /** 照片縮到長邊 1600 像素、轉成 JPEG：AI 讀得到、存得下、報告也不會太大 */
  async function prepImage(file) {
    const { src, w, h } = await decode(file);
    const k = Math.min(1, 1600 / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(src, 0, 0, cw, ch);
    if (src.close) src.close();
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('toBlob failed');
    return imageOf(blob, cw, ch);
  }
  const guessRoom = i => ['客廳', '臥室', '浴室', '廚房', '臥室', '陽台'][i] || '其他';
  const photoById = id => C.photos.find(p => p.id === id);
  const urlOf = id => (id && BL[id] && BL[id].url) || '';

  /* ================= 拜訪：共用 ================= */
  function fillInputs() {
    const c = C.case, k = C.calc;
    $('#fCity').value = c.city; $('#fAddr').value = c.addr || ''; $('#fPing').value = c.ping || ''; $('#fAge').value = c.age || '';
    $('#fRooms').value = c.rooms || ''; $('#fHalls').value = c.halls || ''; $('#fBaths').value = c.baths || ''; $('#fKwh').value = c.kwh === '' ? '' : c.kwh;
    $('#cHouse').value = k.houseValue || ''; $('#cLand').value = k.landValue || ''; $('#cCount').value = k.count || 1;
    $('#cBracket').value = String(k.bracket); $('#cInherited').checked = !!k.inherited; $('#cRent').value = k.rent || '';
    $('#cReno').value = k.renoAuto ? '' : (k.reno || '');
    $('#cVac').value = k.vacancy; $('#cAgent').value = k.agentMonths; $('#cMaint').value = k.maint;
    $('#concernText').value = C.concernText || '';
    $('#followUp').value = C.followUp || ''; $('#caseNote').value = C.note || '';
  }
  function renderCaseHead() {
    $('#caseTitle').textContent = caseName();
    $('#casePing').textContent = pingText();
    $('#demoChip').hidden = !C.demo;
    $('#demoBanner').hidden = !C.demo;
    $('#demoText').textContent = LD.util.glue(C.id === LD.demo.DEMO_ID
      ? '示範案例：竹北 25 坪、屋齡 32 年的繼承老公寓。照片是示意插圖，金額為示範值；在這裡的修改不會保存。'
      : '示範案件：只有基本資料和試算條件，金額為示範值；在這裡的修改不會保存。');
    $('#caseStatus').innerHTML = STATUSES.map(s => `<option value="${s.key}"${s.key === C.status ? ' selected' : ''}>${s.label}</option>`).join('');
    const k = Number(C.case.kwh), note = $('#kwhNote');
    if (C.case.kwh !== '' && Number.isFinite(k)) {
      note.innerHTML = k <= 60
        ? `每月約 ${fmt(k)} 度，在 60 度以下：屬內政部統計的「低度使用（用電）住宅」。<a href="${esc(SRC.lowUse.u)}" target="_blank" rel="noopener">定義</a>`
        : `每月約 ${fmt(k)} 度，高於 60 度的低度使用門檻。`;
    } else note.textContent = '台電資料中，每月平均用電 60 度以下的住宅會被列為低度使用住宅，可以向屋主確認電費單。';
    $$('#decideRow [data-status]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.status === C.status)));
  }
  function renderPhotos() {
    const n = C.photos.length;
    $('#photoCount').textContent = n ? `${n} 張` : '';
    $('#photoGrid').innerHTML = !n
      ? '<div class="empty" style="grid-column:1/-1"><span>每個空間拍一張：從門口往內拍，讓牆角、天花板和地板入鏡。</span></div>'
      : C.photos.map((p, i) => {
        const u = urlOf(p.id), id = esc(p.id);
        return `<div class="ph">
        <div class="ph-img"${u ? ` style="background-image:url('${u}')"` : ''}>${u ? '' : '照片沒有保存<br>請重新加入'}</div>
        <div class="ph-meta">
          <span class="ph-idx">${i + 1}</span>
          <select id="room-${id}" data-room="${id}" aria-label="第 ${i + 1} 張的空間">${ROOMS.map(r => `<option${r === p.room ? ' selected' : ''}>${r}</option>`).join('')}</select>
          <button class="btn btn-sm btn-ghost" type="button" data-del="${id}" aria-label="移除第 ${i + 1} 張">移除</button>
        </div>
      </div>`;
      }).join('');
    updateAIState();
  }
  const scoreBar = n => `<span class="score" aria-label="屋況 ${n} 分（滿分 5）">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  function renderFindings() {
    const d = C.diagnosis;
    $('#findCard').hidden = !d;
    if (!d) return;
    $('#overall').textContent = d.overall || '';
    $('#finds').innerHTML = d.photos.map(p => {
      const u = urlOf(p.photoId);
      return `<div class="find-card">
      <div class="find-thumb"${u ? ` style="background-image:url('${u}')"` : ''}>${u ? '' : esc(p.room)}</div>
      <div>
        <div class="find-title">${esc(p.room)} ${scoreBar(p.score)}</div>
        <div class="hint">${esc(p.summary)}</div>
        ${p.findings.length ? `<ul class="find-list">${p.findings.map(f => `<li><span class="sev s${f.severity}">${esc(ITEM_LABEL[f.item])}・${f.severity}</span><span>${esc(f.evidence)}${f.count > 1 ? `（${f.count}）` : ''}</span></li>`).join('')}</ul>` : '<div class="hint">沒有需要整理的項目。</div>'}
      </div></div>`;
    }).join('');
  }
  function renderRepairs() {
    const list = $('#repairList');
    if (!C.repairs.length) {
      list.innerHTML = '<div class="empty"><span>還沒有修繕項目。AI 診斷照片後會自動列出，也可以從「加入其他項目」手動加入。</span></div>';
    } else {
      list.innerHTML = C.repairs.map(l => {
        const [a, b] = lineCost(l, ping());
        const it = CATALOG[l.id], key = esc(l.key);
        const nm = l.id === 'custom' ? l.name : it.name;
        let ctrl;
        if (l.id === 'custom') ctrl = '<span class="hint">自訂金額</span>';
        else if (it.tiers) ctrl = `<select id="tier-${key}" data-tier="${key}" aria-label="整理程度">${['輕', '中', '重'].map(t => `<option value="${t}"${t === (l.tier || '中') ? ' selected' : ''}>${t}｜${it.tierText[t]}</option>`).join('')}</select>`;
        else if (it.perPing) ctrl = `<span class="hint">${ping()} 坪 × ${fmt(it.range[0])}–${fmt(it.range[1])} 元</span>`;
        else ctrl = `<label class="qty">數量 <input id="qty-${key}" data-qty="${key}" type="number" min="1" max="20" step="1" value="${l.qty || 1}"> ${it.unit}</label><span class="hint">每${it.unit} ${fmt(it.range[0])}–${fmt(it.range[1])} 元</span>`;
        const del = l.auto ? '' : `<button class="btn btn-sm btn-ghost" type="button" data-rm="${key}">移除</button>`;
        return `<div class="rl-row${l.on ? '' : ' off'}">
        <input type="checkbox" id="on-${key}" data-on="${key}"${l.on ? ' checked' : ''} aria-label="納入估價">
        <label class="rl-name" for="on-${key}"><b>${esc(nm)}</b>${l.detail ? `<span class="rl-detail">${esc(l.detail)}</span>` : ''}</label>
        <span class="amt">${a === b ? fmt(a) : fmt(a) + '–' + fmt(b)}</span>
        <div class="ctrls">${ctrl}${del}</div>
      </div>`;
      }).join('');
    }
    const t = totals();
    $('#repairTotal').innerHTML = C.repairs.some(l => l.on)
      ? `<span class="hint">估計</span><b class="num">${wan(t.mid)}</b><span class="hint">區間 ${wan(t.lo)}–${wan(t.hi)}</span>`
      : '<span class="hint">尚未列入項目</span>';
  }
  function renderBasis() {
    const rows = Object.values(CATALOG).map(it => {
      const price = it.tiers ? ['輕', '中', '重'].map(t => `${t} ${fmt(it.tiers[t][0])}–${fmt(it.tiers[t][1])}`).join('<br>') : `${fmt(it.range[0])}–${fmt(it.range[1])}／${it.unit}`;
      return `<tr><td>${esc(it.name)}</td><td class="txt">${price}</td><td class="txt">${esc(it.note || '')}<br><small>${srcLinks(it.src)}</small></td></tr>`;
    }).join('');
    $('#basisTable').innerHTML = `<thead><tr><th>項目</th><th>費用（元）</th><th>說明與來源</th></tr></thead><tbody>${rows}</tbody>`;
  }

  /* 步驟 2 */
  function currentBefore() {
    const a = C.after;
    if (a.photoId === '__own' && a.ownBefore && BL[a.ownBefore.id]) return { ...BL[a.ownBefore.id], id: '__own', room: '其他', w: a.ownBefore.w || BL[a.ownBefore.id].w, h: a.ownBefore.h || BL[a.ownBefore.id].h };
    const p = a.photoId ? photoById(a.photoId) : null;
    return p && BL[p.id] ? { ...BL[p.id], id: p.id, room: p.room, w: p.w || BL[p.id].w, h: p.h || BL[p.id].h } : null;
  }
  function renderStep2() {
    const opts = C.photos.filter(p => BL[p.id]);
    if (!C.after.photoId && opts.length) C.after.photoId = opts[0].id;
    const own = C.after.ownBefore && BL[C.after.ownBefore.id];
    const items = opts.map(p => ({ id: p.id, url: urlOf(p.id), label: p.room })).concat(own ? [{ id: '__own', url: own.url, label: '另外上傳' }] : []);
    $('#chooseList').innerHTML = items.length
      ? items.map(o => `<label><input type="radio" name="before" id="pick-${esc(o.id)}" value="${esc(o.id)}"${C.after.photoId === o.id ? ' checked' : ''}><span class="t" style="background-image:url('${o.url}')"></span>${esc(o.label)}</label>`).join('')
      : '<div class="empty" style="width:100%"><span>先在步驟 1 加入照片，或在這裡另外上傳一張。</span></div>';
    const pr = C.after.prompt;
    $('#promptBox').hidden = !pr;
    if (pr) { $('#promptEn').textContent = pr.en; $('#promptZh').textContent = pr.zh; }
    const before = currentBefore(), afterUrl = urlOf(C.after.afterId);
    const wrap = $('#compareWrap');
    if (before && afterUrl) {
      wrap.innerHTML = `<div class="compare" id="cmp" style="--ar:${before.w || 4}/${before.h || 3}">
      <img src="${afterUrl}" alt="整理後">
      <div class="cmp-before"><img src="${before.url}" alt="整理前"></div>
      <div class="cmp-line"></div>
      <span class="cmp-tag l">整理前</span><span class="cmp-tag r">整理後</span>
      <input class="cmp-range" id="cmpRange" type="range" min="0" max="100" value="50" aria-label="拖曳比較整理前後">
    </div>`;
      const cmp = $('#cmp');
      $('#cmpRange').addEventListener('input', e => cmp.style.setProperty('--pos', e.target.value + '%'));
    } else {
      wrap.innerHTML = `<div class="empty"><span>${before ? '上傳整理後的圖片，這裡就會出現前後對照。' : '選一張原圖並上傳整理後的圖片，這裡就會出現前後對照。'}</span></div>`;
    }
    updateAIState();
  }

  /* 步驟 3 */
  function renderDeed() {
    const u = urlOf(C.deedImgId);
    $('#deedThumb').innerHTML = u ? `<div class="deed-img" style="background-image:url('${u}')" role="img" aria-label="謄本照片"></div>` : '';
    const f = C.deedFields;
    $('#deedCard').hidden = !f;
    if (!f) { updateAIState(); return; }
    const val = v => v == null || v === '' ? '<span class="hint">讀不到</span>' : esc(Array.isArray(v) ? v.join('、') : v);
    const unclear = Array.isArray(f['讀不清楚的欄位']) && f['讀不清楚的欄位'].length ? `<p class="hint">AI 標記為看不清楚：${esc(f['讀不清楚的欄位'].join('、'))}</p>` : '';
    $('#deedResult').innerHTML = `
    <ul class="checks">${LD.deed.deedChecks(f).map(c => `<li><span class="st ${c.s}">${c.l}</span><div><b>${esc(c.t)}</b><span class="d">${esc(c.d)}</span></div></li>`).join('')}</ul>
    <details><summary>讀出的欄位</summary><div class="table-wrap"><table><tbody>${LD.deed.DEED_KEYS.map(k => `<tr><td>${k}</td><td class="txt">${val(f[k])}</td></tr>`).join('')}</tbody></table></div></details>${unclear}
    ${C.deedDemo ? '<p class="hint">示範謄本為虛構資料。</p>' : ''}<p class="hint">資格條件參考：${srcLinks(['law'])}。最後是否能加入，以業者與主管機關審查為準。</p>`;
    updateAIState();
  }

  /* 步驟 4 */
  function drawCumChart(res, animate) {
    const box = $('#cumChart');
    clearTimeout(box._draw);
    if (animate && !LD.motion.reduced()) { box.classList.add('draw'); box._draw = setTimeout(() => box.classList.remove('draw'), 1900); }
    else if (!animate) box.classList.remove('draw');
    const { svg, geo } = LD.charts.lineChartSVG(res, C.calc.mode, true, box.clientWidth || 640);
    box.innerHTML = svg + '<div class="tip" hidden></div>';
    const svgEl = box.querySelector('svg'), hit = box.querySelector('[data-role="hit"]'), xh = box.querySelector('[data-role="xh"]'), tip = box.querySelector('.tip');
    const show = ev => {
      const rect = svgEl.getBoundingClientRect();
      const sx = (ev.clientX - rect.left) * geo.W / rect.width;
      const i = Math.max(0, Math.min(geo.yrs, Math.round((sx - geo.m.l) / (geo.W - geo.m.l - geo.m.r) * geo.yrs)));
      const px = geo.x(i);
      xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${i === 0 ? '第 0 年（整理費用）' : '第 ' + i + ' 年累計'}</b>` + [res.C, res.B, res.A].map(p =>
        `<div><span><i class="sw sw-${p.key}"></i>${esc(name(p.key))}</span><span class="v">${wan(p.cum[i])}</span></div>`).join('');
      tip.hidden = false;
      const left = px * rect.width / geo.W, tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(rect.width - tw, left + 12 + tw > rect.width ? left - tw - 12 : left + 12)) + 'px';
      tip.style.top = '8px';
    };
    const hide = () => { xh.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    hit.addEventListener('pointermove', show);
    hit.addEventListener('pointerdown', show);
    hit.addEventListener('pointerleave', hide);
  }
  const lastTotals = { id: null };
  function renderCalc() {
    const t = totals();
    $('#cRenoHint').innerHTML = C.calc.renoAuto
      ? `使用修繕清單估計值（${wan(t.mid)}）`
      : `已手動輸入。<button class="linklike" type="button" id="btnRenoAuto">改用修繕清單估計值 ${wan(t.mid)}</button>`;
    if (C.calc.renoAuto) $('#cReno').value = t.mid || 0;
    $$('#modeSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === C.calc.mode)));
    $('#modeHint').textContent = C.calc.mode === '包租' ? '業者擔任二房東，每月付屋主市價 8 折，簽 3 年；空租風險由業者承擔。' : '屋主直接和房客簽約、租金市價 9 折，業者負責管理；空租期間沒有租金。';
    const res = result(), ready = calcReady();
    $('#conclusion').textContent = ready ? LD.util.glue(conclusionText(res, C.calc.mode)) : '填入下方的房屋評定現值和整理後月租，就會算出三條路的結果。';
    const best = rankPaths(res)[0].key;
    const card = p => {
      const bullets = p.key === 'vacant'
        ? [`房屋稅 ${pct(p.houseRate)}：每年 ${fmt(p.house)} 元`, `地價稅：每年 ${fmt(p.land)} 元`, '沒有租金收入']
        : p.key === 'self'
          ? [`租金 ${fmt(C.calc.rent)} 元 × ${p.months} 個月`, `房屋稅 ${pct(p.houseRate)}、所得稅每年 ${fmt(p.income)} 元`, '自己找房客、收租、修繕']
          : [`屋主每月實拿 ${fmt(p.monthly)} 元 × ${p.months} 個月`, `房屋稅 ${pct(p.houseRate)}、所得稅每年 ${fmt(p.income)} 元`, `修繕補助每年 ${fmt(p.subsidy)} 元，業者管理`];
      const isBest = ready && p.key === best;
      return `<div class="path${isBest ? ' best' : ''}" data-path="${p.key}">
      <div class="path-key"><i class="sw sw-${p.key}"></i>${esc(name(p.key))}${isBest ? '<span class="badge">十年最高</span>' : ''}</div>
      <div class="big num">${wan(p.total)}</div>
      <div class="sub">每年\u00a0${p.net >= 0 ? '+' : ''}${fmt(p.net)}\u00a0元${p.payback ? `，約第\u00a0${p.payback}\u00a0年回收整理費` : ''}</div>
      <ul>${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    </div>`;
    };
    $('#paths').innerHTML = [res.A, res.B, res.C].map(card).join('');
    const same = lastTotals.id === C.id;
    for (const p of [res.A, res.B, res.C]) {
      const el = $(`#paths [data-path="${p.key}"] .big`);
      LD.motion.tween(el, same ? lastTotals[p.key] : NaN, p.total, wan);
      lastTotals[p.key] = p.total;
    }
    lastTotals.id = C.id;
    LD.motion.follow($('#paths .path.best'));
    $('#legend').innerHTML = [res.A, res.B, res.C].map(p => `<span><i class="lk lk-${p.key}"></i>${esc(name(p.key))}</span>`).join('');
    drawCumChart(res);
    const rowsDef = [['租金收入', 'rent', 1], ['找房客費用', 'find', -1], ['維修費', 'maint', -1], ['修繕補助', 'subsidy', 1], ['房屋稅', 'house', -1], ['地價稅', 'land', -1], ['租金所得稅', 'income', -1]];
    const cell = (v, sg) => v === 0 ? '—' : (sg < 0 ? '−' : '') + fmt(v);
    const P3 = [res.A, res.B, res.C];
    $('#calcTable').innerHTML = `<thead><tr><th>每年</th>${P3.map(p => `<th>${esc(name(p.key))}</th>`).join('')}</tr></thead><tbody>` +
      rowsDef.map(([lab, k, sg]) => `<tr><td>${lab}</td>${P3.map(p => `<td>${cell(p[k], sg)}</td>`).join('')}</tr>`).join('') +
      `<tr class="sum"><td>每年淨收入</td>${P3.map(p => `<td>${fmt(p.net)}</td>`).join('')}</tr>` +
      `<tr><td>整理費用（第 0 年）</td>${P3.map(p => `<td>${p.reno ? '−' + fmt(p.reno) : '—'}</td>`).join('')}</tr>` +
      `<tr class="sum"><td>${res.years} 年淨收入</td>${P3.map(p => `<td>${fmt(p.total)}</td>`).join('')}</tr></tbody>`;
    renderRules(res);
  }
  function renderRules(res) {
    const r = RULES[C.case.city];
    const note = C.case.city === 'hsinchu'
      ? { vacant: '非自住住家用（全國歸戶）：1 戶 2.6%、2–4 戶 3.2%、5–6 戶 3.8%、7 戶以上 4.8%。新竹縣稅務局公布的範圍是 2.6%–4.8%，級距依財政部基準。', rent: '出租並申報租賃所得達當地一般租金標準（或繼承共有）：新竹縣 1.6%–2.4%；級距（4 戶以內、5–6 戶、7 戶以上）依財政部基準推定。', social: '社宅包租代管：特定房屋 1.6%，再依新竹縣自治條例減徵房屋稅額 25%，實質 1.2%。', src: { vacant: ['hcRent', 'mofBase'], rent: ['hcRent', 'mofBase'], social: ['hcSocial', 'hc2022'] } }
      : { vacant: '非自住住家用（全國歸戶）：2 戶以內 3.2%、3–4 戶 3.8%、5–6 戶 4.2%、7 戶以上 4.8%。', rent: '出租並申報租賃所得達租金標準（或繼承共有）：4 戶以內 1.5%、5–6 戶 2.0%、7 戶以上 2.4%。', social: '社宅包租代管：房屋稅率減徵為 1%。116 年期仍有稅基折減（實質 0.875%），試算從嚴取 1%。', src: { vacant: ['tpTax2'], rent: ['tpTax2', 'mofBase'], social: ['tpSocial', 'tpTable'] } };
    const rules = [
      [`房屋稅・繼續空著：本案適用 ${pct(res.vacantRate)}${C.calc.inherited ? '（繼承共有）' : ''}`, C.calc.inherited ? note.rent : note.vacant, C.calc.inherited ? note.src.rent : note.src.vacant],
      [`房屋稅・自己出租：本案適用 ${pct(res.rentRate)}`, note.rent + ' 試算假設屋主誠實申報租金。', note.src.rent],
      [`房屋稅・社宅包租代管：本案適用 ${pct(res.socialRate)}`, note.social, note.src.social],
      [`地價稅：一般 ${fmt(res.landGen)} 元／年；社宅包租代管 ${fmt(res.landSoc)} 元／年`, '一般用地基本稅率千分之十（假設未超過累進起點地價）；社宅包租代管減徵應納地價稅 80%。', C.case.city === 'hsinchu' ? ['hcSocial'] : ['tpSocial', 'tpTable']],
      ['租金所得稅', `自己出租：租金扣除 43% 必要費用後，按屋主級距 ${pct(C.calc.bracket)} 計算。社宅包租代管：每屋每月 1.5 萬元以內免稅，超過部分扣除 60% 費用。`, ['ntbt', 'law']],
      ['社宅包租代管的補助與租金', `修繕費每年最高 1 萬元（實支實付）、包租另有居家安全保險費每年最高 3,500 元、公證費每件最高 ${fmt(r.notary)} 元；包租為市價 8 折、代管為市價 9 折。各縣市另有可加入的租金上限，以當期計畫公告為準。`, ['subsidy']],
      ['期限', '住宅法第 22、23 條的租稅優惠有五年實施年限，屆期前由行政院決定是否延長；行政院已核定包租代管計畫推動到民國 121 年。試算假設十年內優惠延續。', ['law', 'plan']]
    ];
    $('#rulesList').innerHTML = rules.map(([h, d, s]) => `<li><b>${esc(h)}</b><br>${esc(d)}<small>來源：${srcLinks(s)}</small></li>`).join('') +
      '<li><b>試算範圍</b><br>社區管理費三條路相同，未列入；所得稅以屋主目前級距估算，不考慮跳級；稅額以稅捐機關核定為準。</li>';
  }

  /* 步驟 5 */
  function renderConcerns() {
    $('#concernChips').innerHTML = CONCERNS.map(c => `<button type="button" class="chip" data-concern="${esc(c)}" aria-pressed="${C.concerns.includes(c)}">${esc(c)}</button>`).join('');
    if (!running.explain) $('#explainOut').textContent = C.explanation || explainPlaceholder();
  }
  function renderReport() {
    const before = currentBefore();
    $('#reportPreview').innerHTML = LD.report.reportHTML(view(), { before: before && before.url, after: urlOf(C.after.afterId) });
  }

  /* 摘要與步驟列 */
  function renderSummary() {
    const t = totals(), has = C.repairs.some(l => l.on);
    $('#sumReno').textContent = has ? wan(t.mid) : '—';
    $('#sumRenoRange').textContent = has ? `區間 ${wan(t.lo)}–${wan(t.hi)}` : '';
    $('#sumBars').innerHTML = calcReady() ? LD.charts.barsHTML(result(), C.calc.mode) : '<span class="hint">填入稅單現值和月租後顯示</span>';
    $('#sumNote').textContent = C.demo ? '示範案例的數字都是示範值。' : '';
  }
  let stepMemo = { id: null, done: {} };
  function renderSteps() {
    const done = { 1: C.repairs.some(l => l.on), 2: !!(currentBefore() && urlOf(C.after.afterId)), 3: !!C.deedFields, 4: calcReady(), 5: !!C.explanation || C.status !== 'visit' };
    const same = stepMemo.id === C.id;
    $$('.win').forEach(w => {
      const n = Number(w.dataset.step);
      if (same && done[n] && !stepMemo.done[n]) LD.motion.replay(w, 'flick');
      w.classList.toggle('done', !!done[n]);
      if (n === C.step) w.setAttribute('aria-current', 'step'); else w.removeAttribute('aria-current');
      w.setAttribute('aria-label', `步驟 ${n} ${w.querySelector('.lbl').textContent}${done[n] ? '（已完成）' : ''}`);
    });
    stepMemo = { id: C.id, done };
  }
  let shownPanel = null;
  function go(step, fromRoute) {
    C.step = step;
    $$('[data-panel]').forEach(p => { p.hidden = Number(p.dataset.panel) !== step; });
    const key = C.id + '/' + step, changed = key !== shownPanel;
    shownPanel = key;
    if (changed) LD.motion.replay($(`[data-panel="${step}"]`), 'enter');
    renderSteps();
    if (step === 4) drawCumChart(result(), changed);   // 面板顯示後才量得到寬度
    if (step === 5) renderReport();
    setHash(`#visit/${C.id}/${step}`, fromRoute);
    window.scrollTo(0, 0);
    if (!C.demo) scheduleSave();   // 記住停在哪一步（不算修改）
  }
  function renderVisitAll() {
    for (const id of ['#diagStatus', '#promptStatus', '#deedStatus', '#explainStatus', '#reportStatus', '#decideStatus']) setStatus(id, '');
    $('#lineText').hidden = true;
    fillInputs(); renderCaseHead(); renderPhotos(); renderFindings(); renderRepairs(); renderStep2(); renderDeed(); renderCalc(); renderConcerns(); renderSummary(); renderSteps();
  }
  function refreshNumbers() { renderRepairs(); renderCalc(); renderSummary(); renderSteps(); if (C.step === 5) renderReport(); touch(); }
  function setCaseStatus(s) {
    if (!P.STATUSES.some(x => x.key === s)) return;
    C.status = s;
    renderCaseHead(); renderSteps(); touch();
  }

  /* ================= AI 動作（結果寫回發出請求的那個案件） ================= */
  function tracker(key, statusId) {
    const c = C, ctl = new AbortController();
    running[key] = ctl; setBusy(key, true);
    return {
      c, signal: ctl.signal,
      here: () => c === C,
      status(t, busy) { if (c === C) setStatus(statusId, t, busy); },
      done() { running[key] = null; setBusy(key, false); }
    };
  }
  async function runDiagnosis() {
    const photos = C.photos.filter(p => BL[p.id]);
    if (!photos.length || running.diag) return;
    const t = tracker('diag', '#diagStatus'), c = t.c;
    t.status(`AI 正在看 ${photos.length} 張照片，通常要 20–60 秒…`, true);
    const per = Math.max(1, platform.ai.maxImages);
    const results = [], overall = [];
    try {
      for (let i = 0; i < photos.length; i += per) {
        const batch = photos.slice(i, i + per);
        if (photos.length > per) t.status(`AI 正在看第 ${i + 1}–${Math.min(photos.length, i + per)} 張，共 ${photos.length} 張…`, true);
        const out = await platform.json(LD.prompts.diagPrompt(batch, i), { images: batch.map(p => BL[p.id].blob), signal: t.signal });
        const norm = LD.prompts.normalizeDiag(out, batch, i);
        results.push(...norm.photos);
        if (norm.overall) overall.push(norm.overall);
      }
      c.diagnosis = { photos: results, overall: overall.join(' ') };
      c.repairs = autoLines(c.diagnosis).concat((c.repairs || []).filter(r => !r.auto));
      markChanged(c);
      t.status(`完成：${results.length} 個空間，找到 ${results.reduce((s, p) => s + p.findings.length, 0)} 個待整理項目。`);
      if (t.here()) { renderFindings(); refreshNumbers(); renderStep2(); }
    } catch (e) {
      t.status(aiError(e));
    } finally { t.done(); }
  }
  async function runPrompt() {
    const before = currentBefore();
    if (!before || running.prompt) return;
    const t = tracker('prompt', '#promptStatus'), c = t.c;
    const diagPhoto = c.diagnosis && c.diagnosis.photos.find(p => p.photoId === before.id);
    const room = before.room || (diagPhoto && diagPhoto.room) || '其他';
    t.status('AI 正在看照片、寫改圖指令…', true);
    try {
      const out = await platform.json(LD.prompts.editPrompt(room, diagPhoto ? diagPhoto.findings : []), { images: [before.blob], signal: t.signal });
      const en = String((out && out.en) || '').trim(), zh = String((out && out.zh) || '').trim();
      if (!en) throw { code: 'invalid_json' };
      c.after.prompt = { en: en.slice(0, 1200), zh: zh.slice(0, 200) };
      markChanged(c);
      t.status('指令完成，複製後貼到影像生成工具。');
      if (t.here()) renderStep2();
    } catch (e) {
      t.status(aiError(e));
    } finally { t.done(); }
  }
  async function runDeed() {
    const img = C.deedImgId && BL[C.deedImgId];
    if (!img || running.deed) return;
    const t = tracker('deed', '#deedStatus'), c = t.c;
    t.status('AI 正在讀謄本…', true);
    try {
      const out = await platform.json(LD.deed.DEED_PROMPT, { images: [img.blob], signal: t.signal });
      c.deedFields = LD.deed.normalizeDeed(out); c.deedDemo = false;
      const yr = LD.deed.rocYear(c.deedFields['建築完成日期']);
      if (yr) c.case.age = Math.max(0, new Date().getFullYear() - (yr + 1911));
      markChanged(c);
      t.status('判讀完成，請對照謄本確認。');
      if (t.here()) { $('#fAge').value = c.case.age || ''; renderDeed(); renderCaseHead(); renderSteps(); }
    } catch (e) {
      t.status(aiError(e));
    } finally { t.done(); }
  }
  async function runExplain() {
    if (running.explain) return;
    if (!calcReady()) { setStatus('#explainStatus', '請先在步驟 4 填入房屋評定現值和月租。'); return; }
    const t = tracker('explain', '#explainStatus'), c = t.c;
    const out = $('#explainOut');
    out.textContent = '';
    t.status('AI 正在整理說明…', true);
    const concerns = c.concerns.slice();
    if (c.concernText.trim()) concerns.push(c.concernText.trim().slice(0, 200));
    const v = { title: caseTitle(c), age: c.case.age, concerns, res: result(c), totals: totals(c), mode: c.calc.mode, notary: RULES[c.case.city].notary };
    try {
      const { text, truncated } = await platform.text(LD.prompts.explainPrompt(v), {
        signal: t.signal, cache: false,
        onText: u => { if (t.here()) { out.textContent = u.text; t.status('AI 正在寫…', true); } }
      });
      c.explanation = String(text || '').slice(0, 3000);
      markChanged(c);
      t.status(truncated ? '說明被截斷，可以再產生一次。' : '完成，已放進下方報告。');
      if (t.here()) { out.textContent = c.explanation; renderReport(); renderSteps(); }
    } catch (e) {
      if (t.here()) out.textContent = (e && e.text) || c.explanation || explainPlaceholder();
      t.status(aiError(e));
    } finally { t.done(); }
  }

  /* ================= 報告 ================= */
  function markReported() { if (C.status === 'visit') setCaseStatus('report'); }
  async function downloadReport() {
    const st = '#reportStatus';
    if (!platform.canSave()) { setStatus(st, '這個檢視不能下載檔案，請改用「複製 LINE 訊息」。'); return; }
    try {
      setStatus(st, '正在準備報告…', true);
      const before = currentBefore(), after = BL[C.after.afterId];
      const v = view();
      await platform.saveFile(LD.report.reportFilename(v), LD.report.reportDocument(v, before && after ? { before: before.url, after: after.url } : {}), LD.report.reportAsciiName(v));
      markReported();
      setStatus(st, '已下載。檔案可以直接用瀏覽器開啟，或用 LINE 傳給屋主。');
    } catch (e) {
      const c = e && e.code;
      setStatus(st, c === 'declined' ? '已取消下載。' : c === 'rate_limited' ? '已有一個下載視窗開著，請先處理它。' : '這個檢視不能下載檔案，請改用「複製 LINE 訊息」。');
    }
  }
  function copyLine() {
    const text = LD.report.lineMessage(view());
    const ta = $('#lineText');
    const fallback = () => { ta.hidden = false; ta.value = text; ta.focus(); ta.select(); setStatus('#reportStatus', '無法自動複製，訊息已選取，請手動複製。'); };
    try {
      navigator.clipboard.writeText(text).then(() => { markReported(); setStatus('#reportStatus', '已複製 LINE 訊息，記得把下載的報告一起傳給屋主。'); }, fallback);
    } catch (e) { fallback(); }
  }

  /* ================= 示範與導覽 ================= */
  const openDemoAt = step => nav({ view: 'visit', id: LD.demo.DEMO_ID, step });
  function resetDemo() {
    const openId = C && C.demo ? C.id : null, step = openId ? C.step : 1;
    if (openId) abortAll();
    buildDemos();
    if (!openId) return;
    if (currentView === 'visit') { C = withRepairs(findCase(openId)); C.step = step; renderVisitAll(); go(step, true); }
    else C = null;
  }
  function startTour() {
    resetDemo();
    const toCases = async () => {
      if (!prefs.showDemo) { prefs.showDemo = true; store.savePrefs(prefs); }
      listFilter = 'all';
      await nav({ view: 'cases' });
    };
    LD.tour.start([
      { before: () => nav({ view: 'intro' }), target: '[data-tour="hero"]', title: '每 10 戶，就有 1 戶的燈沒有亮', text: '全國 91 萬戶住宅一個月用不到 60 度電。政府估計其中 37.5 萬戶有機會轉成社宅包租代管，房子卻一直放不出來。' },
      { target: '[data-tour="stats"]', title: '業者不缺，缺的是房源', text: '租賃住宅服務業者三年將近翻倍到 2,254 家；業界普遍認為，2026 年的關鍵是房東願不願意把房子交出來。' },
      { target: '[data-tour="steps"]', title: '亮燈：一次拜訪，當場算給屋主看', text: '業務拜訪空屋屋主時，用手機完成五個步驟：屋主當場看懂三條路的差別，帶走一份能和家人討論的報告。' },
      { before: toCases, target: '[data-tour="kpis"]', title: '業者端：每次拜訪都是一筆案件', text: '總覽統計拜訪、出報告到簽約的轉換，以及每簽一戶可申請的開發費。亮燈成交才收費，所以我們和業者看的是同一個數字。' },
      { target: '[data-tour="caselist"]', title: '打開一個完整的示範案例', text: '接下來用竹北一間繼承的老公寓示範。屋主住台北，房子空了好幾年。' },
      { before: () => openDemoAt(1), target: '[data-tour="photos"]', title: '步驟 1：拍照', text: '業務在現場每個空間拍一張。示範裡的照片是插圖，實際使用時直接用手機拍。' },
      { target: '[data-tour="finds"]', title: 'AI 看出要整理的地方', text: 'AI 只能從固定的項目裡挑（壁癌、地板、浴室⋯），並寫出在照片哪裡看到；它不會自己編金額。' },
      { target: '[data-tour="repairs"]', title: '修繕清單與估價', text: '金額由估價表計算，每一項都附來源；業務可以當場調整輕重、加入工班報價。這間估計約 22.6 萬。' },
      { before: () => openDemoAt(2), target: '[data-tour="compare"]', title: '步驟 2：整理後的樣子', text: '拖曳中間的線。屋主看到的是自己的房子整理後的樣子，而不是別人的樣品屋。' },
      { before: () => openDemoAt(3), target: '[data-tour="deed"]', title: '步驟 3：謄本初篩', text: '讀出主要用途、共有人數和屋齡，判斷能不能加入社宅包租代管、要準備哪些文件。' },
      { before: () => openDemoAt(4), target: '[data-tour="paths"]', title: '步驟 4：三條路，十年算清楚', text: '繼續空著每年倒貼稅金；交給社宅包租，屋主每月實拿 1.44 萬、在免稅額內，十年比空著多出 150 萬以上。這一步完全由規則引擎計算，沒有用 AI。' },
      { target: '[data-tour="chart"]', title: '每條規則都能追到來源', text: '房屋稅、地價稅、所得稅和補助都依縣市規則計算；下方列出這個案件用到的每一條規則與出處。' },
      { before: () => openDemoAt(5), target: '[data-tour="report"]', title: '步驟 5：帶走一頁報告', text: 'AI 依屋主的顧慮，把算好的數字說成白話。報告可以下載，也能直接複製成 LINE 訊息轉給兄弟姊妹。' },
      { target: '[data-tour="decide"]', title: '回到總覽，追蹤到簽約', text: '記下屋主的決定和下次追蹤日期，總覽的轉換率就會更新。這正是亮燈要證明的事：用了亮燈，簽約率更高。' }
    ], () => {});
  }

  /* ================= 事件 ================= */
  async function addImage(file, prefix) {
    const im = await prepImage(file), id = prefix + uid();
    keepImage(id, im);
    return { id, im };
  }
  function bind() {
    LD.tour.bind();
    // label 形式的上傳按鈕可以用鍵盤操作
    $$('label.btn[for]').forEach(l => {
      const input = document.getElementById(l.htmlFor);
      if (!input || input.type !== 'file') return;
      l.tabIndex = 0; input.tabIndex = -1;
      l.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    });
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]');
      if (a) {
        e.preventDefault();
        if (a.dataset.action === 'new-case') newCase();
        else if (a.dataset.action === 'tour') startTour();
        else if (a.dataset.action === 'open-demo') openDemoAt(1);
        return;
      }
      const link = e.target.closest('a[href^="#"]');
      if (link && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const h = link.getAttribute('href');
        if (/^#(visit\/|cases$|intro$)/.test(h)) { e.preventDefault(); setHash(h); render(parseHash(h)); }
      }
    });
    addEventListener('popstate', onHistory);
    addEventListener('hashchange', onHistory);
    addEventListener('pagehide', flush);
    let resizeTimer = null, lastW = innerWidth;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (innerWidth === lastW) return;   // 手機捲動時網址列伸縮只改高度
        lastW = innerWidth;
        if (currentView === 'visit' && C && C.step === 4) drawCumChart(result());
      }, 150);
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

    // 案件總覽
    $('#statusFilter').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; listFilter = b.dataset.filter; renderCases(); });
    $('#aiOffClose').addEventListener('click', () => { AI.noticeClosed = true; $('#aiOff').hidden = true; });
    $('#showDemo').addEventListener('change', e => { prefs.showDemo = e.target.checked; store.savePrefs(prefs); renderCases(); });
    $('#btnExport').addEventListener('click', exportCSV);
    $('#btnBackup').addEventListener('click', backup);
    $('#restoreInput').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) restore(f); });
    const list = $('#caseList');
    list.addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const id = del.dataset.del, idx = userCases.findIndex(c => c.id === id);
        if (idx < 0) return;
        const [gone] = userCases.splice(idx, 1);
        if (C && C.id === id) C = null;
        persist();
        renderCases();
        LD.motion.toast(`已刪除「${caseName(gone)}」`, {
          action: '復原', timeout: 7000,
          onAction: () => { if (!userCases.some(c => c.id === id)) userCases.splice(Math.min(idx, userCases.length), 0, gone); persist(); if (currentView === 'cases') renderCases(); },
          onExpire: () => { if (!userCases.some(c => c.id === id)) store.deletePrefix(id + '/'); }
        });
        return;
      }
      if (e.target.closest('select,label,button')) return;
      const row = e.target.closest('[data-open]');
      if (row) { e.preventDefault(); openCase(row.dataset.open); }
    });
    list.addEventListener('change', e => {
      const id = e.target.dataset.statusOf;
      const c = id && findCase(id);
      if (!c || !P.STATUSES.some(x => x.key === e.target.value)) return;
      c.status = e.target.value;
      if (!c.demo) { c.updatedAt = stamp(); persist(); }
      renderCases();
    });
    $('#followList').addEventListener('click', e => { const a = e.target.closest('[data-open]'); if (a) { e.preventDefault(); openCase(a.dataset.open, Number(a.dataset.step) || 5); } });
    const feeInput = () => {
      const n = id => Math.max(0, Number($(id).value) || 0);
      prefs.fees = { devFee: { '包租': n('#feeLease'), '代管': n('#feeManage') }, serviceFee: n('#feeService') };
      store.savePrefs(prefs);
      $('#kpis').innerHTML = kpisHTML(P.pipelineStats(allCases(), fees()));
    };
    ['#feeLease', '#feeManage', '#feeService'].forEach(id => $(id).addEventListener('input', feeInput));

    // 拜訪：步驟切換與狀態
    $$('.win').forEach(w => w.addEventListener('click', () => go(Number(w.dataset.step))));
    $$('[data-go]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.go))));
    $('#caseStatus').addEventListener('change', e => setCaseStatus(e.target.value));
    $('#decideRow').addEventListener('click', e => {
      const b = e.target.closest('[data-status]');
      if (!b) return;
      setCaseStatus(b.dataset.status);
      if (b.dataset.status === 'signed') LD.motion.sparkAt(b, { count: 14, reach: 48 });
      setStatus('#decideStatus', `已記錄為「${STATUS[b.dataset.status].label}」。${C.demo ? '示範案件不會保存。' : '案件總覽的轉換率會一起更新。'}`);
    });
    $('#followUp').addEventListener('input', e => { C.followUp = /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) ? e.target.value : ''; touch(); });
    $('#caseNote').addEventListener('input', e => { C.note = e.target.value.slice(0, 120); touch(); });
    $('#btnResetDemo').addEventListener('click', resetDemo);

    // 步驟 1：基本資料
    const caseMap = { fCity: 'city', fAddr: 'addr', fPing: 'ping', fAge: 'age', fRooms: 'rooms', fHalls: 'halls', fBaths: 'baths', fKwh: 'kwh' };
    for (const [id, key] of Object.entries(caseMap)) {
      $('#' + id).addEventListener('input', e => {
        const el = e.target, n = Number(el.value);
        if (key === 'city') C.case.city = el.value === 'taipei' ? 'taipei' : 'hsinchu';
        else if (key === 'addr') C.case.addr = el.value.slice(0, 80);
        else if (key === 'kwh') C.case.kwh = el.value === '' ? '' : Math.max(0, Number.isFinite(n) ? n : 0);
        else C.case[key] = Math.max(0, Number.isFinite(n) ? n : 0);
        renderCaseHead(); refreshNumbers();
      });
    }
    $('#photoInput').addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      const c = C;
      setStatus('#diagStatus', `正在處理 ${files.length} 張照片…`, true);
      let bad = 0;
      for (const f of files) {
        try {
          const { id, im } = await addImage(f, 'p');
          c.photos.push({ id, room: guessRoom(c.photos.length), w: im.w, h: im.h });
        } catch (err) { bad++; }
      }
      markChanged(c);
      if (c !== C) return;
      const canAI = aiText() && platform.ai.images;
      setStatus('#diagStatus', bad ? `${bad} 張照片無法讀取，請改用 JPG 或 PNG。` : (canAI ? '照片已加入。確認每張的空間後，按「AI 診斷照片」。' : '照片已加入。'));
      renderPhotos(); renderStep2(); renderSteps();
    });
    $('#photoGrid').addEventListener('change', e => {
      const id = e.target.dataset.room;
      const p = id && photoById(id);
      if (!p || !ROOMS.includes(e.target.value)) return;
      p.room = e.target.value;
      touch();
    });
    $('#photoGrid').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      const id = b.dataset.del;
      C.photos = C.photos.filter(p => p.id !== id);
      if (C.after.photoId === id) C.after.photoId = null;
      renderPhotos(); renderStep2(); renderFindings(); renderSteps(); touch();
    });
    $('#btnDiag').addEventListener('click', runDiagnosis);
    $('#btnDiagStop').addEventListener('click', () => running.diag && running.diag.abort());

    // 修繕清單
    const rl = $('#repairList');
    const lineOf = key => C.repairs.find(l => l.key === key);
    rl.addEventListener('change', e => {
      const t = e.target, d = t.dataset;
      if (d.on) { const l = lineOf(d.on); if (l) l.on = t.checked; }
      else if (d.tier) { const l = lineOf(d.tier); if (l && ['輕', '中', '重'].includes(t.value)) l.tier = t.value; }
      else if (d.qty) { const l = lineOf(d.qty); if (l) l.qty = clampInt(t.value, 1, 1, 20); }
      else return;
      refreshNumbers();
    });
    rl.addEventListener('click', e => {
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      C.repairs = C.repairs.filter(l => l.key !== b.dataset.rm);
      refreshNumbers();
    });
    $('#quickAdd').addEventListener('click', e => {
      const b = e.target.closest('[data-add]');
      const it = b && Object.prototype.hasOwnProperty.call(CATALOG, b.dataset.add) && CATALOG[b.dataset.add];
      if (!it) return;
      C.repairs.push({ key: uid(), id: b.dataset.add, auto: false, on: true, qty: 1, tier: it.tiers ? '中' : undefined, detail: '手動加入' });
      refreshNumbers();
    });
    $('#customForm').addEventListener('submit', e => {
      e.preventDefault();
      const nm = $('#customName').value.trim(), amt = Number($('#customAmt').value);
      if (!nm || !(amt > 0)) return;
      C.repairs.push({ key: uid(), id: 'custom', name: nm.slice(0, 40), amount: Math.min(1e8, Math.round(amt)), auto: false, on: true, detail: '自訂' });
      $('#customName').value = ''; $('#customAmt').value = '';
      refreshNumbers();
    });

    // 步驟 2
    $('#chooseList').addEventListener('change', e => {
      if (e.target.name !== 'before') return;
      C.after.photoId = e.target.value; C.after.prompt = null;
      renderStep2(); renderSteps(); touch();
    });
    $('#beforeInput').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const { id, im } = await addImage(f, 'b');
        C.after.ownBefore = { id, w: im.w, h: im.h }; C.after.photoId = '__own'; C.after.prompt = null;
        setStatus('#promptStatus', '');
      } catch (err) { setStatus('#promptStatus', '這張照片無法讀取，請改用 JPG 或 PNG。'); }
      renderStep2(); renderSteps(); touch();
    });
    $('#afterInput').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { C.after.afterId = (await addImage(f, 'a')).id; }
      catch (err) { setStatus('#promptStatus', '這張圖片無法讀取，請改用 JPG 或 PNG。'); }
      renderStep2(); renderSteps(); touch();
    });
    $('#btnPrompt').addEventListener('click', runPrompt);
    $('#btnPromptStop').addEventListener('click', () => running.prompt && running.prompt.abort());
    $('#btnCopyPrompt').addEventListener('click', () => {
      const text = C.after.prompt ? C.after.prompt.en : '';
      const fb = () => { const r = document.createRange(); r.selectNodeContents($('#promptEn')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); setStatus('#promptStatus', '已選取指令，請手動複製。'); };
      try { navigator.clipboard.writeText(text).then(() => setStatus('#promptStatus', '已複製英文指令。'), fb); } catch (err) { fb(); }
    });

    // 步驟 3
    $('#deedInput').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        C.deedImgId = (await addImage(f, 'd')).id;
        if (C.deedDemo) { C.deedFields = null; C.deedDemo = false; }
        setStatus('#deedStatus', aiText() && platform.ai.images ? '謄本已上傳，按「AI 判讀謄本」。' : '謄本已上傳。');
      } catch (err) { setStatus('#deedStatus', '這張照片無法讀取，請改用 JPG 或 PNG。'); }
      renderDeed(); renderSteps(); touch();
    });
    $('#btnDeed').addEventListener('click', runDeed);
    $('#btnDeedStop').addEventListener('click', () => running.deed && running.deed.abort());

    // 步驟 4
    const calcMap = { cHouse: ['houseValue', 1e10], cLand: ['landValue', 1e11], cCount: ['count', 50], cRent: ['rent', 1e7], cVac: ['vacancy', 11], cAgent: ['agentMonths', 3], cMaint: ['maint', 1e7] };
    for (const [id, [key, max]] of Object.entries(calcMap)) {
      $('#' + id).addEventListener('input', e => {
        const n = Number(e.target.value);
        C.calc[key] = Math.min(max, Math.max(key === 'count' ? 1 : 0, Number.isFinite(n) ? n : 0));
        refreshNumbers();
      });
    }
    $('#cBracket').addEventListener('change', e => { C.calc.bracket = Number(e.target.value); refreshNumbers(); });
    $('#cInherited').addEventListener('change', e => { C.calc.inherited = e.target.checked; refreshNumbers(); });
    $('#cReno').addEventListener('input', e => { const n = Number(e.target.value); C.calc.renoAuto = false; C.calc.reno = Math.min(1e9, Math.max(0, Number.isFinite(n) ? n : 0)); refreshNumbers(); });
    $('#cRenoHint').addEventListener('click', e => { if (e.target.id === 'btnRenoAuto') { C.calc.renoAuto = true; refreshNumbers(); } });
    $('#modeSeg').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; C.calc.mode = b.dataset.mode === '代管' ? '代管' : '包租'; refreshNumbers(); });

    // 步驟 5
    $('#concernChips').addEventListener('click', e => {
      const b = e.target.closest('[data-concern]');
      if (!b) return;
      const c = b.dataset.concern;
      C.concerns = C.concerns.includes(c) ? C.concerns.filter(x => x !== c) : C.concerns.concat(c);
      b.setAttribute('aria-pressed', String(C.concerns.includes(c)));
      touch();
    });
    $('#concernText').addEventListener('input', e => { C.concernText = e.target.value.slice(0, 200); touch(); });
    $('#btnExplain').addEventListener('click', runExplain);
    $('#btnExplainStop').addEventListener('click', () => running.explain && running.explain.abort());
    $('#btnDownload').addEventListener('click', downloadReport);
    $('#btnLine').addEventListener('click', copyLine);
  }

  demoReady.then(() => {
    const u = id => BL[id] && BL[id].url;
    LD.intro.setImages({ before: u('demo-p1'), after: u('demo-after'), deed: u('demo-deed') });
  });

  /* ================= 啟動 ================= */
  const style = document.createElement('style'); style.textContent = LD.report.REPORT_CSS; document.head.appendChild(style);
  renderBasis();
  bind();
  shownHash = location.hash;
  render(parseHash());
  platform.init().then(() => { AI.checked = true; updateAIState(); });
  LD.app = { startTour, nav };   // 給測試與除錯用
})(globalThis.LD);
