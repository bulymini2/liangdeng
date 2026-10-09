/* 圖表：十年淨收入長條圖（摘要與報告共用）與累計折線圖。只輸出 HTML/SVG 字串。 */
(function (LD) {
  'use strict';

  /** 整齊的刻度：niceTicks(-225625, 1416375, 4) → [-500000, 0, 500000, 1000000, 1500000] */
  function niceTicks(lo, hi, count) {
    const span = (hi - lo) || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const e = raw / mag;
    const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
    const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
    const out = [];
    for (let v = start; v <= end + step / 2; v += step) out.push(Math.round(v));
    return out;
  }

  /** 三條路的十年淨收入長條圖；數值寫在名稱同一列右側，不會被長條擠掉。 */
  function barsHTML(res, mode) {
    const { esc, wan } = LD.util;
    const items = [res.A, res.B, res.C];
    const vals = items.map(p => p.total);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const pad = ((hi - lo) || 1) * 0.04;
    hi += pad; if (lo < 0) lo -= pad;
    const P = v => (v - lo) / (hi - lo) * 100;
    const z = P(0);
    return '<div class="bars">' + items.map(p => {
      const v = p.total, a = P(Math.min(0, v)), b = P(Math.max(0, v));
      return `<div class="bar-row"><div class="bar-name"><span><i class="sw sw-${p.key}"></i>${esc(LD.calc.pathName(p.key, mode))}</span><span class="bar-val">${wan(v)}</span></div>` +
        `<div class="bar-track"><span class="bar bar-${p.key}${v < 0 ? ' neg' : ''}" style="left:${a.toFixed(2)}%;width:${Math.max(0.8, b - a).toFixed(2)}%"></span>` +
        `<span class="bar-zero" style="left:${z.toFixed(2)}%"></span></div></div>`;
    }).join('') + '</div>';
  }

  /** 累計淨收入折線圖。回傳 { svg, geo }，geo 給滑鼠提示框換算座標用。
      width：容器寬度（像素）。圖的座標寬度跟著容器，手機上的字才不會被縮小。 */
  function lineChartSVG(res, mode, withHover, width) {
    const { wan } = LD.util;
    const W = Math.round(Math.max(300, Math.min(760, width || 640))), H = W < 480 ? 230 : 270, m = { l: 58, r: 66, t: 14, b: 30 };
    const series = [res.A, res.B, res.C];
    const all = series.flatMap(p => p.cum);
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 4);
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const yrs = res.years;
    const x = i => m.l + (W - m.l - m.r) * i / yrs;
    const y = v => m.t + (H - m.t - m.b) * (1 - (v - lo) / ((hi - lo) || 1));
    let g = '';
    for (const t of ticks) {
      g += `<line class="${t === 0 ? 'zl' : 'gl'}" x1="${m.l}" x2="${W - m.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`;
      g += `<text class="ax" x="${m.l - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${t === 0 ? '0' : wan(t)}</text>`;
    }
    for (let i = 0; i <= yrs; i += (yrs > 6 ? 2 : 1)) g += `<text class="ax" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${i === 0 ? '第 0 年' : i}</text>`;
    for (const p of series) {
      const d = p.cum.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
      g += `<path class="ln ln-${p.key}" d="${d}"/>`;
    }
    // 終點標數字；任兩條太近就不標，改靠圖例與提示框
    const ends = series.map(p => ({ p, yy: y(p.cum[yrs]) })).sort((a, b) => a.yy - b.yy);
    let clash = false;
    for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 15) clash = true;
    for (const e of ends) {
      g += `<circle class="dot dot-${e.p.key}" cx="${x(yrs).toFixed(1)}" cy="${e.yy.toFixed(1)}" r="4.5"/>`;
      if (!clash) g += `<text class="axl" x="${(x(yrs) + 9).toFixed(1)}" y="${(e.yy + 4).toFixed(1)}">${wan(e.p.cum[yrs])}</text>`;
    }
    if (withHover) {
      g += `<line class="xh" data-role="xh" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>`;
      g += `<rect data-role="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/>`;
    }
    return { svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="十年累計淨收入折線圖">${g}</svg>`, geo: { W, H, m, x, yrs } };
  }

  LD.charts = { niceTicks, barsHTML, lineChartSVG };
})(globalThis.LD = globalThis.LD || {});
