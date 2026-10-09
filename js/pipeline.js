/* 業者端總覽：案件狀態、轉換率、預估收入。純函式，不碰畫面。 */
(function (LD) {
  'use strict';

  /** 案件狀態，依拜訪流程排序 */
  const STATUSES = [
    { key: 'visit',    label: '拜訪中',     tone: 'neutral' },
    { key: 'report',   label: '已出報告',   tone: 'info' },
    { key: 'thinking', label: '屋主考慮中', tone: 'warn' },
    { key: 'signed',   label: '已簽約',     tone: 'good' },
    { key: 'lost',     label: '未成交',     tone: 'muted' }
  ];
  const STATUS = Object.fromEntries(STATUSES.map(s => [s.key, s]));

  /**
   * 預設的收入假設（可在總覽頁調整）。
   * devFee：業者每簽一戶向政府申請的開發費或媒合費，各縣市不同，預設用桃園市首次媒合的業者分享數字。
   * serviceFee：亮燈每簽一戶向業者收的服務費（提案書的初步測試價）。
   */
  const DEFAULT_FEES = { devFee: { '包租': 18000, '代管': 13000 }, serviceFee: 2500 };

  /**
   * 統計。cases：[{ status, calc: { mode }, ... }]
   * 回傳拜訪數、出報告數（狀態不是拜訪中）、簽約數、轉換率、各狀態數量、預估收入
   */
  function pipelineStats(cases, fees) {
    const f = fees || DEFAULT_FEES;
    const count = Object.fromEntries(STATUSES.map(s => [s.key, 0]));
    for (const c of cases) if (count[c.status] != null) count[c.status]++;
    const visits = cases.length;
    const reported = visits - count.visit;
    const signed = count.signed;
    const decided = count.signed + count.lost;
    const signedCases = cases.filter(c => c.status === 'signed');
    const devIncome = signedCases.reduce((s, c) => s + (f.devFee[(c.calc && c.calc.mode) || '包租'] || 0), 0);
    return {
      visits, reported, signed, decided, count,
      reportRate: visits ? reported / visits : 0,
      signRate: visits ? signed / visits : 0,
      closeRate: decided ? signed / decided : 0,
      devIncome,
      serviceIncome: signed * f.serviceFee,
      openCases: count.visit + count.report + count.thinking
    };
  }

  /** 需要追蹤的案件：考慮中或已出報告、且有追蹤日期，依日期排序 */
  function followUps(cases, today) {
    return cases
      .filter(c => (c.status === 'thinking' || c.status === 'report') && c.followUp)
      .map(c => ({ c, overdue: c.followUp < today }))
      .sort((a, b) => a.c.followUp.localeCompare(b.c.followUp));
  }

  /** 匯出 CSV（Excel 可直接開，含 BOM） */
  function casesCSV(rows) {
    const q = v => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = ['建立日期', '案件', '縣市', '坪數', '屋齡', '狀態', '追蹤日期', '社宅方案', '整理費用估計', '繼續空著10年', '自己出租10年', '社宅10年', '備註', '示範'];
    return '﻿' + [head].concat(rows.map(r => [r.created, r.title, r.city, r.ping, r.age, r.status, r.followUp, r.mode, r.reno, r.vacant, r.self, r.social, r.note, r.demo ? '是' : ''])).map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }

  /* ---------- 案件資料格式 ---------- */
  const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const STAMP_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
  const okId = v => typeof v === 'string' && ID_RE.test(v);
  const BRACKETS = [0.05, 0.12, 0.2, 0.3, 0.4];

  /** 空白案件。today：'YYYY-MM-DD' */
  function blankCase(id, today) {
    return {
      id, demo: false, status: 'visit', followUp: '', note: '', createdAt: today, updatedAt: today, step: 1,
      case: { city: 'hsinchu', addr: '', ping: 0, age: 0, rooms: 0, halls: 0, baths: 0, kwh: '' },
      photos: [], diagnosis: null, repairs: [],
      after: { photoId: null, prompt: null, afterId: null, ownBefore: null },
      deedFields: null, deedDemo: false, deedImgId: null,
      calc: { houseValue: 0, landValue: 0, count: 1, inherited: false, bracket: 0.12, rent: 0, renoAuto: true, reno: 0, mode: '包租', vacancy: 1, agentMonths: 0.25, maint: 12000, years: 10 },
      concerns: [], concernText: '', explanation: ''
    };
  }

  /** 空白案件：什麼都還沒填（離開時不保存） */
  function isBlankCase(c) {
    return !c.demo && c.status === 'visit' && !c.case.addr && !c.case.ping && !c.photos.length && !c.calc.rent && !c.calc.houseValue &&
      !c.deedImgId && !c.note && !c.followUp && !(c.repairs || []).length && !c.after.afterId;
  }

  /**
   * 把存起來或從備份檔讀進來的案件整理成目前的格式：
   * 欄位補齊、數字限制範圍、代碼只接受已知值、ID 只接受英數字（會放進網址和 HTML 屬性）。
   * 格式不對回傳 null。示範案件不會經過這裡（不保存）。
   */
  function normalizeCase(raw, today) {
    if (!raw || typeof raw !== 'object' || !okId(raw.id)) return null;
    const o = blankCase(raw.id, today);
    const num = (v, d, lo, hi) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };
    const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));
    const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);
    const sev = v => ['輕', '中', '重'].includes(v) ? v : '中';
    const room = v => LD.ROOMS.includes(v) ? v : '其他';
    const size = v => int(v, 0, 0, 20000);

    o.status = has(STATUS, raw.status) ? raw.status : 'visit';
    o.followUp = DATE_RE.test(raw.followUp) ? raw.followUp : '';
    o.note = str(raw.note, 120);
    o.createdAt = DATE_RE.test(raw.createdAt) ? raw.createdAt : today;
    o.updatedAt = STAMP_RE.test(raw.updatedAt) ? raw.updatedAt : o.createdAt;
    o.step = int(raw.step, 1, 1, 5);

    const k = raw.case || {};
    o.case = {
      city: has(LD.RULES, k.city) ? k.city : 'hsinchu', addr: str(k.addr, 80),
      ping: num(k.ping, 0, 0, 1000), age: int(k.age, 0, 0, 150),
      rooms: int(k.rooms, 0, 0, 20), halls: int(k.halls, 0, 0, 20), baths: int(k.baths, 0, 0, 20),
      kwh: k.kwh === '' || k.kwh == null ? '' : num(k.kwh, '', 0, 100000)
    };

    o.photos = (Array.isArray(raw.photos) ? raw.photos : []).filter(p => p && okId(p.id)).slice(0, 40)
      .map(p => ({ id: p.id, room: room(p.room), w: size(p.w), h: size(p.h) }));

    const d = raw.diagnosis;
    o.diagnosis = d && Array.isArray(d.photos) ? {
      photos: d.photos.filter(p => p && typeof p === 'object').slice(0, 40).map(p => ({
        photoId: okId(p.photoId) ? p.photoId : null, room: room(p.room), score: int(p.score, 3, 1, 5), summary: str(p.summary, 80),
        findings: (Array.isArray(p.findings) ? p.findings : []).filter(f => f && LD.FIND_ITEMS.includes(f.item)).slice(0, 20)
          .map(f => ({ item: f.item, severity: sev(f.severity), count: int(f.count, 1, 1, 12), evidence: str(f.evidence, 60) }))
      })),
      overall: str(d.overall, 240)
    } : null;

    o.repairs = Array.isArray(raw.repairs)
      ? raw.repairs.filter(l => l && (l.id === 'custom' || has(LD.CATALOG, l.id))).slice(0, 60).map((l, i) => {
        const line = { key: 'r' + i, id: l.id, auto: l.auto === true, on: l.on !== false, qty: int(l.qty, 1, 1, 20), detail: str(l.detail, 120) };
        if (l.id === 'custom') { line.name = str(l.name, 40) || '自訂項目'; line.amount = int(l.amount, 0, 0, 1e8); }
        else if (LD.CATALOG[l.id].tiers) line.tier = sev(l.tier);
        return line;
      })
      : null; // null：開啟時依診斷結果產生

    const a = raw.after || {};
    o.after = {
      photoId: okId(a.photoId) ? a.photoId : null,
      prompt: a.prompt && typeof a.prompt.en === 'string' ? { en: str(a.prompt.en, 1200), zh: str(a.prompt.zh, 200) } : null,
      afterId: okId(a.afterId) ? a.afterId : null,
      ownBefore: a.ownBefore && okId(a.ownBefore.id) ? { id: a.ownBefore.id, w: size(a.ownBefore.w), h: size(a.ownBefore.h) } : null
    };

    o.deedFields = raw.deedFields && typeof raw.deedFields === 'object' ? LD.deed.normalizeDeed(raw.deedFields) : null;
    o.deedImgId = okId(raw.deedImgId) ? raw.deedImgId : null;

    const c = raw.calc || {};
    o.calc = {
      houseValue: num(c.houseValue, 0, 0, 1e10), landValue: num(c.landValue, 0, 0, 1e11), count: int(c.count, 1, 1, 50),
      inherited: c.inherited === true, bracket: BRACKETS.includes(c.bracket) ? c.bracket : 0.12,
      rent: num(c.rent, 0, 0, 1e7), renoAuto: c.renoAuto !== false, reno: num(c.reno, 0, 0, 1e9),
      mode: c.mode === '代管' ? '代管' : '包租', vacancy: num(c.vacancy, 1, 0, 11), agentMonths: num(c.agentMonths, 0.25, 0, 3),
      maint: num(c.maint, 12000, 0, 1e7), years: 10
    };

    o.concerns = (Array.isArray(raw.concerns) ? raw.concerns : []).filter(s => typeof s === 'string' && s).slice(0, 12).map(s => s.slice(0, 40));
    o.concernText = str(raw.concernText, 200);
    o.explanation = str(raw.explanation, 3000);
    return o;
  }

  /** 案件用到的圖片 ID（照片、另外上傳的原圖、整理後圖片、謄本） */
  function imageIds(c) {
    return c.photos.map(p => p.id).concat([c.after.ownBefore && c.after.ownBefore.id, c.after.afterId, c.deedImgId]).filter(Boolean);
  }

  /**
   * 合併備份檔的案件：本機沒有的加入；兩邊都有的，留更新時間較新的。
   * 回傳 { list, added, updated, skipped, accepted: 被採用的案件 ID }
   */
  function mergeCases(local, incoming) {
    const list = local.slice(), accepted = [];
    let added = 0, updated = 0, skipped = 0;
    for (const c of incoming) {
      const i = list.findIndex(x => x.id === c.id);
      if (i < 0) { list.push(c); added++; accepted.push(c.id); }
      else if (String(c.updatedAt) > String(list[i].updatedAt)) { list[i] = c; updated++; accepted.push(c.id); }
      else skipped++;
    }
    list.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
    return { list, added, updated, skipped, accepted };
  }

  LD.pipeline = { STATUSES, STATUS, DEFAULT_FEES, pipelineStats, followUps, casesCSV, blankCase, isBlankCase, normalizeCase, imageIds, mergeCases, okId };
})(globalThis.LD = globalThis.LD || {});
