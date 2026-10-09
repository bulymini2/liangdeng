/* 畫面與狀態。資料與計算在其他檔案：rules.js、catalog.js、calc.js、deed.js、prompts.js、charts.js、report.js、platform.js */
(function (LD) {
  'use strict';

  const { esc, fmt, wan, pct, clampInt, today, uid, srcLinks } = LD.util;
  const { computePaths, rankPaths, pathName, conclusionText, lineCost, repairTotals, autoRepairLines } = LD.calc;
  const { CATALOG, FIND_ITEMS, ITEM_LABEL, ROOMS, CONCERNS, RULES, NATIONAL, SRC } = LD;
  const platform = LD.platform;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ================= 狀態 ================= */
  function blankState() {
    return {
      demo: false, step: 1,
      case: { city: 'hsinchu', addr: '', ping: 0, age: 0, rooms: 0, halls: 0, baths: 0, kwh: '' },
      photos: [], diagnosis: null, repairs: [],
      after: { photoId: null, ownBefore: null, prompt: null, afterUrl: null, afterBlob: null },
      deedFields: null, deedDemo: false, deedBlob: null, deedUrl: null,
      calc: { houseValue: 0, landValue: 0, count: 1, inherited: false, bracket: 0.12, rent: 0, renoAuto: true, reno: 0, mode: '包租', vacancy: 1, agentMonths: 0.25, maint: 12000, years: 10 },
      concerns: [], concernText: '', explanation: ''
    };
  }

  /** 示範案例：竹北 25 坪、屋齡 32 年的繼承老公寓。數字都是示範值。 */
  function demoState() {
    const s = blankState();
    s.demo = true;
    s.case = { city: 'hsinchu', addr: '新竹縣竹北市（示範）', ping: 25, age: 32, rooms: 3, halls: 2, baths: 1, kwh: 28 };
    s.diagnosis = {
      demo: true,
      overall: '屋況屬於一般老公寓，結構沒有明顯問題。主要是油漆、地板和浴室設備老舊，客廳靠窗的壁癌要先找出漏水來源。整理完就能出租。',
      photos: [
        { photoId: null, room: '客廳', score: 3, summary: '牆面泛黃、靠窗有壁癌，磁磚地板有裂痕', findings: [
          { item: 'paint', severity: '中', count: 1, evidence: '牆面與天花板整體泛黃、多處髒污' },
          { item: 'leak', severity: '中', count: 1, evidence: '靠窗牆面約一平方公尺油漆起泡、白色結晶' },
          { item: 'floor', severity: '中', count: 1, evidence: '磁磚地板三處裂痕，邊角翹起' },
          { item: 'lighting', severity: '輕', count: 2, evidence: '日光燈老舊，其中一支不亮' } ] },
        { photoId: null, room: '臥室', score: 3, summary: '天花板角落有水漬，沒有冷氣', findings: [
          { item: 'leak', severity: '輕', count: 1, evidence: '天花板角落約手掌大的水漬' },
          { item: 'aircon', severity: '中', count: 1, evidence: '臥室沒有冷氣，牆上留有舊窗型冷氣孔' },
          { item: 'lighting', severity: '輕', count: 1, evidence: '吸頂燈燈罩發黃' } ] },
        { photoId: null, room: '浴室', score: 2, summary: '馬桶與洗臉盆老舊，龍頭鏽蝕', findings: [
          { item: 'bathroom', severity: '中', count: 1, evidence: '馬桶底座黃垢、洗臉盆裂痕、龍頭鏽蝕' } ] },
        { photoId: null, room: '廚房', score: 3, summary: '廚具堪用，熱水器外殼生鏽', findings: [
          { item: 'kitchen', severity: '輕', count: 1, evidence: '水槽龍頭鬆動，檯面矽利康發霉' },
          { item: 'water_heater', severity: '中', count: 1, evidence: '陽台熱水器外殼生鏽、排氣口變色' } ] }
      ]
    };
    s.deedFields = { '門牌': '新竹縣竹北市○○路○○號三樓（示範）', '主要用途': '住家用', '主要建材': '鋼筋混凝土造', '層數': '五層', '層次': '三層', '總面積平方公尺': 84.6, '建築完成日期': '民國083年05月20日', '登記原因': '繼承', '所有權人數': 1, '權利範圍': ['全部'], '他項權利': '無', '讀不清楚的欄位': [] };
    s.deedDemo = true;
    s.calc = { houseValue: 450000, landValue: 600000, count: 1, inherited: false, bracket: 0.2, rent: 18000, renoAuto: true, reno: 0, mode: '包租', vacancy: 1, agentMonths: 0.25, maint: 12000, years: 10 };
    s.concerns = ['擔心房客弄壞房子', '要和家人一起決定'];
    return s;
  }

  let S = demoState();
  rebuildAutoRepairs();

  /** AI 診斷結果更新時，重建自動產生的修繕項目，手動加入的保留。 */
  function rebuildAutoRepairs() {
    const manual = S.repairs.filter(r => !r.auto);
    S.repairs = autoRepairLines(S.diagnosis).map(l => ({ key: uid(), auto: true, on: true, qty: 1, ...l })).concat(manual);
  }

  /* ================= 草稿（只存在這台裝置的瀏覽器） ================= */
  const DRAFT_KEY = 'liangdeng-draft-v1';
  let saveTimer = null;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const copy = { ...S, photos: S.photos.map(p => ({ id: p.id, room: p.room })), after: { ...S.after, afterUrl: null, afterBlob: null, ownBefore: null }, deedBlob: null, deedUrl: null };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(copy));
      } catch (e) { /* 無法儲存也不影響使用 */ }
    }, 400);
  }
  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.case || !d.calc) return null;
      const s = blankState();
      Object.assign(s, d);
      s.calc = { ...blankState().calc, ...d.calc };
      s.photos = (d.photos || []).map(p => ({ id: p.id, room: p.room, blob: null, url: null, lost: true }));
      s.after = { ...blankState().after, prompt: (d.after && d.after.prompt) || null, photoId: (d.after && d.after.photoId) || null };
      return s;
    } catch (e) { return null; }
  }

  /* ================= 衍生資料 ================= */
  const ping = () => S.case.ping || 0;
  const totals = () => repairTotals(S.repairs, ping());
  const renoUsed = () => S.calc.renoAuto ? totals().mid : S.calc.reno;
  const result = () => computePaths({ ...S.calc, city: S.case.city }, renoUsed(), RULES, NATIONAL);
  const calcReady = () => S.calc.rent > 0 && S.calc.houseValue > 0;
  const name = k => pathName(k, S.calc.mode);
  const cityName = () => RULES[S.case.city].name;
  function caseTitle() {
    const c = S.case;
    const place = c.addr ? c.addr.replace(/（示範）/, '') : cityName();
    return place + (c.ping ? ` · ${c.ping} 坪` : '');
  }
  /** 報告與提示詞用的快照 */
  function view() {
    return {
      case: S.case, cityName: cityName(), title: caseTitle(), mode: S.calc.mode,
      res: result(), ready: calcReady(), totals: totals(),
      repairs: S.repairs.map(l => { const [lo, hi] = lineCost(l, ping()); return { ...l, lo, hi, name: l.id === 'custom' ? l.name : CATALOG[l.id].name }; }),
      diagnosis: S.diagnosis, checks: S.deedFields ? LD.deed.deedChecks(S.deedFields) : [],
      explanation: S.explanation, demo: S.demo, date: today()
    };
  }

  /* ================= AI 狀態 ================= */
  const AI = { checked: false, blocked: false };
  const running = {};
  const HIDE_CODES = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
  function aiError(e) {
    const code = e && e.code;
    if (HIDE_CODES.includes(code)) { AI.blocked = true; updateAIState(); return '這個頁面沒有取得使用 Claude 的權限，AI 功能已關閉。試算和報告仍可使用。'; }
    switch (code) {
      case 'cancelled': return '已停止。';
      case 'not_available': return 'AI 目前不能用，請在 Claude 裡開啟這個頁面。';
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
  function updateAIState() {
    const textOK = platform.ai.text && !AI.blocked;
    const imgOK = textOK && platform.ai.images;
    const off = $('#aiOff');
    off.hidden = textOK || !AI.checked;
    off.textContent = platform.kind === 'claude'
      ? 'AI 功能目前無法使用（可能沒有取得 Claude 權限）。示範資料、三條路試算和報告不受影響。'
      : '這個版本在一般瀏覽器開啟，AI 功能要在 Claude 線上原型裡才能用。示範資料、三條路試算和報告都可以操作。';
    $('#btnDiag').disabled = !imgOK || !S.photos.some(p => p.blob) || !!running.diag;
    $('#btnPrompt').disabled = !imgOK || !currentBefore() || !!running.prompt;
    $('#btnDeed').disabled = !imgOK || !S.deedBlob || !!running.deed;
    $('#btnExplain').disabled = !textOK || !!running.explain;
  }
  function setStatus(id, text, busy) { const el = $(id); el.textContent = text || ''; el.classList.toggle('busy', !!busy); }
  function setBusy(key, on) {
    const stop = { diag: '#btnDiagStop', prompt: '#btnPromptStop', deed: '#btnDeedStop', explain: '#btnExplainStop' }[key];
    $(stop).hidden = !on;
    updateAIState();
  }

  /* ================= 照片處理 ================= */
  /** 讀入照片、縮到長邊 1600px、轉成 JPEG。 */
  async function prepImage(file) {
    let src = null, w = 0, h = 0, url = null;
    try { src = await createImageBitmap(file); w = src.width; h = src.height; } catch (e) { src = null; }
    if (!src) {
      url = URL.createObjectURL(file);
      src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      w = src.naturalWidth; h = src.naturalHeight;
    }
    const k = Math.min(1, 1600 / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    cv.getContext('2d').drawImage(src, 0, 0, cw, ch);
    if (url) URL.revokeObjectURL(url);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('toBlob failed');
    return { blob, url: URL.createObjectURL(blob), w: cw, h: ch };
  }
  const blobToDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  const guessRoom = i => ['客廳', '臥室', '浴室', '廚房', '臥室', '陽台'][i] || '其他';
  const photoById = id => S.photos.find(p => p.id === id);

  /* ================= 步驟 1 ================= */
  function fillInputs() {
    const c = S.case, k = S.calc;
    $('#fCity').value = c.city; $('#fAddr').value = c.addr || ''; $('#fPing').value = c.ping || ''; $('#fAge').value = c.age || '';
    $('#fRooms').value = c.rooms || ''; $('#fHalls').value = c.halls || ''; $('#fBaths').value = c.baths || ''; $('#fKwh').value = c.kwh === '' ? '' : c.kwh;
    $('#cHouse').value = k.houseValue || ''; $('#cLand').value = k.landValue || ''; $('#cCount').value = k.count || 1;
    $('#cBracket').value = String(k.bracket); $('#cInherited').checked = !!k.inherited; $('#cRent').value = k.rent || '';
    $('#cReno').value = k.renoAuto ? '' : (k.reno || '');
    $('#cVac').value = k.vacancy; $('#cAgent').value = k.agentMonths; $('#cMaint').value = k.maint;
    $('#concernText').value = S.concernText || '';
  }
  function renderHeader() {
    $('#caseTitle').textContent = (S.case.addr || S.case.ping) ? caseTitle() : '新案件';
    $('#demoChip').hidden = !S.demo;
    $('#demoBanner').hidden = !S.demo;
    const k = Number(S.case.kwh);
    const note = $('#kwhNote');
    if (S.case.kwh !== '' && Number.isFinite(k)) {
      note.innerHTML = k <= 60
        ? `每月約 ${fmt(k)} 度，在 60 度以下：屬內政部統計的「低度使用（用電）住宅」。<a href="${esc(SRC.lowUse.u)}" target="_blank" rel="noopener">定義</a>`
        : `每月約 ${fmt(k)} 度，高於 60 度的低度使用門檻。`;
    } else note.textContent = '台電資料中，每月平均用電 60 度以下的住宅會被列為低度使用住宅，可以向屋主確認電費單。';
  }
  function renderPhotos() {
    const grid = $('#photoGrid');
    const n = S.photos.length;
    $('#photoCount').textContent = n ? `${n} 張` : '';
    grid.innerHTML = !n
      ? `<div class="empty" style="grid-column:1/-1">${S.demo ? '示範案例沒有附照片。開新案件後，' : ''}每個空間拍一張，從門口往內拍、讓牆角和地板入鏡。</div>`
      : S.photos.map((p, i) => `
      <div class="ph">
        <div class="ph-img" style="${p.url ? `background-image:url('${p.url}')` : ''}">${p.url ? '' : '照片未保留<br>請重新加入'}</div>
        <div class="ph-meta">
          <span class="ph-idx">${i + 1}</span>
          <select id="room-${p.id}" data-room="${p.id}" aria-label="第 ${i + 1} 張的空間">${ROOMS.map(r => `<option${r === p.room ? ' selected' : ''}>${r}</option>`).join('')}</select>
          <button class="btn small ghost" type="button" data-del="${p.id}" aria-label="移除第 ${i + 1} 張">移除</button>
        </div>
      </div>`).join('');
    updateAIState();
  }
  function renderFindings() {
    const d = S.diagnosis;
    $('#findCard').hidden = !d;
    if (!d) return;
    $('#overall').textContent = (d.demo ? '（示範）' : '') + (d.overall || '');
    $('#finds').innerHTML = d.photos.map(p => {
      const ph = p.photoId ? photoById(p.photoId) : null;
      const thumb = ph && ph.url ? `style="background-image:url('${ph.url}')"` : '';
      return `<div class="find-card">
      <div class="find-thumb" ${thumb}>${thumb ? '' : esc(p.room)}</div>
      <div>
        <div class="find-title">${esc(p.room)} <span class="score" aria-label="屋況分數 ${p.score} 分">屋況 ${p.score}/5</span></div>
        <div class="hint">${esc(p.summary)}</div>
        ${p.findings.length ? `<ul class="find-list">${p.findings.map(f => `<li><span class="sev s${f.severity}">${esc(ITEM_LABEL[f.item])}・${f.severity}</span><span>${esc(f.evidence)}${f.count > 1 ? `（${f.count}）` : ''}</span></li>`).join('')}</ul>` : '<div class="hint">沒有需要整理的項目。</div>'}
      </div></div>`;
    }).join('');
  }
  function renderRepairs() {
    const list = $('#repairList');
    if (!S.repairs.length) {
      list.innerHTML = '<div class="empty">還沒有修繕項目。AI 診斷照片後會自動列出，也可以從「加入其他項目」手動加入。</div>';
    } else {
      list.innerHTML = S.repairs.map(l => {
        const [a, b] = lineCost(l, ping());
        const it = CATALOG[l.id];
        const nm = l.id === 'custom' ? l.name : it.name;
        let ctrl;
        if (l.id === 'custom') ctrl = '<span class="hint">自訂金額</span>';
        else if (it.tiers) ctrl = `<select id="tier-${l.key}" data-tier="${l.key}" aria-label="整理程度">${['輕', '中', '重'].map(t => `<option value="${t}"${t === (l.tier || '中') ? ' selected' : ''}>${t}｜${it.tierText[t]}</option>`).join('')}</select>`;
        else if (it.perPing) ctrl = `<span class="hint">${ping()} 坪 × ${fmt(it.range[0])}–${fmt(it.range[1])} 元</span>`;
        else ctrl = `<label class="qty">數量 <input id="qty-${l.key}" data-qty="${l.key}" type="number" min="1" max="20" step="1" value="${l.qty || 1}"> ${it.unit}</label><span class="hint">每${it.unit} ${fmt(it.range[0])}–${fmt(it.range[1])} 元</span>`;
        const del = l.auto ? '' : `<button class="btn small ghost" type="button" data-rm="${l.key}">移除</button>`;
        return `<div class="rl-row${l.on ? '' : ' off'}">
        <input type="checkbox" id="on-${l.key}" data-on="${l.key}"${l.on ? ' checked' : ''} aria-label="納入估價">
        <label class="rl-name" for="on-${l.key}"><b>${esc(nm)}</b>${l.detail ? `<span class="rl-detail">${esc(l.detail)}</span>` : ''}</label>
        <span class="amt">${a === b ? fmt(a) : fmt(a) + '–' + fmt(b)}</span>
        <div class="ctrls">${ctrl}${del}</div>
      </div>`;
      }).join('');
    }
    const t = totals();
    $('#repairTotal').innerHTML = S.repairs.some(l => l.on)
      ? `<span class="hint">估計</span><b>${wan(t.mid)}</b><span class="hint">區間 ${wan(t.lo)}–${wan(t.hi)}</span>`
      : '<span class="hint">尚未列入項目</span>';
  }
  function renderBasis() {
    const rows = Object.values(CATALOG).map(it => {
      const price = it.tiers ? ['輕', '中', '重'].map(t => `${t} ${fmt(it.tiers[t][0])}–${fmt(it.tiers[t][1])}`).join('<br>') : `${fmt(it.range[0])}–${fmt(it.range[1])}／${it.unit}`;
      return `<tr><td>${esc(it.name)}</td><td class="txt">${price}</td><td class="txt">${esc(it.note || '')}<br><small>${srcLinks(it.src)}</small></td></tr>`;
    }).join('');
    $('#basisTable').innerHTML = `<thead><tr><th>項目</th><th>費用（元）</th><th>說明與來源</th></tr></thead><tbody>${rows}</tbody>`;
  }

  /* ================= 步驟 2 ================= */
  function currentBefore() {
    if (S.after.photoId === '__own' && S.after.ownBefore) return S.after.ownBefore;
    const p = S.after.photoId ? photoById(S.after.photoId) : null;
    return p && p.blob ? { blob: p.blob, url: p.url, room: p.room, id: p.id, w: p.w, h: p.h } : null;
  }
  function renderStep2() {
    const opts = S.photos.filter(p => p.blob);
    if (!S.after.photoId && opts.length) S.after.photoId = opts[0].id;
    const own = S.after.ownBefore;
    const items = opts.map(p => ({ id: p.id, url: p.url, label: p.room })).concat(own ? [{ id: '__own', url: own.url, label: '另外上傳' }] : []);
    $('#chooseList').innerHTML = items.length
      ? items.map(o => `<label><input type="radio" name="before" id="pick-${o.id}" value="${o.id}"${S.after.photoId === o.id ? ' checked' : ''}><span class="t" style="background-image:url('${o.url}')"></span>${esc(o.label)}</label>`).join('')
      : `<div class="empty" style="width:100%">${S.demo ? '示範案例沒有附照片。' : ''}先在步驟 1 加入照片，或在這裡另外上傳一張。</div>`;
    const pr = S.after.prompt;
    $('#promptBox').hidden = !pr;
    if (pr) { $('#promptEn').textContent = pr.en; $('#promptZh').textContent = pr.zh; }
    const before = currentBefore();
    const wrap = $('#compareWrap');
    if (before && S.after.afterUrl) {
      wrap.innerHTML = `<div class="compare" id="cmp" style="--ar:${before.w || 4}/${before.h || 3}">
      <img src="${S.after.afterUrl}" alt="整理後">
      <div class="cmp-before"><img src="${before.url}" alt="整理前"></div>
      <div class="cmp-line"></div>
      <span class="cmp-tag l">整理前</span><span class="cmp-tag r">整理後</span>
      <input class="cmp-range" id="cmpRange" type="range" min="0" max="100" value="50" aria-label="拖曳比較整理前後">
    </div>`;
      const cmp = $('#cmp');
      $('#cmpRange').addEventListener('input', e => cmp.style.setProperty('--pos', e.target.value + '%'));
    } else {
      wrap.innerHTML = `<div class="empty">${before ? '上傳整理後的圖片後，這裡會顯示前後對照。' : '選一張原圖並上傳整理後的圖片，這裡會顯示前後對照。'}</div>`;
    }
    updateAIState();
  }

  /* ================= 步驟 3 ================= */
  function renderDeed() {
    $('#deedThumb').innerHTML = S.deedUrl ? `<div class="find-thumb deed" style="background-image:url('${S.deedUrl}')"></div>` : '';
    const f = S.deedFields;
    $('#deedCard').hidden = !f;
    if (!f) { updateAIState(); return; }
    const val = v => v == null || v === '' ? '<span class="muted">讀不到</span>' : esc(Array.isArray(v) ? v.join('、') : v);
    const unclear = Array.isArray(f['讀不清楚的欄位']) && f['讀不清楚的欄位'].length ? `<p class="hint">AI 標記為看不清楚：${esc(f['讀不清楚的欄位'].join('、'))}</p>` : '';
    $('#deedResult').innerHTML = `${S.deedDemo ? '<p class="hint">（示範謄本）</p>' : ''}
    <ul class="checks">${LD.deed.deedChecks(f).map(c => `<li><span class="st ${c.s}">${c.l}</span><div><b>${esc(c.t)}</b><span class="d">${esc(c.d)}</span></div></li>`).join('')}</ul>
    <details><summary>讀出的欄位</summary><div class="table-wrap"><table><tbody>${LD.deed.DEED_KEYS.map(k => `<tr><td>${k}</td><td class="txt">${val(f[k])}</td></tr>`).join('')}</tbody></table></div></details>${unclear}
    <p class="hint">資格條件參考：${srcLinks(['law'])}。最後是否能加入，以業者與主管機關審查為準。</p>`;
    updateAIState();
  }

  /* ================= 步驟 4 ================= */
  function drawCumChart(res) {
    const box = $('#cumChart');
    const { svg, geo } = LD.charts.lineChartSVG(res, S.calc.mode, true);
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
  function renderCalc() {
    const t = totals();
    $('#cRenoHint').innerHTML = S.calc.renoAuto
      ? `使用修繕清單估計值（${wan(t.mid)}）`
      : `已手動輸入。<button class="btn small ghost" type="button" id="btnRenoAuto">改用修繕清單估計值 ${wan(t.mid)}</button>`;
    if (S.calc.renoAuto) $('#cReno').value = t.mid || 0;
    $$('#modeSeg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === S.calc.mode)));
    $('#modeHint').textContent = S.calc.mode === '包租' ? '業者擔任二房東，每月付屋主市價 8 折，簽 3 年；空租風險由業者承擔。' : '屋主直接和房客簽約、租金市價 9 折，業者負責管理；空租期間沒有租金。';
    const res = result();
    const ready = calcReady();
    $('#conclusion').textContent = ready ? conclusionText(res, S.calc.mode) : '填入房屋評定現值和整理後的市場月租，就會算出三條路的結果。';
    const best = rankPaths(res)[0].key;
    const card = p => {
      const bullets = p.key === 'vacant'
        ? [`房屋稅 ${pct(p.houseRate)}：每年 ${fmt(p.house)} 元`, `地價稅：每年 ${fmt(p.land)} 元`, '沒有租金收入']
        : p.key === 'self'
          ? [`租金 ${fmt(S.calc.rent)} 元 × ${p.months} 個月`, `房屋稅 ${pct(p.houseRate)}、所得稅每年 ${fmt(p.income)} 元`, '自己找房客、收租、修繕']
          : [`屋主每月實拿 ${fmt(p.monthly)} 元 × ${p.months} 個月`, `房屋稅 ${pct(p.houseRate)}、所得稅每年 ${fmt(p.income)} 元`, `修繕補助每年 ${fmt(p.subsidy)} 元，業者管理`];
      const pay = p.payback ? `・約第 ${p.payback} 年回收整理費` : '';
      const isBest = ready && p.key === best;
      return `<div class="path${isBest ? ' best' : ''}" data-path="${p.key}">
      <div class="path-key"><i class="sw sw-${p.key}"></i>${esc(name(p.key))}${isBest ? '<span class="badge">十年最高</span>' : ''}</div>
      <div class="big">${wan(p.total)}</div>
      <div class="sub">每年 ${p.net >= 0 ? '+' : ''}${fmt(p.net)} 元${pay}</div>
      <ul>${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    </div>`;
    };
    $('#paths').innerHTML = [res.A, res.B, res.C].map(card).join('');
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
    const r = RULES[S.case.city];
    const note = S.case.city === 'hsinchu'
      ? { vacant: '非自住住家用（全國歸戶）：1 戶 2.6%、2–4 戶 3.2%、5–6 戶 3.8%、7 戶以上 4.8%。新竹縣稅務局公布的範圍是 2.6%–4.8%，級距依財政部基準。', rent: '出租並申報租賃所得達當地一般租金標準（或繼承共有）：新竹縣 1.6%–2.4%；級距（4 戶以內、5–6 戶、7 戶以上）依財政部基準推定。', social: '社宅包租代管：特定房屋 1.6%，再依新竹縣自治條例減徵房屋稅額 25%，實質 1.2%。', src: { vacant: ['hcRent', 'mofBase'], rent: ['hcRent', 'mofBase'], social: ['hcSocial', 'hc2022'] } }
      : { vacant: '非自住住家用（全國歸戶）：2 戶以內 3.2%、3–4 戶 3.8%、5–6 戶 4.2%、7 戶以上 4.8%。', rent: '出租並申報租賃所得達租金標準（或繼承共有）：4 戶以內 1.5%、5–6 戶 2.0%、7 戶以上 2.4%。', social: '社宅包租代管：房屋稅率減徵為 1%。116 年期仍有稅基折減（實質 0.875%），試算從嚴取 1%。', src: { vacant: ['tpTax2'], rent: ['tpTax2', 'mofBase'], social: ['tpSocial', 'tpTable'] } };
    const rules = [
      [`房屋稅・繼續空著：本案適用 ${pct(res.vacantRate)}${S.calc.inherited ? '（繼承共有）' : ''}`, S.calc.inherited ? note.rent : note.vacant, S.calc.inherited ? note.src.rent : note.src.vacant],
      [`房屋稅・自己出租：本案適用 ${pct(res.rentRate)}`, note.rent + ' 試算假設屋主誠實申報租金。', note.src.rent],
      [`房屋稅・社宅包租代管：本案適用 ${pct(res.socialRate)}`, note.social, note.src.social],
      [`地價稅：一般 ${fmt(res.landGen)} 元／年；社宅包租代管 ${fmt(res.landSoc)} 元／年`, '一般用地基本稅率千分之十（假設未超過累進起點地價）；社宅包租代管減徵應納地價稅 80%。', S.case.city === 'hsinchu' ? ['hcSocial'] : ['tpSocial', 'tpTable']],
      ['租金所得稅', `自己出租：租金扣除 43% 必要費用後，按屋主級距 ${pct(S.calc.bracket)} 計算。社宅包租代管：每屋每月 1.5 萬元以內免稅，超過部分扣除 60% 費用。`, ['ntbt', 'law']],
      ['社宅包租代管的補助與租金', `修繕費每年最高 1 萬元（實支實付）、包租另有居家安全保險費每年最高 3,500 元、公證費每件最高 ${fmt(r.notary)} 元；包租為市價 8 折、代管為市價 9 折。各縣市另有可加入的租金上限，以當期計畫公告為準。`, ['subsidy']],
      ['期限', '住宅法第 22、23 條的租稅優惠有五年實施年限，屆期前由行政院決定是否延長；行政院已核定包租代管計畫推動到民國 121 年。試算假設十年內優惠延續。', ['law', 'plan']]
    ];
    $('#rulesList').innerHTML = rules.map(([h, d, s]) => `<li><b>${esc(h)}</b><br>${esc(d)}<small>來源：${srcLinks(s)}</small></li>`).join('') +
      '<li><b>試算範圍</b><br>社區管理費三條路相同，未列入；所得稅以屋主目前級距估算，不考慮跳級；稅額以稅捐機關核定為準。</li>';
  }

  /* ================= 步驟 5 ================= */
  function renderConcerns() {
    $('#concernChips').innerHTML = CONCERNS.map(c => `<button type="button" class="chip" data-concern="${esc(c)}" aria-pressed="${S.concerns.includes(c)}">${esc(c)}</button>`).join('');
    if (!running.explain) $('#explainOut').textContent = S.explanation || '選好屋主的顧慮後，按「AI 白話說明」。';
  }
  function renderReport() {
    const before = currentBefore();
    $('#reportPreview').innerHTML = LD.report.reportHTML(view(), { before: before && before.url, after: S.after.afterUrl });
  }

  /* ================= 摘要與進度 ================= */
  function renderSummary() {
    $('#sumCase').textContent = (S.case.addr || S.case.ping) ? caseTitle() : '尚未填寫';
    const t = totals(), has = S.repairs.some(l => l.on);
    $('#sumReno').textContent = has ? wan(t.mid) : '—';
    $('#sumRenoRange').textContent = has ? `區間 ${wan(t.lo)}–${wan(t.hi)}` : '';
    $('#sumBars').innerHTML = calcReady() ? LD.charts.barsHTML(result(), S.calc.mode) : '<span class="hint">填入稅單現值和月租後顯示</span>';
    $('#sumNote').textContent = S.demo ? '示範案例的數字都是示範值。' : '';
  }
  function renderFacade() {
    const done = { 1: S.repairs.some(l => l.on), 2: !!(currentBefore() && S.after.afterUrl), 3: !!S.deedFields, 4: calcReady(), 5: !!S.explanation };
    $$('.win').forEach(w => {
      const n = Number(w.dataset.step);
      w.classList.toggle('done', !!done[n]);
      if (n === S.step) w.setAttribute('aria-current', 'step'); else w.removeAttribute('aria-current');
      w.setAttribute('aria-label', `步驟 ${n} ${w.querySelector('.lbl').textContent.replace(/^\d/, '')}${done[n] ? '（已完成）' : ''}`);
    });
  }
  function go(step) {
    S.step = step;
    $$('[data-panel]').forEach(p => { p.hidden = Number(p.dataset.panel) !== step; });
    renderFacade();
    if (step === 5) renderReport();
    window.scrollTo({ top: 0, behavior: 'auto' });
    saveDraft();
  }
  function renderAll() {
    renderHeader(); renderPhotos(); renderFindings(); renderRepairs(); renderStep2(); renderDeed(); renderCalc(); renderConcerns(); renderReport(); renderSummary(); renderFacade();
    saveDraft();
  }
  function refreshNumbers() { renderRepairs(); renderCalc(); renderSummary(); renderFacade(); if (S.step === 5) renderReport(); saveDraft(); }

  /* ================= AI 動作 ================= */
  async function runDiagnosis() {
    const photos = S.photos.filter(p => p.blob);
    if (!photos.length) return;
    const ctl = new AbortController(); running.diag = ctl; setBusy('diag', true);
    setStatus('#diagStatus', `AI 正在看 ${photos.length} 張照片，通常要 20–60 秒…`, true);
    const per = Math.max(1, platform.ai.maxImages);
    const results = [], overall = [];
    try {
      for (let i = 0; i < photos.length; i += per) {
        const batch = photos.slice(i, i + per);
        if (photos.length > per) setStatus('#diagStatus', `AI 正在看第 ${i + 1}–${Math.min(photos.length, i + per)} 張，共 ${photos.length} 張…`, true);
        const out = await platform.json(LD.prompts.diagPrompt(batch, i), { images: batch.map(p => p.blob), signal: ctl.signal });
        const norm = LD.prompts.normalizeDiag(out, batch, i);
        results.push(...norm.photos);
        if (norm.overall) overall.push(norm.overall);
      }
      S.diagnosis = { photos: results, overall: overall.join(' ') };
      S.demo = false;
      rebuildAutoRepairs();
      const count = results.reduce((s, p) => s + p.findings.length, 0);
      setStatus('#diagStatus', `完成：${results.length} 個空間，找到 ${count} 個待整理項目。`);
      renderAll();
    } catch (e) {
      setStatus('#diagStatus', aiError(e));
    } finally {
      running.diag = null; setBusy('diag', false);
    }
  }
  async function runPrompt() {
    const before = currentBefore();
    if (!before) return;
    const diagPhoto = S.diagnosis && S.diagnosis.photos.find(p => p.photoId === before.id);
    const room = before.room || (diagPhoto && diagPhoto.room) || '其他';
    const ctl = new AbortController(); running.prompt = ctl; setBusy('prompt', true);
    setStatus('#promptStatus', 'AI 正在看照片、寫改圖指令…', true);
    try {
      const out = await platform.json(LD.prompts.editPrompt(room, diagPhoto ? diagPhoto.findings : []), { images: [before.blob], signal: ctl.signal });
      const en = String((out && out.en) || '').trim(), zh = String((out && out.zh) || '').trim();
      if (!en) throw { code: 'invalid_json' };
      S.after.prompt = { en: en.slice(0, 1200), zh: zh.slice(0, 200) };
      setStatus('#promptStatus', '指令完成，複製後貼到影像生成工具。');
      renderStep2(); saveDraft();
    } catch (e) {
      setStatus('#promptStatus', aiError(e));
    } finally {
      running.prompt = null; setBusy('prompt', false);
    }
  }
  async function runDeed() {
    if (!S.deedBlob) return;
    const ctl = new AbortController(); running.deed = ctl; setBusy('deed', true);
    setStatus('#deedStatus', 'AI 正在讀謄本…', true);
    try {
      const out = await platform.json(LD.deed.DEED_PROMPT, { images: [S.deedBlob], signal: ctl.signal });
      S.deedFields = LD.deed.normalizeDeed(out); S.deedDemo = false;
      const yr = LD.deed.rocYear(S.deedFields['建築完成日期']);
      if (yr) { S.case.age = new Date().getFullYear() - (yr + 1911); $('#fAge').value = S.case.age; }
      setStatus('#deedStatus', '判讀完成，請對照謄本確認。');
      renderAll();
    } catch (e) {
      setStatus('#deedStatus', aiError(e));
    } finally {
      running.deed = null; setBusy('deed', false);
    }
  }
  async function runExplain() {
    if (!calcReady()) { setStatus('#explainStatus', '請先在步驟 4 填入房屋評定現值和月租。'); return; }
    const ctl = new AbortController(); running.explain = ctl; setBusy('explain', true);
    const out = $('#explainOut');
    out.textContent = '';
    setStatus('#explainStatus', 'AI 正在整理說明…', true);
    const concerns = S.concerns.slice();
    if (S.concernText.trim()) concerns.push(S.concernText.trim().slice(0, 200));
    const v = { title: caseTitle(), age: S.case.age, concerns, res: result(), totals: totals(), mode: S.calc.mode, notary: RULES[S.case.city].notary };
    try {
      const { text, truncated } = await platform.text(LD.prompts.explainPrompt(v), {
        signal: ctl.signal, cache: false,
        onText: u => { out.textContent = u.text; setStatus('#explainStatus', 'AI 正在寫…', true); }
      });
      S.explanation = text;
      setStatus('#explainStatus', truncated ? '說明被截斷，可以再產生一次。' : '完成。已放進下方報告。');
      renderReport(); renderFacade(); saveDraft();
    } catch (e) {
      out.textContent = (e && e.text) || S.explanation || '';
      setStatus('#explainStatus', aiError(e));
    } finally {
      running.explain = null; setBusy('explain', false);
    }
  }

  /* ================= 報告下載與 LINE ================= */
  async function downloadReport() {
    const st = '#reportStatus';
    if (!platform.canSave()) { setStatus(st, '這個檢視不能下載檔案，請改用「複製 LINE 訊息」。'); return; }
    try {
      setStatus(st, '正在準備報告…', true);
      const before = currentBefore();
      const img = {};
      if (before && S.after.afterBlob) { img.before = await blobToDataURL(before.blob); img.after = await blobToDataURL(S.after.afterBlob); }
      const v = view();
      await platform.saveFile(LD.report.reportFilename(v), LD.report.reportDocument(v, img), LD.report.reportAsciiName(v));
      setStatus(st, '已下載。檔案可以直接用瀏覽器開啟，或用 LINE 傳給屋主。');
    } catch (e) {
      const c = e && e.code;
      setStatus(st, c === 'declined' ? '已取消下載。' : c === 'rate_limited' ? '已有一個下載視窗開著，請先處理它。' : '這個檢視不能下載檔案，請改用「複製 LINE 訊息」。');
    }
  }
  function copyLine(btn) {
    const text = LD.report.lineMessage(view());
    const ta = $('#lineText');
    const fallback = () => { ta.hidden = false; ta.value = text; ta.focus(); ta.select(); setStatus('#reportStatus', '無法自動複製，訊息已選取，請手動複製。'); };
    try {
      navigator.clipboard.writeText(text).then(() => {
        setStatus('#reportStatus', '已複製 LINE 訊息，記得把下載的報告一起傳給屋主。');
        btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 1200);
      }, fallback);
    } catch (e) { fallback(); }
  }

  /* ================= 事件 ================= */
  function abortAll() { for (const k of Object.keys(running)) if (running[k]) running[k].abort(); }
  function bind() {
    // 讓「加入照片」這類 label 按鈕可以用鍵盤操作
    $$('label.btn[for]').forEach(l => {
      const input = document.getElementById(l.htmlFor);
      if (!input || input.type !== 'file') return;
      l.tabIndex = 0; input.tabIndex = -1;
      l.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    });
    $$('.win').forEach(w => w.addEventListener('click', () => go(Number(w.dataset.step))));
    $$('[data-go]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.go))));

    let newArmed = null;
    $('#btnNew').addEventListener('click', e => {
      const b = e.currentTarget;
      if (!newArmed) {
        b.textContent = '確定清空？再按一次';
        newArmed = setTimeout(() => { newArmed = null; b.textContent = '開新案件'; }, 4000);
        return;
      }
      clearTimeout(newArmed); newArmed = null; b.textContent = '開新案件';
      abortAll();
      S = blankState();
      fillInputs(); renderAll(); go(1);
      ['#diagStatus', '#promptStatus', '#deedStatus', '#explainStatus', '#reportStatus'].forEach(id => setStatus(id, ''));
    });
    $('#btnDemo').addEventListener('click', () => {
      abortAll();
      S = demoState(); rebuildAutoRepairs(); fillInputs(); renderAll(); go(1);
    });

    // 步驟 1：基本資料
    const caseMap = { fCity: 'city', fAddr: 'addr', fPing: 'ping', fAge: 'age', fRooms: 'rooms', fHalls: 'halls', fBaths: 'baths', fKwh: 'kwh' };
    for (const [id, key] of Object.entries(caseMap)) {
      $('#' + id).addEventListener('input', e => {
        const el = e.target, n = Number(el.value);
        if (key === 'city' || key === 'addr') S.case[key] = el.value;
        else if (key === 'kwh') S.case.kwh = el.value === '' ? '' : Math.max(0, Number.isFinite(n) ? n : 0);
        else S.case[key] = Math.max(0, Number.isFinite(n) ? n : 0);
        renderHeader(); refreshNumbers();
      });
    }
    $('#photoInput').addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      if (S.demo) { S = blankState(); fillInputs(); }
      setStatus('#diagStatus', `正在處理 ${files.length} 張照片…`, true);
      let bad = 0;
      for (const f of files) {
        try {
          const im = await prepImage(f);
          S.photos.push({ id: uid(), room: guessRoom(S.photos.length), blob: im.blob, url: im.url, w: im.w, h: im.h });
        } catch (err) { bad++; }
      }
      S.photos = S.photos.filter(p => p.blob || !p.lost);
      const canAI = platform.ai.text && platform.ai.images && !AI.blocked;
      setStatus('#diagStatus', bad ? `${bad} 張照片無法讀取，請改用 JPG 或 PNG。` : (canAI ? '照片已加入。確認每張的空間後，按「AI 診斷照片」。' : '照片已加入。'));
      renderAll();
    });
    $('#photoGrid').addEventListener('change', e => {
      const id = e.target.dataset.room;
      if (!id) return;
      const p = photoById(id); if (p) p.room = e.target.value;
      saveDraft();
    });
    $('#photoGrid').addEventListener('click', e => {
      const id = e.target.dataset && e.target.dataset.del;
      if (!id) return;
      S.photos = S.photos.filter(p => p.id !== id);
      if (S.after.photoId === id) S.after.photoId = null;
      renderPhotos(); renderStep2(); renderFindings(); saveDraft();
    });
    $('#btnDiag').addEventListener('click', runDiagnosis);
    $('#btnDiagStop').addEventListener('click', () => running.diag && running.diag.abort());

    // 修繕清單
    const rl = $('#repairList');
    rl.addEventListener('change', e => {
      const t = e.target, d = t.dataset;
      const find = key => S.repairs.find(l => l.key === key);
      if (d.on) { const l = find(d.on); if (l) l.on = t.checked; }
      else if (d.tier) { const l = find(d.tier); if (l) l.tier = t.value; }
      else if (d.qty) { const l = find(d.qty); if (l) l.qty = clampInt(t.value, 1, 1, 20); }
      else return;
      refreshNumbers();
    });
    rl.addEventListener('click', e => {
      const k = e.target.dataset && e.target.dataset.rm;
      if (!k) return;
      S.repairs = S.repairs.filter(l => l.key !== k);
      refreshNumbers();
    });
    $('#quickAdd').addEventListener('click', e => {
      const id = e.target.dataset && e.target.dataset.add;
      if (!id) return;
      const it = CATALOG[id];
      S.repairs.push({ key: uid(), id, auto: false, on: true, qty: 1, tier: it.tiers ? '中' : undefined, detail: '手動加入' });
      refreshNumbers();
    });
    $('#customForm').addEventListener('submit', e => {
      e.preventDefault();
      const nm = $('#customName').value.trim(), amt = Number($('#customAmt').value);
      if (!nm || !(amt > 0)) return;
      S.repairs.push({ key: uid(), id: 'custom', name: nm.slice(0, 40), amount: Math.round(amt), auto: false, on: true, detail: '自訂' });
      $('#customName').value = ''; $('#customAmt').value = '';
      refreshNumbers();
    });

    // 步驟 2
    $('#chooseList').addEventListener('change', e => {
      if (e.target.name !== 'before') return;
      S.after.photoId = e.target.value;
      S.after.prompt = null;
      renderStep2(); renderReport(); renderFacade();
    });
    $('#beforeInput').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const im = await prepImage(f);
        S.after.ownBefore = { blob: im.blob, url: im.url, w: im.w, h: im.h, room: '其他', id: '__own' };
        S.after.photoId = '__own'; S.after.prompt = null;
        setStatus('#promptStatus', '');
      } catch (err) { setStatus('#promptStatus', '這張照片無法讀取，請改用 JPG 或 PNG。'); }
      renderStep2(); renderFacade();
    });
    $('#afterInput').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const im = await prepImage(f);
        S.after.afterBlob = im.blob; S.after.afterUrl = im.url;
      } catch (err) { setStatus('#promptStatus', '這張圖片無法讀取，請改用 JPG 或 PNG。'); }
      renderStep2(); renderFacade(); renderReport();
    });
    $('#btnPrompt').addEventListener('click', runPrompt);
    $('#btnPromptStop').addEventListener('click', () => running.prompt && running.prompt.abort());
    $('#btnCopyPrompt').addEventListener('click', () => {
      const text = S.after.prompt ? S.after.prompt.en : '';
      const fb = () => { const r = document.createRange(); r.selectNodeContents($('#promptEn')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); setStatus('#promptStatus', '已選取指令，請手動複製。'); };
      try { navigator.clipboard.writeText(text).then(() => setStatus('#promptStatus', '已複製英文指令。'), fb); } catch (err) { fb(); }
    });

    // 步驟 3
    $('#deedInput').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const im = await prepImage(f);
        S.deedBlob = im.blob; S.deedUrl = im.url;
        if (S.deedDemo) { S.deedFields = null; S.deedDemo = false; }
        const canAI = platform.ai.text && platform.ai.images && !AI.blocked;
        setStatus('#deedStatus', canAI ? '謄本已上傳，按「AI 判讀謄本」。' : '謄本已上傳。');
      } catch (err) { setStatus('#deedStatus', '這張照片無法讀取，請改用 JPG 或 PNG。'); }
      renderDeed(); renderFacade();
    });
    $('#btnDeed').addEventListener('click', runDeed);
    $('#btnDeedStop').addEventListener('click', () => running.deed && running.deed.abort());

    // 步驟 4
    const calcMap = { cHouse: 'houseValue', cLand: 'landValue', cCount: 'count', cRent: 'rent', cVac: 'vacancy', cAgent: 'agentMonths', cMaint: 'maint' };
    for (const [id, key] of Object.entries(calcMap)) {
      $('#' + id).addEventListener('input', e => { const n = Number(e.target.value); S.calc[key] = Math.max(0, Number.isFinite(n) ? n : 0); refreshNumbers(); });
    }
    $('#cBracket').addEventListener('change', e => { S.calc.bracket = Number(e.target.value); refreshNumbers(); });
    $('#cInherited').addEventListener('change', e => { S.calc.inherited = e.target.checked; refreshNumbers(); });
    $('#cReno').addEventListener('input', e => { const n = Number(e.target.value); S.calc.renoAuto = false; S.calc.reno = Math.max(0, Number.isFinite(n) ? n : 0); refreshNumbers(); });
    $('#cRenoHint').addEventListener('click', e => { if (e.target.id === 'btnRenoAuto') { S.calc.renoAuto = true; refreshNumbers(); } });
    $('#modeSeg').addEventListener('click', e => { const m = e.target.dataset && e.target.dataset.mode; if (!m) return; S.calc.mode = m; refreshNumbers(); });

    // 步驟 5
    $('#concernChips').addEventListener('click', e => {
      const c = e.target.dataset && e.target.dataset.concern;
      if (!c) return;
      S.concerns = S.concerns.includes(c) ? S.concerns.filter(x => x !== c) : S.concerns.concat(c);
      e.target.setAttribute('aria-pressed', String(S.concerns.includes(c)));
      saveDraft();
    });
    $('#concernText').addEventListener('input', e => { S.concernText = e.target.value; saveDraft(); });
    $('#btnExplain').addEventListener('click', runExplain);
    $('#btnExplainStop').addEventListener('click', () => running.explain && running.explain.abort());
    $('#btnDownload').addEventListener('click', downloadReport);
    $('#btnLine').addEventListener('click', e => copyLine(e.currentTarget));
  }

  /* ================= 啟動 ================= */
  const style = document.createElement('style'); style.textContent = LD.report.REPORT_CSS; document.head.appendChild(style);
  const draft = loadDraft();
  if (draft) S = draft;
  renderBasis();
  bind();
  fillInputs();
  renderAll();
  const m = String(location.hash || '').match(/^#step([1-5])$/);
  go(m ? Number(m[1]) : (S.step || 1));
  platform.init().then(() => { AI.checked = true; updateAIState(); });
})(globalThis.LD);
