// AI 回覆整理、謄本初篩、格式與報告。AI 的回覆不可信，整理函式要擋掉亂七八糟的輸入。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLD, DEMO } from './load.js';

const LD = loadLD();

test('數字格式', () => {
  const { wan, pct, fmt, esc } = LD.util;
  assert.equal(wan(177000), '17.7 萬');
  assert.equal(wan(-177000), '-17.7 萬');
  assert.equal(wan(1416375), '142 萬');
  assert.equal(pct(0.012), '1.2%');
  assert.equal(fmt(1231655), '1,231,655');
  assert.equal(esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
});

test('診斷回覆：未知代碼丟掉、數值限制範圍', () => {
  const batch = [{ id: 'p1', room: '客廳' }, { id: 'p2', room: '浴室' }];
  const out = {
    photos: [
      { index: 2, score: 9, summary: '浴室', findings: [{ item: 'bathroom', severity: '超重', count: 99, evidence: 'x'.repeat(100) }] },
      { index: 1, score: 'abc', findings: [{ item: 'roof', severity: '中' }, { item: 'paint', severity: '輕' }, null] }
    ],
    overall: '整體'
  };
  const r = LD.prompts.normalizeDiag(out, batch, 0);
  assert.equal(r.photos[0].photoId, 'p1');
  assert.equal(r.photos[0].score, 3);
  assert.equal(r.photos[0].findings.map(f => f.item).join(), 'paint');
  assert.equal(r.photos[1].score, 5);
  assert.equal(r.photos[1].findings[0].severity, '中');
  assert.equal(r.photos[1].findings[0].count, 12);
  assert.equal(r.photos[1].findings[0].evidence.length, 60);
  assert.equal(r.overall, '整體');
  // 回覆完全壞掉也不會丟錯
  const empty = LD.prompts.normalizeDiag(null, batch, 0);
  assert.equal(empty.photos.length, 2);
  assert.equal(empty.photos[0].findings.length, 0);
});

test('診斷提示詞列出照片順序與允許的代碼', () => {
  const p = LD.prompts.diagPrompt([{ room: '客廳' }, { room: '臥室' }], 2);
  assert.match(p, /第 3 張：客廳/);
  assert.match(p, /第 4 張：臥室/);
  for (const k of LD.FIND_ITEMS) assert.ok(p.includes(`- ${k}：`), k);
});

test('謄本回覆整理', () => {
  const f = LD.deed.normalizeDeed({ '主要用途': '住家用', '所有權人數': '3', '總面積平方公尺': '84.567', '權利範圍': ['3分之1', '', '3分之1', '3分之1'], '姓名': '不該出現' });
  assert.equal(f['主要用途'], '住家用');
  assert.equal(f['所有權人數'], 3);
  assert.equal(f['總面積平方公尺'], 84.57);
  assert.equal(f['權利範圍'].length, 3);
  assert.equal(f['姓名'], undefined);
  assert.equal(LD.deed.normalizeDeed(null)['所有權人數'], null);
});

test('謄本初篩', () => {
  const { deedChecks, rocYear } = LD.deed;
  assert.equal(rocYear('民國083年05月20日'), 83);
  const ok = deedChecks({ '主要用途': '住家用', '所有權人數': 1, '權利範圍': ['全部'], '建築完成日期': '民國083年05月20日', '登記原因': '繼承' }, 2026);
  assert.equal(ok[0].s, 'ok');
  assert.equal(ok[1].s, 'ok');
  assert.match(ok[2].t, /屋齡約 32 年/);
  const shared = deedChecks({ '主要用途': '住家用', '所有權人數': 3, '權利範圍': [] }, 2026);
  assert.equal(shared[1].s, 'warn');
  const shop = deedChecks({ '主要用途': '店鋪', '權利範圍': [] }, 2026);
  assert.equal(shop[0].s, 'bad');
  assert.equal(shop[1].s, 'unk');
});

test('折線圖刻度', () => {
  assert.equal(JSON.stringify(LD.charts.niceTicks(-225625, 1416375, 4)), '[-500000,0,500000,1000000,1500000]');
});

test('報告與 LINE 訊息只用試算結果的數字', () => {
  const res = LD.calc.computePaths(DEMO, 225625, LD.RULES, LD.NATIONAL);
  const v = {
    case: { addr: '新竹縣竹北市（示範）', ping: 25, age: 32, rooms: 3, halls: 2, baths: 1 }, cityName: '新竹縣', title: '新竹縣竹北市 · 25 坪',
    mode: '包租', res, ready: true, totals: { lo: 137750, hi: 313500, mid: 225625 },
    repairs: [{ on: true, name: '全室油漆', lo: 31250, hi: 62500, detail: '客廳' }], diagnosis: null, checks: [], explanation: '', demo: true, date: '2026/10/10'
  };
  const html = LD.report.reportHTML(v, {});
  assert.match(html, /142 萬/);
  assert.match(html, /示範案例/);
  assert.match(LD.report.reportDocument(v, {}), /^<!doctype html>/);
  assert.equal(LD.report.reportFilename(v), '亮燈報告-新竹縣竹北市示範-20261010.html');
  const msg = LD.report.lineMessage(v);
  assert.match(msg, /社宅包租：142 萬/);
  assert.match(msg, /繼續空著：-17.7 萬/);
});
