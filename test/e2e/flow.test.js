// 端到端測試：用無頭 Chromium 打開頁面，從開場、導覽、案件總覽到拜訪五步驟都跑一遍。
// AI 用假的 window.claude 代替（固定回覆），所以不花用量、結果可重現。
// 執行：npm run e2e（第一次要先 npx playwright install chromium）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TARGETS = {
  '原始碼 index.html': pathToFileURL(join(root, 'index.html')).href,
  '打包 dist/liangdeng.html': pathToFileURL(join(root, 'dist/liangdeng.html')).href
};
const TOUR = ['hero', 'stats', 'steps', 'kpis', 'caselist', 'photos', 'finds', 'repairs', 'compare', 'deed', 'paths', 'chart', 'report', 'decide'];

/** 產生一張純色 PNG，當作現場照片上傳 */
function png(w, h, [r, g, b]) {
  const crc = buf => { let c, k, t = []; for (let n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of buf) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const photo = (name, rgb) => ({ name, mimeType: 'image/png', buffer: png(80, 60, rgb) });

/** 假的 Claude 執行環境：依提示詞內容回覆固定答案，並記錄呼叫 */
function fakeClaude() {
  window.__calls = [];
  const sample = async (prompt, opts = {}) => {
    window.__calls.push({ kind: 'text', prompt });
    const text = '結論：交給社宅包租十年最划算。\n擔心房客弄壞房子：業者擔任二房東負責管理，另有保險費補助。';
    if (opts.onText) { opts.onText({ text: text.slice(0, 10), delta: text.slice(0, 10) }); opts.onText({ text, delta: text.slice(10) }); }
    return { text, truncated: false, modelTierApplied: 'default' };
  };
  sample.json = async (prompt, opts = {}) => {
    const imgs = opts.images || [];
    window.__calls.push({ kind: 'json', prompt, images: imgs.length, types: imgs.map(b => b.type) });
    if (prompt.includes('屋況評估助理')) {
      const idx = [...prompt.matchAll(/第 (\d+) 張：(\S+)/g)].map(m => ({ index: Number(m[1]), room: m[2] }));
      return { photos: idx.map((p, i) => ({ index: p.index, room: p.room, score: 2, summary: '測試空間', findings: i === 0
        ? [{ item: 'paint', severity: '中', count: 1, evidence: '牆面泛黃' }, { item: 'leak', severity: '重', count: 1, evidence: '天花板大片水漬' }, { item: 'unknown_item', severity: '中' }]
        : [{ item: 'bathroom', severity: '中', count: 1, evidence: '馬桶老舊' }, { item: 'lighting', severity: '輕', count: 2, evidence: '燈管不亮' }] })), overall: '測試用的整體說明。' };
    }
    if (prompt.includes('影像編輯工具')) return { en: 'Keep the room layout; repaint walls white.', zh: '牆面重新粉刷' };
    if (prompt.includes('建物登記謄本')) return { '主要用途': '住家用', '建築完成日期': '民國080年01月01日', '登記原因': '繼承', '所有權人數': 3, '權利範圍': ['3分之1', '3分之1', '3分之1'], '他項權利': '無' };
    throw { code: 'invalid_json' };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 20000000, mediaTypes: ['image/jpeg', 'image/png'] }, tools: { maxCount: 8 } });
  const downloads = { save: async req => { window.__saved = { filename: req.filename, size: String(req.data).length, head: String(req.data).slice(0, 2000) }; return { status: 'saved' }; } };
  window.claude = { use: async name => (name === 'sample' ? sample : name === 'downloads' ? downloads : null) };
}

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

const newCtx = ({ claude = false, width = 1280 } = {}) => browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true })
  .then(async ctx => { if (claude) await ctx.addInitScript(fakeClaude); return ctx; });
async function open(url, { ctx, claude = false, width = 1280, hash = '' } = {}) {
  ctx = ctx || await newCtx({ claude, width });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // 字型等外部資源連不到不算錯
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url + hash);
  await page.waitForFunction(() => window.LD && window.LD.app);
  return { ctx, page, errors };
}
const noHScroll = page => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);
const text = (page, sel) => page.textContent(sel).then(t => t.trim());
const kpi = (page, i) => page.locator('#kpis .kpi b').nth(i).textContent().then(t => t.replace(/\D+$/, ''));
const download = async (page, click) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.click(click)]); return dl; };

for (const [label, url] of Object.entries(TARGETS)) {
  test(`${label}：開場與一鍵導覽 14 步`, async () => {
    const { ctx, page, errors } = await open(url);
    assert.equal(await page.isVisible('#view-intro'), true, '第一次打開先看到開場');
    assert.equal(await page.locator('#facade .w').count(), 100);
    assert.equal(await page.locator('#facade .w.dark').count(), 10);

    await page.click('[data-tour="hero"] [data-action="tour"]');
    for (let i = 0; i < TOUR.length; i++) {
      if (i) await page.click('#tourNext');
      const target = `[data-tour="${TOUR[i]}"]`;
      await page.waitForFunction(n => document.querySelector('#tourCount').textContent === `${n} / 14`, i + 1);
      await page.waitForSelector(target, { state: 'visible' });
      // 聚光燈框住目標
      await page.waitForFunction(sel => {
        const t = document.querySelector(sel).getBoundingClientRect(), s = document.querySelector('#tourSpot').getBoundingClientRect();
        return Math.abs(s.left - (t.left - 8)) < 3 && Math.abs(s.width - (t.width + 16)) < 3 && t.bottom > 0 && t.top < innerHeight;
      }, target);
      if (TOUR[i] === 'kpis') assert.equal(await page.isVisible('#view-cases'), true);
      if (TOUR[i] === 'photos') assert.match(await text(page, '#caseTitle'), /竹北/);
      if (TOUR[i] === 'paths') assert.equal(await text(page, '[data-path="social"] .big'), '142 萬');
    }
    assert.equal(await text(page, '#tourNext'), '完成');
    await page.click('#tourNext');
    assert.equal(await page.isHidden('#tour'), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${label}：案件總覽、篩選與匯出 CSV`, async () => {
    const { ctx, page, errors } = await open(url, { hash: '#cases' });
    assert.equal(await kpi(page, 0), '6');
    assert.equal(await kpi(page, 2), '2');
    assert.match(await text(page, '#kpis .kpi.lit b'), /^31,000/);
    assert.equal(await page.locator('#followList li a').count(), 2);

    await page.click('#statusFilter [data-filter="signed"]');
    assert.equal(await page.locator('#caseList .case-row').count(), 2);
    await page.click('#statusFilter [data-filter="all"]');
    assert.equal(await page.locator('#caseList .case-row').count(), 6);

    // 收入假設改了，預估收入跟著變
    await page.click('summary:has-text("收入假設")');
    await page.fill('#feeLease', '20000');
    assert.match(await text(page, '#kpis .kpi.lit b'), /^33,000/);

    const dl = await download(page, '#btnExport');
    assert.match(dl.suggestedFilename(), /^liangdeng-cases-\d{8}\.csv$/);
    const csv = readFileSync(await dl.path(), 'utf8');
    assert.equal(csv.charCodeAt(0), 0xFEFF);
    assert.match(csv, /^﻿建立日期,案件,縣市/);
    assert.equal(csv.trim().split('\r\n').length, 7);

    await page.uncheck('#showDemo');
    assert.equal(await kpi(page, 0), '0');
    assert.match(await text(page, '#caseList'), /還沒有案件/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${label}：示範案例五個步驟（一般瀏覽器、沒有 AI）`, async () => {
    const { ctx, page, errors } = await open(url, { hash: '#visit/demo-zhubei/1' });
    await page.waitForSelector('#photoGrid .ph-img[style*="data:image"]');
    assert.match(await text(page, '#caseTitle'), /竹北/);
    assert.equal(await page.isVisible('#demoBanner'), true);
    await page.waitForSelector('#aiOff:not([hidden])');
    assert.match(await text(page, '#aiOff'), /一般瀏覽器/);
    assert.equal(await page.isDisabled('#btnDiag'), true);
    assert.equal(await page.locator('.ph').count(), 4);
    assert.match(await text(page, '#repairTotal'), /22\.6 萬/);

    await page.click('.win[data-step="2"]');
    await page.waitForSelector('#cmp');
    await page.$eval('#cmpRange', el => { el.value = '20'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.match(await page.getAttribute('#cmp', 'style'), /--pos:\s*20%/);

    await page.click('.win[data-step="3"]');
    assert.match(await text(page, '#deedResult'), /主要用途「住家用」/);

    await page.click('.win[data-step="4"]');
    assert.equal(await page.isVisible('[data-panel="4"]'), true);
    assert.equal(await page.isVisible('[data-panel="1"]'), false);
    assert.equal(await text(page, '[data-path="social"] .big'), '142 萬');
    assert.equal(await text(page, '[data-path="vacant"] .big'), '-17.7 萬');
    await page.click('#modeSeg [data-mode="代管"]');
    assert.match(await text(page, '[data-path="social"] .path-key'), /社宅代管/);
    await page.fill('#cRent', '30000');
    assert.notEqual(await text(page, '[data-path="social"] .big'), '142 萬');
    await page.click('#btnResetDemo');
    assert.equal(await text(page, '[data-path="social"] .big'), '142 萬', '恢復示範內容');
    assert.equal(await page.isVisible('[data-panel="4"]'), true, '恢復後停在同一步');

    // 一般瀏覽器直接下載報告
    await page.click('.win[data-step="5"]');
    assert.match(await text(page, '#reportPreview'), /給屋主的說明/);
    const dl = await download(page, '#btnDownload');
    assert.match(dl.suggestedFilename(), /^liangdeng-report-\d{8}\.html$/);
    const html = readFileSync(await dl.path(), 'utf8');
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /示範案例，數字為示範值/);
    assert.equal((html.match(/<img src="data:image\/jpeg/g) || []).length, 2);

    await page.click('#btnLine');
    await page.waitForFunction(() => /已複製|手動複製/.test(document.querySelector('#reportStatus').textContent));
    if (await page.isVisible('#lineText')) assert.match(await page.inputValue('#lineText'), /^【亮燈試算】/);

    await page.click('#decideRow [data-status="signed"]');
    assert.match(await text(page, '#decideStatus'), /示範案件不會保存/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${label}：新拜訪會保存，重新整理後照片還在；空白案件不留下`, async () => {
    const { ctx, page, errors } = await open(url, { hash: '#cases' });
    // 按了新拜訪又直接離開：不算一筆拜訪
    await page.click('.page-head [data-action="new-case"]');
    assert.equal(await text(page, '#caseTitle'), '新案件');
    assert.equal(await page.isHidden('#demoBanner'), true);
    await page.click('#view-visit a.back');
    assert.equal(await kpi(page, 0), '6');

    await page.click('.page-head [data-action="new-case"]');
    await page.fill('#fAddr', '竹北市測試路');
    await page.fill('#fPing', '20');
    assert.equal(await text(page, '#caseTitle'), '竹北市測試路 · 20 坪');
    await page.setInputFiles('#photoInput', [photo('a.png', [200, 190, 170]), photo('b.png', [120, 130, 140])]);
    await page.waitForSelector('.ph >> nth=1');
    await page.click('.win[data-step="4"]');
    assert.match(await text(page, '#conclusion'), /填入下方的房屋評定現值/);
    await page.fill('#cHouse', '450000');
    await page.fill('#cLand', '600000');
    await page.fill('#cRent', '18000');
    assert.match(await text(page, '#conclusion'), /淨收入最高/);
    await page.click('.win[data-step="5"]');
    await page.click('#decideRow [data-status="thinking"]');
    await page.fill('#followUp', '2026-10-20');
    await page.fill('#caseNote', '週末再打電話');
    const caseUrl = page.url();

    await page.click('#view-visit a.back');
    assert.equal(await kpi(page, 0), '7');
    assert.match(await text(page, '#caseList'), /竹北市測試路/);
    assert.match(await text(page, '#followList'), /竹北市測試路/);

    // 重新整理：案件、狀態、備註、照片都還在
    await page.goto(caseUrl);
    await page.waitForFunction(() => window.LD && window.LD.app);
    await page.reload();
    await page.waitForSelector('#view-visit:not([hidden])');
    assert.equal(await text(page, '#caseTitle'), '竹北市測試路 · 20 坪');
    assert.equal(await page.inputValue('#caseNote'), '週末再打電話');
    assert.equal(await page.inputValue('#caseStatus'), 'thinking');
    await page.click('.win[data-step="1"]');
    await page.waitForSelector('#photoGrid .ph-img[style*="data:image/jpeg"] >> nth=1');

    // 刪除要按兩次
    await page.click('#view-visit a.back');
    const del = page.locator('#caseList [data-del]');
    assert.equal(await del.count(), 1);
    await del.click();
    assert.equal(await kpi(page, 0), '7');
    await page.click('#caseList [data-del]');
    assert.equal(await kpi(page, 0), '6');
    assert.doesNotMatch(await text(page, '#caseList'), /竹北市測試路/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${label}：備份到檔案，換一台裝置還原`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ld-'));
    let { ctx, page, errors } = await open(url, { hash: '#cases' });
    await page.click('.page-head [data-action="new-case"]');
    await page.fill('#fAddr', '湖口備份測試');
    await page.setInputFiles('#photoInput', [photo('a.png', [90, 160, 200])]);
    await page.waitForSelector('#photoGrid .ph-img[style*="data:image"]');
    await page.click('#view-visit a.back');
    await page.click('summary:has-text("備份與還原")');
    const dl = await download(page, '#btnBackup');
    assert.match(dl.suggestedFilename(), /^liangdeng-backup-\d{8}\.json$/);
    const file = join(dir, 'backup.json');
    writeFileSync(file, readFileSync(await dl.path()));
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(data.app, 'liangdeng');
    assert.equal(data.cases.length, 1);
    assert.equal(Object.keys(data.images).length, 1);
    assert.match(Object.values(data.images)[0], /^data:image\/jpeg;base64,/);
    assert.deepEqual(errors, []);
    await ctx.close();

    // 另一個瀏覽器（沒有任何資料）
    ({ ctx, page, errors } = await open(url, { hash: '#cases' }));
    await page.click('summary:has-text("備份與還原")');
    const junk = join(dir, 'junk.json');
    writeFileSync(junk, '{"hello":1}');
    await page.setInputFiles('#restoreInput', junk);
    await page.waitForFunction(() => /不是亮燈的備份檔/.test(document.querySelector('#backupStatus').textContent));
    await page.setInputFiles('#restoreInput', file);
    await page.waitForFunction(() => /還原完成/.test(document.querySelector('#backupStatus').textContent));
    assert.match(await text(page, '#backupStatus'), /新增 1 件.*圖片 1 張/);
    assert.match(await text(page, '#caseList'), /湖口備份測試/);
    await page.click('#caseList a:has-text("湖口備份測試")');
    await page.waitForSelector('#photoGrid .ph-img[style*="data:image/jpeg"]');
    // 同一份再還原一次：本機已經是同一版，不重複加入
    await page.click('#view-visit a.back');
    await page.click('summary:has-text("備份與還原")');
    await page.setInputFiles('#restoreInput', file);
    await page.waitForFunction(() => /還原完成/.test(document.querySelector('#backupStatus').textContent));
    assert.match(await text(page, '#backupStatus'), /新增 0 件、更新 0 件；1 件本機已是相同或更新的版本/);
    assert.equal(await kpi(page, 0), '7');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${label}：手機寬度每個畫面都不會左右捲動`, async () => {
    const { ctx, page, errors } = await open(url, { width: 375 });
    assert.equal(await noHScroll(page), true, '開場');
    assert.equal(await page.isVisible('.tabbar'), true);
    await page.click('.tabbar [data-nav="cases"]');
    assert.equal(await noHScroll(page), true, '案件總覽');
    await page.click('#caseList a:has-text("竹北市")');
    for (const s of [1, 2, 3, 4, 5]) {
      await page.click(`.win[data-step="${s}"]`);
      assert.equal(await noHScroll(page), true, `步驟 ${s} 有橫向捲動`);
    }
    // 手機上的導覽：說明卡在下方，下方列先收起來
    await page.click('.tabbar [data-action="tour"]');
    await page.waitForSelector('#tourCard', { state: 'visible' });
    assert.equal(await page.isHidden('.tabbar'), true);
    await page.click('#tourNext');
    await page.click('#tourExit');
    assert.equal(await page.isVisible('.tabbar'), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${label}：在 Claude 裡跑完五步 AI 流程`, async () => {
    const { ctx, page, errors } = await open(url, { claude: true, hash: '#visit/demo-zhubei/1' });
    await page.waitForFunction(() => document.querySelector('#aiOff').hidden && !document.querySelector('#btnDiag').disabled);

    // 示範插圖也能直接給 AI 看（轉成 JPEG）
    await page.click('#btnDiag');
    await page.waitForFunction(() => /完成：4 個空間/.test(document.querySelector('#diagStatus').textContent));
    let calls = await page.evaluate(() => window.__calls);
    assert.equal(calls[0].images, 4);
    assert.deepEqual(calls[0].types, ['image/jpeg', 'image/jpeg', 'image/jpeg', 'image/jpeg']);

    // 新案件
    await page.click('.topbar [data-action="new-case"]');
    await page.waitForFunction(() => document.querySelector('#caseTitle').textContent === '新案件');
    await page.setInputFiles('#photoInput', [photo('a.png', [200, 190, 170]), photo('b.png', [120, 130, 140])]);
    await page.waitForSelector('.ph >> nth=1');
    await page.fill('#fPing', '20');
    await page.click('#btnDiag');
    await page.waitForFunction(() => /完成：2 個空間/.test(document.querySelector('#diagStatus').textContent));
    assert.equal(await page.locator('.find-card').count(), 2);
    const repairText = await text(page, '#repairList');
    for (const w of ['全室油漆', '漏水／壁癌處理', '浴室整理', '燈具更換']) assert.ok(repairText.includes(w), w);
    assert.match(await text(page, '#repairTotal'), /萬/);
    calls = await page.evaluate(() => window.__calls);
    assert.equal(calls[calls.length - 1].images, 2);

    // 2. 改圖指令與前後對照
    await page.click('.win[data-step="2"]');
    await page.click('#btnPrompt');
    await page.waitForSelector('#promptBox:not([hidden])');
    assert.match(await text(page, '#promptEn'), /repaint/);
    await page.setInputFiles('#afterInput', photo('after.png', [250, 250, 245]));
    await page.waitForSelector('#cmp');

    // 3. 謄本：共有 3 人 → 需準備同意書，屋齡自動帶入
    await page.click('.win[data-step="3"]');
    await page.setInputFiles('#deedInput', photo('deed.png', [255, 255, 255]));
    await page.waitForFunction(() => !document.querySelector('#btnDeed').disabled);
    await page.click('#btnDeed');
    await page.waitForSelector('#deedCard:not([hidden]) .checks li');
    const deed = await text(page, '#deedResult');
    assert.match(deed, /共有，所有權人 3 位/);
    assert.match(deed, /主要用途「住家用」/);
    assert.ok(Number(await page.inputValue('#fAge')) >= 35);

    // 4. 新案件要填稅單與月租才會出結論；整理費用自動帶入修繕清單估計
    await page.click('.win[data-step="4"]');
    assert.match(await text(page, '#conclusion'), /填入下方的房屋評定現值/);
    await page.fill('#cHouse', '450000');
    await page.fill('#cLand', '600000');
    await page.fill('#cRent', '18000');
    assert.match(await text(page, '#conclusion'), /淨收入最高/);
    assert.ok(Number(await page.inputValue('#cReno')) > 0);

    // 5. 白話說明串流、報告、下載
    await page.click('.win[data-step="5"]');
    await page.click('[data-concern="擔心房客弄壞房子"]');
    await page.click('#btnExplain');
    await page.waitForFunction(() => /完成/.test(document.querySelector('#explainStatus').textContent));
    assert.match(await text(page, '#explainOut'), /二房東/);
    const explainPrompt = (await page.evaluate(() => window.__calls)).find(c => c.kind === 'text').prompt;
    assert.match(explainPrompt, /擔心房客弄壞房子/);
    assert.match(explainPrompt, /不要自己計算/);
    assert.match(await text(page, '#reportPreview'), /給屋主的說明/);
    assert.equal(await page.locator('#reportPreview .rp-two img').count(), 2);
    await page.click('#btnDownload');
    await page.waitForFunction(() => window.__saved);
    const saved = await page.evaluate(() => window.__saved);
    assert.match(saved.filename, /^亮燈報告-/);
    assert.match(saved.head, /^<!doctype html>/);
    assert.ok(saved.size > 5000);
    assert.equal(await page.inputValue('#caseStatus'), 'report', '下載報告後狀態變成已出報告');

    // 五扇窗都亮
    assert.equal(await page.locator('.win.done').count(), 5);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
