// 業者端總覽的統計。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLD } from './load.js';

const LD = loadLD();
const { pipelineStats, followUps, casesCSV, DEFAULT_FEES } = LD.pipeline;

const cases = [
  { status: 'visit', calc: { mode: '包租' } },
  { status: 'report', calc: { mode: '包租' } },
  { status: 'thinking', calc: { mode: '包租' }, followUp: '2026-10-12' },
  { status: 'signed', calc: { mode: '包租' } },
  { status: 'signed', calc: { mode: '代管' } },
  { status: 'lost', calc: { mode: '包租' } }
];

test('轉換率與預估收入', () => {
  const s = pipelineStats(cases, DEFAULT_FEES);
  assert.equal(s.visits, 6);
  assert.equal(s.reported, 5);
  assert.equal(s.signed, 2);
  assert.equal(s.decided, 3);
  assert.equal(Math.round(s.signRate * 1000), 333);
  assert.equal(Math.round(s.closeRate * 1000), 667);
  assert.equal(s.devIncome, 31000);   // 18,000 + 13,000
  assert.equal(s.serviceIncome, 5000); // 2 × 2,500
  assert.equal(s.openCases, 3);
});

test('沒有案件時不會除以零', () => {
  const s = pipelineStats([], DEFAULT_FEES);
  assert.equal(s.signRate, 0);
  assert.equal(s.closeRate, 0);
});

test('追蹤清單：只列已出報告或考慮中，標出過期', () => {
  const list = followUps([...cases, { status: 'report', followUp: '2026-10-01' }, { status: 'signed', followUp: '2026-10-01' }], '2026-10-10');
  assert.equal(list.length, 2);
  assert.equal(list[0].c.followUp, '2026-10-01');
  assert.equal(list[0].overdue, true);
  assert.equal(list[1].overdue, false);
});

/* ---------- 案件資料格式：保存的資料和備份檔都要經過 normalizeCase ---------- */
const { normalizeCase, blankCase, isBlankCase, mergeCases, imageIds } = LD.pipeline;
const DAY = '2026-10-10';
const json = v => JSON.stringify(v);

test('案件 ID 只接受英數字（會放進網址和 HTML 屬性）', () => {
  for (const bad of [null, 'x', 42, {}, { id: '' }, { id: 'a"b' }, { id: '../x' }, { id: '<img>' }, { id: 'a'.repeat(65) }, { id: 7 }]) {
    assert.equal(normalizeCase(bad, DAY), null, json(bad));
  }
  assert.equal(normalizeCase({ id: 'c-1_x' }, DAY).id, 'c-1_x');
});

test('欄位補齊、數字限制範圍、代碼只接受已知值', () => {
  const c = normalizeCase({
    id: 'c1', status: 'hacked', followUp: '明天', step: 9, note: 'x'.repeat(500), createdAt: 'yesterday',
    case: { city: 'mars', addr: 42, ping: -5, age: 'old', rooms: 99, kwh: 'abc' },
    calc: { houseValue: '450000', rent: -1, bracket: 0.33, mode: '亂寫', count: 0, vacancy: 30, renoAuto: 'yes' },
    concerns: ['怕被查稅', 5, '']
  }, DAY);
  assert.equal(c.status, 'visit');
  assert.equal(c.followUp, '');
  assert.equal(c.step, 5);
  assert.equal(c.note.length, 120);
  assert.equal(c.createdAt, DAY);
  assert.equal(c.case.city, 'hsinchu');
  assert.equal(c.case.addr, '');
  assert.equal(c.case.ping, 0);
  assert.equal(c.case.age, 0);
  assert.equal(c.case.rooms, 20);
  assert.equal(c.case.kwh, '');
  assert.equal(c.calc.houseValue, 450000);
  assert.equal(c.calc.rent, 0);
  assert.equal(c.calc.bracket, 0.12);
  assert.equal(c.calc.mode, '包租');
  assert.equal(c.calc.count, 1);
  assert.equal(c.calc.vacancy, 11);
  assert.equal(c.calc.renoAuto, true);
  assert.equal(c.demo, false);
  assert.equal(json(c.concerns), json(['怕被查稅']));
});

test('不會被 __proto__、constructor 這類名稱騙過', () => {
  const c = normalizeCase({
    id: 'c2', status: 'constructor', case: { city: '__proto__' },
    repairs: [{ id: 'constructor' }, { id: '__proto__' }, { id: 'toString' }, { id: 'paint', on: true }]
  }, DAY);
  assert.equal(c.status, 'visit');
  assert.equal(c.case.city, 'hsinchu');
  assert.equal(json(c.repairs.map(l => l.id)), json(['paint']));
});

test('照片、診斷、修繕、整理後圖片的整理', () => {
  const c = normalizeCase({
    id: 'c3',
    photos: [{ id: 'p1', room: '客廳', w: 800, h: 600 }, { id: 'bad id', room: '客廳' }, { id: 'p2', room: '地下室' }],
    diagnosis: { overall: '好', photos: [{ photoId: 'p1', room: '客廳', score: 9, summary: 's', findings: [{ item: 'leak', severity: '超重', count: 99, evidence: 'e' }, { item: 'pool', severity: '中' }] }] },
    repairs: [
      { id: 'leak', tier: '中', on: true, auto: true, key: 'x" onclick="y' },
      { id: 'custom', name: '工班報價'.repeat(20), amount: 1e12, on: false },
      { id: 'bathroom', tier: '???' }
    ],
    after: { photoId: 'p1', afterId: 'a1', prompt: { en: 'e', zh: 'z' }, ownBefore: { id: 'no good' } },
    deedImgId: 'd1', deedFields: { '主要用途': '住家用', '所有權人數': '2' }
  }, DAY);
  assert.equal(json(c.photos.map(p => p.id)), json(['p1', 'p2']));
  assert.equal(c.photos[1].room, '其他');
  const p = c.diagnosis.photos[0];
  assert.equal(p.score, 5);
  assert.equal(p.findings.length, 1);
  assert.equal(p.findings[0].severity, '中');
  assert.equal(p.findings[0].count, 12);
  assert.equal(c.repairs[0].key, 'r0');          // 鍵值重新產生，不沿用檔案裡的字串
  assert.equal(c.repairs[1].name.length, 40);
  assert.equal(c.repairs[1].amount, 1e8);
  assert.equal(c.repairs[1].on, false);
  assert.equal(c.repairs[2].tier, '中');
  assert.equal(c.after.ownBefore, null);
  assert.equal(c.deedFields['所有權人數'], 2);
  assert.equal(json(imageIds(c)), json(['p1', 'p2', 'a1', 'd1']));
  // 沒有 repairs 欄位：開啟時再依診斷產生
  assert.equal(normalizeCase({ id: 'c4' }, DAY).repairs, null);
});

test('整理過的案件再整理一次不會變', () => {
  const once = normalizeCase({ id: 'c5', status: 'signed', followUp: '2026-11-01', case: { city: 'taipei', addr: '大安區', ping: 15.5, kwh: 30 }, calc: { houseValue: 1, rent: 2, mode: '代管', bracket: 0.3 }, repairs: [{ id: 'paint', on: true }] }, DAY);
  assert.equal(json(normalizeCase(JSON.parse(json(once)), DAY)), json(once));
});

test('空白案件不保存', () => {
  const c = blankCase('c6', DAY);
  assert.equal(isBlankCase(c), true);
  c.case.ping = 25;
  assert.equal(isBlankCase(c), false);
});

test('還原備份：本機沒有的加入，兩邊都有的留比較新的', () => {
  const local = [{ id: 'a', updatedAt: '2026-10-05T10:00:00.000Z', createdAt: '2026-10-01' }, { id: 'b', updatedAt: '2026-10-09T10:00:00.000Z', createdAt: '2026-10-02' }];
  const incoming = [
    { id: 'a', updatedAt: '2026-10-06T10:00:00.000Z', createdAt: '2026-10-01', v: 'new' },
    { id: 'b', updatedAt: '2026-10-08T10:00:00.000Z', createdAt: '2026-10-02', v: 'old' },
    { id: 'c', updatedAt: '2026-10-07T10:00:00.000Z', createdAt: '2026-10-03', v: 'add' }
  ];
  const m = mergeCases(local, incoming);
  assert.equal(m.added, 1);
  assert.equal(m.updated, 1);
  assert.equal(m.skipped, 1);
  assert.equal(json(m.accepted), json(['a', 'c']));
  assert.equal(json(m.list.map(c => c.id)), json(['c', 'b', 'a']));   // 依建立日期新到舊
  assert.equal(m.list.find(c => c.id === 'a').v, 'new');
  assert.equal(m.list.find(c => c.id === 'b').v, undefined);
});

test('CSV 跳脫逗號與引號，開頭有 BOM', () => {
  const csv = casesCSV([{ title: '竹北, "老"公寓', status: '已簽約', demo: true }]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /"竹北, ""老""公寓"/);
  assert.match(csv, /是\r\n$/);
});
