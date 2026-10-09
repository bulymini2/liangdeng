// 示範案例：數字要和導覽、提案書說的一致，而且每個地方都標明是示範。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLD, DEMO } from './load.js';

const LD = loadLD();
const { mainDemo, otherDemos, room, deedSVG, DEMO_ID } = LD.demo;
const { autoRepairLines, repairTotals, computePaths } = LD.calc;

test('竹北示範案：修繕估計 225,625 元', () => {
  const m = mainDemo();
  const lines = autoRepairLines(m.diagnosis).map(l => ({ ...l, on: true }));
  assert.equal(lines.map(l => l.id).join(','), 'paint,floor,leak,leak,bathroom,kitchen,water_heater,lighting,aircon');
  const t = repairTotals(lines, m.case.ping);
  // 低：油漆 1,250×25 + 地板 2,000×25 + 壁癌中 8,000 + 壁癌輕 3,000 + 浴室中 14,700 + 廚房輕 1,500 + 熱水器 5,400 + 燈 1,300×3 + 冷氣 20,000 = 137,750
  // 高：2,500×25 + 4,000×25 + 20,000 + 8,000 + 43,000 + 4,000 + 19,000 + 4,000×3 + 45,000 = 313,500
  assert.equal(t.lo, 137750);
  assert.equal(t.hi, 313500);
  assert.equal(t.mid, 225625);
  assert.equal(LD.util.wan(t.mid), '22.6 萬');   // 導覽第 8 步寫的數字
});

test('竹北示範案：三條路與導覽文字一致', () => {
  const m = mainDemo();
  // 試算條件和 calc.test.js 用的 DEMO 相同
  for (const [k, v] of Object.entries(DEMO)) assert.equal(k === 'city' ? m.case.city : m.calc[k], v, k);
  const res = computePaths({ ...m.calc, city: m.case.city }, 225625, LD.RULES, LD.NATIONAL);
  assert.equal(res.C.total, 1416375);            // (14,400×12 − 12,000 + 10,000 − 5,400 − 1,200) × 10 − 225,625
  assert.equal(res.A.total, -177000);
  assert.equal(res.C.monthly, 14400);            // 「屋主每月實拿 1.44 萬、在免稅額內」
  assert.equal(res.C.income, 0);
  assert.ok(res.C.total - res.A.total > 1500000); // 「十年比空著多出 150 萬以上」
});

test('竹北示範案：謄本初篩', () => {
  const checks = LD.deed.deedChecks(mainDemo().deedFields, 2026);
  assert.equal(checks[0].s, 'ok');                 // 住家用
  assert.equal(checks[1].s, 'ok');                 // 單獨所有
  assert.match(checks[2].t, /屋齡約 32 年/);
});

test('示範內容都標明是示範', () => {
  const all = [mainDemo(), ...otherDemos()];
  assert.equal(all[0].id, DEMO_ID);
  for (const c of all) {
    assert.equal(c.demo, true);
    assert.match(c.case.addr, /（示範）$/);
  }
  assert.match(deedSVG(), /示範用・非真實謄本/);
  for (const t of ['living', 'bedroom', 'bathroom', 'kitchen']) {
    assert.match(room(t, false), /示範插圖・現況/);
    assert.match(room(t, true), /示範插圖・整理後示意/);
  }
  // 謄本插圖不放任何人的姓名
  assert.match(deedSVG(), /○○○（已遮蔽）/);
});

test('示範案件的總覽統計', () => {
  const s = LD.pipeline.pipelineStats([mainDemo(), ...otherDemos()], LD.pipeline.DEFAULT_FEES);
  assert.equal(s.visits, 6);
  assert.equal(s.reported, 5);
  assert.equal(s.signed, 2);
  assert.equal(s.devIncome, 31000);   // 竹東包租 18,000 + 湖口代管 13,000
});
