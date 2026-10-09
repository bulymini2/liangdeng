/* 給屋主的一頁報告：頁面預覽、下載的 HTML 檔、LINE 訊息都從這裡產生。
   v 是 app.js 的 view()：{ case, cityName, title, mode, res, ready, totals, repairs, diagnosis, checks, explanation, demo, date } */
(function (LD) {
  'use strict';

  /** 報告與長條圖樣式。頁面啟動時會注入，下載的報告也會帶上。 */
  const REPORT_CSS = `
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;flex:none}
.sw-vacant{background:var(--s-vacant)}.sw-self{background:var(--s-self)}.sw-social{background:var(--s-social)}
.bars{display:grid;gap:10px}
.bar-row{display:grid;gap:3px}
.bar-name{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:12.5px;color:var(--ink-2)}
.bar-name>span:first-child{display:inline-flex;align-items:center;gap:6px}
.bar-val{font:600 12.5px var(--font-num);color:var(--ink);white-space:nowrap}
.bar-track{position:relative;height:14px}
.bar{position:absolute;top:0;height:14px;border-radius:0 4px 4px 0}
.bar.neg{border-radius:4px 0 0 4px}
.bar-vacant{background:var(--s-vacant)}.bar-self{background:var(--s-self)}.bar-social{background:var(--s-social)}
.bar-zero{position:absolute;top:-3px;bottom:-3px;width:1px;background:var(--axis)}
.report{display:grid;gap:18px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:18px;font-size:14px;line-height:1.7;min-width:0}
.report h1{font-size:19px;margin:0;line-height:1.35}
.report h2{font-size:14px;margin:0 0 6px;letter-spacing:.06em;color:var(--muted)}
.report section{display:grid;gap:8px;min-width:0}
.rp-head{display:flex;gap:14px;align-items:center;flex-wrap:wrap;border-bottom:2px solid #1C2A42;padding-bottom:12px}
.rp-plate{background:#121C2E;color:#fff;border-radius:8px;padding:6px 14px;display:grid;line-height:1.2;box-shadow:inset 3px 0 0 #FFB23F}
.rp-plate b{font-size:18px;letter-spacing:.12em;font-weight:800;font-family:var(--font-display,inherit)}
.rp-plate span{font-size:10.5px;opacity:.9}
.rp-meta p{margin:2px 0 0;color:var(--ink-2);font-size:13px}
.rp-lead{font-size:16px;font-weight:700;margin:0}
.rp-note{margin:0;font-size:12.5px;color:var(--ink-2)}
.rp-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:10px}
.rp-two figure{margin:0;display:grid;gap:4px}
.rp-two img{width:100%;border-radius:8px;border:1px solid var(--line);aspect-ratio:4/3;object-fit:cover}
.rp-two figcaption{font-size:12px;color:var(--muted)}
.rp-list{margin:0;padding-left:1.1em}
.rp-sub{color:var(--muted);font-size:12px}
.rp-foot{font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:10px;display:grid;gap:4px}
.rp-foot p{margin:0}
.report table{border-collapse:collapse;width:100%;font-size:13px}
.report th,.report td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.report th:first-child,.report td:first-child{text-align:left;white-space:normal}
.report td{font-family:var(--font-num);font-variant-numeric:tabular-nums}
.report td:first-child{font-family:var(--font-ui)}
.report .rp-explain{background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;white-space:pre-wrap;margin:0}
.report .tw{overflow-x:auto}
`;

  /** 下載的報告沒有頁面的 CSS，只帶淺色版的色彩設定。 */
  const STANDALONE_CSS = ':root{--paper:#ECEFF2;--surface:#FFFFFF;--surface-2:#F4F6F8;--ink:#111A2B;--ink-2:#465165;--muted:#667085;--line:#D8DEE6;--axis:#B9C2CE;--font-display:"Chiron GoRound TC","Noto Sans TC",sans-serif;--s-vacant:#e87ba4;--s-self:#2a78d6;--s-social:#eda100;--font-ui:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;--font-num:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;color-scheme:light}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.65 var(--font-ui);padding:24px 16px}main{max-width:820px;margin:0 auto}img{max-width:100%}';

  function reportHTML(v, img) {
    const { esc, fmt, wan, pct } = LD.util;
    const name = k => LD.calc.pathName(k, v.mode);
    const res = v.res, t = v.totals, c = v.case;
    const rows = [
      ['每年租金收入', p => fmt(p.rent)],
      ['每年稅金（房屋＋地價＋所得）', p => fmt(p.house + p.land + p.income)],
      ['整理費用', p => p.reno ? fmt(p.reno) : '—'],
      ['每年淨收入', p => fmt(p.net)],
      [`${res.years} 年淨收入`, p => fmt(p.total)]
    ];
    const repairs = v.repairs.filter(l => l.on).map(l =>
      `<li>${esc(l.name)}${l.tier ? `（${l.tier}）` : ''}：${l.lo === l.hi ? fmt(l.lo) : fmt(l.lo) + '–' + fmt(l.hi)} 元${l.detail ? `<br><span class="rp-sub">${esc(l.detail)}</span>` : ''}</li>`).join('');
    const checks = (v.checks || []).filter(x => x.s !== 'info' || /繼承|屋齡/.test(x.t));
    const layout = [c.rooms && c.rooms + '房', c.halls && c.halls + '廳', c.baths && c.baths + '衛'].filter(Boolean).join('');
    const meta = [v.cityName, c.ping ? c.ping + ' 坪' : '', c.age ? '屋齡 ' + c.age + ' 年' : '', layout, v.date].filter(Boolean).join(' · ');
    const modeNote = v.mode === '包租' ? '業者擔任二房東，每月付市價 8 折，空租風險由業者承擔' : '屋主直接簽約、市價 9 折，業者負責管理';
    return `<article class="report">
    <header class="rp-head"><div class="rp-plate"><b>亮燈</b><span>空屋活化評估</span></div>
      <div class="rp-meta"><h1>${esc(c.addr || v.cityName + '的空屋')}</h1><p>${esc(meta)}</p></div></header>
    <section><h2>結論</h2><p class="rp-lead">${esc(v.ready ? LD.calc.conclusionText(res, v.mode) : '尚未填入完整的試算資料。')}</p>${v.ready ? LD.charts.barsHTML(res, v.mode) : ''}</section>
    ${v.ready ? `<section><h2>三條路比較</h2><div class="tw"><table><thead><tr><th></th>${[res.A, res.B, res.C].map(p => `<th>${esc(name(p.key))}</th>`).join('')}</tr></thead><tbody>${rows.map(([lab, f]) => `<tr><td>${lab}</td>${[res.A, res.B, res.C].map(p => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="rp-note">房屋稅率：空著 ${pct(res.vacantRate)}、自己出租 ${pct(res.rentRate)}、社宅包租代管 ${pct(res.socialRate)}。社宅${esc(v.mode)}：${modeNote}；修繕費每年最高補助 1 萬元。</p></section>` : ''}
    ${v.explanation ? `<section><h2>給屋主的說明</h2><p class="rp-explain">${esc(v.explanation)}</p></section>` : ''}
    <section><h2>屋況與整理費用</h2>${v.diagnosis && v.diagnosis.overall ? `<p style="margin:0">${esc(v.diagnosis.overall)}</p>` : ''}
      ${repairs ? `<ul class="rp-list">${repairs}</ul><p style="margin:0"><b>整理費用估計 ${wan(t.mid)}</b>（區間 ${wan(t.lo)}–${wan(t.hi)}，實際以工班報價為準）</p>` : '<p style="margin:0">尚未列出修繕項目。</p>'}</section>
    ${img && img.before && img.after ? `<section><h2>整理前後</h2><div class="rp-two"><figure><img src="${img.before}" alt="整理前"><figcaption>整理前（現場照片）</figcaption></figure><figure><img src="${img.after}" alt="整理後示意"><figcaption>整理後（AI 示意圖，非施工保證）</figcaption></figure></div></section>` : ''}
    ${checks.length ? `<section><h2>資格初篩</h2><ul class="rp-list">${checks.map(x => `<li>${esc(x.l)}：${esc(x.t)}</li>`).join('')}</ul></section>` : ''}
    <footer class="rp-foot"><p>本報告為試算，稅額以稅捐機關核定為準；補助、租金上限與資格以當期社會住宅包租代管計畫和業者審查為準。試算假設屋主誠實申報租金、租稅優惠十年內延續、租金不調整。</p><p>由「亮燈」原型產生${v.demo ? '（示範案例，數字為示範值）' : ''}。</p></footer>
  </article>`;
  }

  /** 可以直接用瀏覽器打開、傳給屋主的完整 HTML 檔。 */
  function reportDocument(v, img) {
    return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>亮燈空屋評估報告</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@700;800&family=IBM+Plex+Mono:wght@400;600&family=Noto+Sans+TC:wght@400;700&display=swap">' +
      `<style>${STANDALONE_CSS}${REPORT_CSS}</style></head><body><main>${reportHTML(v, img)}</main></body></html>`;
  }

  function reportFilename(v) {
    const place = (v.case.addr || v.cityName).replace(/[（）()\s\\/:*?"<>|]/g, '').slice(0, 20) || '案件';
    return '亮燈報告-' + place + '-' + v.date.replace(/\//g, '') + '.html';
  }

  const reportAsciiName = v => 'liangdeng-report-' + v.date.replace(/\//g, '') + '.html';

  /** 傳給屋主的 LINE 文字。 */
  function lineMessage(v) {
    const { wan, pct } = LD.util;
    const res = v.res, t = v.totals;
    const lines = [`【亮燈試算】${v.title}`];
    if (v.ready) {
      lines.push(`${res.years} 年淨收入估算：`);
      for (const p of [res.A, res.B, res.C]) lines.push(`・${LD.calc.pathName(p.key, v.mode)}：${wan(p.total)}`);
      lines.push(LD.calc.conclusionText(res, v.mode));
    }
    if (v.repairs.some(l => l.on)) lines.push(`整理費用估計 ${wan(t.mid)}（${wan(t.lo)}–${wan(t.hi)}）`);
    lines.push('社宅包租代管：房屋稅 ' + pct(res.socialRate) + '、每月 1.5 萬元以內租金免所得稅、修繕費每年最高補助 1 萬元。');
    lines.push('詳細數字和來源在附件報告，稅額以稅捐機關核定為準。');
    return lines.join('\n');
  }

  LD.report = { REPORT_CSS, reportHTML, reportDocument, reportFilename, reportAsciiName, lineMessage };
})(globalThis.LD = globalThis.LD || {});
