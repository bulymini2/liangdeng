/* 試算核心：三條路十年收支與修繕金額。全部是純函式，不碰畫面、不呼叫 AI。
   這裡的每個數字都要能用 docs/rules.md 的規則解釋；改動後跑 npm test。 */
(function (LD) {
  'use strict';

  /** 依戶數查級距稅率。table = [[戶數上限, 稅率], ...] */
  function tierRate(table, n) {
    for (const [max, r] of table) if (n <= max) return r;
    return table[table.length - 1][1];
  }

  /**
   * 三條路的試算。
   * c：{ city, houseValue, landValue, count, inherited, bracket, rent, mode, vacancy, agentMonths, maint, years }
   * reno：整理費用（第 0 年一次付清，只算在兩條出租路線）
   * R、N：LD.RULES、LD.NATIONAL（測試時可換）
   * 回傳 { A: 繼續空著, B: 自己出租, C: 社宅包租代管, ... }，每條路有每年各項收支、net、total、cum
   */
  function computePaths(c, reno, R, N) {
    const r = R[c.city] || R.hsinchu;
    const n = Math.max(1, Math.round(c.count || 1));
    const years = c.years || 10;
    const vac = Math.min(11, Math.max(0, c.vacancy || 0));
    const vacantRate = c.inherited ? tierRate(r.rent, n) : tierRate(r.vacant, n);
    const rentRate = tierRate(r.rent, n);
    const socialRate = r.social.rate != null ? r.social.rate : r.social.base * (1 - r.social.cut);
    const landGen = c.landValue * N.landRate;
    const landSoc = landGen * (1 - r.landCut);
    const R0 = Math.round(Math.max(0, reno || 0));
    const finish = p => {
      for (const k of ['rent', 'find', 'maint', 'subsidy', 'house', 'land', 'income']) p[k] = Math.round(p[k]);
      p.net = p.rent - p.find - p.maint + p.subsidy - p.house - p.land - p.income;
      p.total = p.net * years - p.reno;
      p.cum = [];
      for (let y = 0; y <= years; y++) p.cum.push(p.net * y - p.reno);
      p.payback = (p.reno > 0 && p.net > 0) ? Math.ceil(p.reno / p.net) : null;
      return p;
    };

    // A：繼續空著——只有持有稅
    const A = finish({ key: 'vacant', rent: 0, find: 0, maint: 0, subsidy: 0, house: c.houseValue * vacantRate, land: landGen, income: 0, reno: 0, houseRate: vacantRate });

    // B：自己出租——有空租月數、找房客費用，所得稅扣 43% 必要費用
    const monthsB = 12 - vac;
    const rentB = c.rent * monthsB;
    const B = finish({ key: 'self', rent: rentB, find: c.rent * c.agentMonths, maint: c.maint, subsidy: 0, house: c.houseValue * rentRate, land: landGen, income: rentB * (1 - N.expGeneral) * c.bracket, reno: R0, houseRate: rentRate, months: monthsB });

    // C：社宅包租代管——包租 12 個月都有租金（業者承擔空租），代管有空租
    const share = N.share[c.mode] || 0.8;
    const monthly = c.rent * share;
    const monthsC = c.mode === '代管' ? 12 - vac : 12;
    const taxable = Math.max(0, monthly - N.exempt) * monthsC * (1 - N.expSocial);
    const C = finish({ key: 'social', rent: monthly * monthsC, find: 0, maint: c.maint, subsidy: Math.min(N.repairCap, c.maint), house: c.houseValue * socialRate, land: landSoc, income: taxable * c.bracket, reno: R0, houseRate: socialRate, months: monthsC, monthly: Math.round(monthly) });

    return { A, B, C, years, n, vacantRate, rentRate, socialRate, landGen: Math.round(landGen), landSoc: Math.round(landSoc) };
  }

  /** 由十年淨收入高到低排序 */
  const rankPaths = res => [res.A, res.B, res.C].slice().sort((a, b) => b.total - a.total);

  const pathName = (key, mode) => key === 'vacant' ? '繼續空著' : key === 'self' ? '自己出租' : ('社宅' + (mode || '包租'));

  function conclusionText(res, mode) {
    const { wan } = LD.util;
    const best = rankPaths(res)[0];
    if (best.key === 'vacant') return `以目前條件，${res.years} 年下來繼續空著反而損失最少，出租前要先檢查月租和整理費用。`;
    return `以目前條件，${res.years} 年下來「${pathName(best.key, mode)}」的淨收入最高，約 ${wan(best.total)}，比繼續空著多 ${wan(best.total - res.A.total)}。`;
  }

  /** 一個修繕項目的 [低, 高] 金額。line：{ id, tier?, qty?, amount?（自訂） } */
  function lineCost(line, ping, catalog) {
    if (line.id === 'custom') return [line.amount, line.amount];
    const it = (catalog || LD.CATALOG)[line.id];
    const q = it.perPing ? Math.max(0, ping || 0) : Math.max(1, line.qty || 1);
    const [a, b] = it.tiers ? it.tiers[line.tier || '中'] : it.range;
    return [a * q, b * q];
  }

  /** 勾選項目的總和；mid 是區間中點，當作試算用的整理費用 */
  function repairTotals(lines, ping, catalog) {
    let lo = 0, hi = 0;
    for (const l of lines) if (l.on) { const [a, b] = lineCost(l, ping, catalog); lo += a; hi += b; }
    return { lo, hi, mid: Math.round((lo + hi) / 2) };
  }

  /**
   * 把 AI 診斷結果轉成修繕清單：油漆、地板全室一筆；漏水、浴室、廚房每個發現一筆；
   * 熱水器一台；燈具、窗戶、冷氣依數量合計（上限 20）。
   */
  function autoRepairLines(diagnosis) {
    if (!diagnosis) return [];
    const all = diagnosis.photos.flatMap(p => p.findings.map(f => ({ ...f, room: p.room })));
    const roomsOf = id => Array.from(new Set(all.filter(f => f.item === id).map(f => f.room))).join('、');
    const lines = [];
    if (all.some(f => f.item === 'paint')) lines.push({ id: 'paint', detail: '問題空間：' + roomsOf('paint') });
    if (all.some(f => f.item === 'floor')) lines.push({ id: 'floor', detail: '問題空間：' + roomsOf('floor') });
    for (const f of all) if (['leak', 'bathroom', 'kitchen'].includes(f.item)) lines.push({ id: f.item, tier: f.severity, detail: f.room + '：' + f.evidence });
    if (all.some(f => f.item === 'water_heater')) lines.push({ id: 'water_heater', qty: 1, detail: roomsOf('water_heater') });
    for (const id of ['lighting', 'window', 'aircon']) {
      const q = all.filter(f => f.item === id).reduce((s, f) => s + (f.count || 1), 0);
      if (q) lines.push({ id, qty: Math.min(q, 20), detail: roomsOf(id) });
    }
    return lines;
  }

  LD.calc = { tierRate, computePaths, rankPaths, pathName, conclusionText, lineCost, repairTotals, autoRepairLines };
})(globalThis.LD = globalThis.LD || {});
