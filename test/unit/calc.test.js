// 三條路試算與修繕金額。期望值都是手算過的，改規則時要一起更新並說明原因。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLD, DEMO } from './load.js';

const LD = loadLD();
const { computePaths, tierRate, lineCost, repairTotals, autoRepairLines, rankPaths, conclusionText } = LD.calc;
const run = (over = {}, reno = 225625) => computePaths({ ...DEMO, ...over }, reno, LD.RULES, LD.NATIONAL);

test('級距查表', () => {
  const t = LD.RULES.hsinchu.vacant;
  assert.equal(tierRate(t, 1), 0.026);
  assert.equal(tierRate(t, 2), 0.032);
  assert.equal(tierRate(t, 4), 0.032);
  assert.equal(tierRate(t, 5), 0.038);
  assert.equal(tierRate(t, 7), 0.048);
  assert.equal(tierRate(t, 99), 0.048);
});

test('示範案例：繼續空著', () => {
  const { A } = run();
  assert.equal(A.house, 11700);   // 450,000 × 2.6%
  assert.equal(A.land, 6000);     // 600,000 × 1%
  assert.equal(A.net, -17700);
  assert.equal(A.total, -177000);
  assert.equal(A.cum.length, 11);
});

test('示範案例：自己出租', () => {
  const { B } = run();
  assert.equal(B.rent, 198000);   // 18,000 × 11 個月
  assert.equal(B.find, 4500);     // 0.25 個月租金
  assert.equal(B.house, 7200);    // 1.6%
  assert.equal(B.income, 22572);  // 198,000 × (1 - 43%) × 20%
  assert.equal(B.net, 145728);
  assert.equal(B.total, 1231655);
  assert.equal(B.payback, 2);
});

test('示範案例：社宅包租', () => {
  const { C } = run();
  assert.equal(C.monthly, 14400); // 市價 8 折
  assert.equal(C.rent, 172800);   // 包租 12 個月都有租金
  assert.equal(C.income, 0);      // 每月 1.5 萬以內免稅
  assert.equal(C.subsidy, 10000); // 修繕補助上限
  assert.equal(C.house, 5400);    // 1.6% 減徵 25% = 1.2%
  assert.equal(C.land, 1200);     // 地價稅減徵 80%
  assert.equal(C.net, 164200);
  assert.equal(C.total, 1416375);
});

test('社宅代管：9 折、有空租月份', () => {
  const { C } = run({ mode: '代管' });
  assert.equal(C.monthly, 16200);
  assert.equal(C.months, 11);
  assert.equal(C.income, 1056);   // (16,200 - 15,000) × 11 × 40% × 20%
  assert.equal(C.net, 168544);
});

test('月租高時，社宅超過免稅額的部分扣 60% 費用', () => {
  const r = run({ rent: 30000, bracket: 0.3 });
  assert.equal(r.C.monthly, 24000);
  assert.equal(r.C.income, 12960); // (24,000 - 15,000) × 12 × 40% × 30%
  assert.equal(r.B.income, 56430); // 330,000 × 57% × 30%
});

test('台北市級距與社宅稅率', () => {
  const r = run({ city: 'taipei', count: 3 });
  assert.equal(r.vacantRate, 0.038);
  assert.equal(r.rentRate, 0.015);
  assert.equal(r.socialRate, 0.01);
});

test('繼承共有：空置時改用出租的較低稅率', () => {
  const r = run({ inherited: true });
  assert.equal(r.vacantRate, 0.016);
  assert.equal(r.A.total, -132000);
});

test('沒有整理費用時不計回收年', () => {
  const r = run({}, 0);
  assert.equal(r.B.payback, null);
  assert.equal(r.B.cum[0], 0);
});

test('排序與結論', () => {
  const r = run();
  assert.equal(rankPaths(r).map(p => p.key).join(), 'social,self,vacant');
  assert.match(conclusionText(r, '包租'), /社宅包租/);
  const bad = run({ rent: 2000 }, 3000000);
  assert.equal(rankPaths(bad)[0].key, 'vacant');
  assert.match(conclusionText(bad, '包租'), /繼續空著反而損失最少/);
});

const DEMO_DIAG = {
  photos: [
    { room: '客廳', findings: [{ item: 'paint', severity: '中' }, { item: 'leak', severity: '中', evidence: 'a' }, { item: 'floor', severity: '中' }, { item: 'lighting', severity: '輕', count: 2 }] },
    { room: '臥室', findings: [{ item: 'leak', severity: '輕', evidence: 'b' }, { item: 'aircon', severity: '中', count: 1 }, { item: 'lighting', severity: '輕', count: 1 }] },
    { room: '浴室', findings: [{ item: 'bathroom', severity: '中', evidence: 'c' }] },
    { room: '廚房', findings: [{ item: 'kitchen', severity: '輕', evidence: 'd' }, { item: 'water_heater', severity: '中' }] }
  ]
};

test('AI 診斷轉成修繕清單', () => {
  const lines = autoRepairLines(DEMO_DIAG);
  assert.equal(lines.map(l => l.id).join(), 'paint,floor,leak,leak,bathroom,kitchen,water_heater,lighting,aircon');
  assert.equal(lines.find(l => l.id === 'lighting').qty, 3);
  assert.equal(lines.find(l => l.id === 'paint').detail, '問題空間：客廳');
  assert.equal(autoRepairLines(null).length, 0);
});

test('示範案例修繕總額', () => {
  const lines = autoRepairLines(DEMO_DIAG).map(l => ({ ...l, on: true }));
  const t = repairTotals(lines, 25);
  assert.equal(t.lo, 137750);
  assert.equal(t.hi, 313500);
  assert.equal(t.mid, 225625);
});

test('單項金額：坪數、數量、分級、自訂', () => {
  assert.equal(JSON.stringify(lineCost({ id: 'paint' }, 20)), '[25000,50000]');
  assert.equal(JSON.stringify(lineCost({ id: 'window', qty: 2 }, 20)), '[12000,18000]');
  assert.equal(JSON.stringify(lineCost({ id: 'bathroom', tier: '重' }, 20)), '[120000,350000]');
  assert.equal(JSON.stringify(lineCost({ id: 'custom', amount: 5000 }, 20)), '[5000,5000]');
  assert.equal(repairTotals([{ id: 'paint', on: false }], 20).mid, 0);
});
