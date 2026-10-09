// 端到端測試：用無頭 Chromium 打開頁面，跑完五個步驟。
// AI 用假的 window.claude 代替（固定回覆），所以不花用量、結果可重現。
// 執行：npm run e2e（第一次要先 npx playwright install chromium）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TARGETS = {
  '原始碼 index.html': pathToFileURL(join(root, 'index.html')).href,
  '打包 dist/liangdeng.html': pathToFileURL(join(root, 'dist/liangdeng.html')).href
};

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
    window.__calls.push({ kind: 'json', prompt, images: (opts.images || []).length });
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

async function open(url, { claude = false, width = 1280 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  if (claude) await ctx.addInitScript(fakeClaude);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // 字型等外部資源連不到不算錯
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForSelector('#paths .path', { state: 'attached' });
  return { ctx, page, errors };
}
const noHScroll = page => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);

for (const [label, url] of Object.entries(TARGETS)) {
  test(`${label}：示範案例與三條路（沒有 Claude）`, async () => {
    const { ctx, page, errors } = await open(url);
    assert.match(await page.textContent('#caseTitle'), /竹北/);
    assert.equal(await page.isVisible('#demoBanner'), true);
    await page.waitForSelector('#aiOff:not([hidden])');
    assert.match(await page.textContent('#aiOff'), /一般瀏覽器/);
    assert.equal(await page.isDisabled('#btnDiag'), true);

    await page.click('.win[data-step="4"]');
    assert.equal(await page.isVisible('[data-panel="4"]'), true);
    assert.equal(await page.isVisible('[data-panel="1"]'), false);
    assert.match(await page.textContent('#conclusion'), /社宅包租/);
    assert.equal(await page.textContent('[data-path="social"] .big'), '142 萬');
    assert.equal(await page.textContent('[data-path="vacant"] .big'), '-17.7 萬');

    await page.click('#modeSeg [data-mode="代管"]');
    assert.match(await page.textContent('[data-path="social"] .path-key'), /社宅代管/);
    await page.fill('#cRent', '30000');
    assert.match(await page.textContent('#conclusion'), /萬/);

    // 一般瀏覽器直接下載報告
    await page.click('.win[data-step="5"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnDownload')]);
    assert.match(dl.suggestedFilename(), /^liangdeng-report-\d{8}\.html$/);

    // 開新案件要按兩次
    await page.click('#btnNew');
    assert.match(await page.textContent('#caseTitle'), /竹北/);
    await page.click('#btnNew');
    assert.equal(await page.textContent('#caseTitle'), '新案件');
    assert.equal(await page.isVisible('#demoBanner'), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${label}：手機寬度每一步都不會左右捲動`, async () => {
    const { ctx, page, errors } = await open(url, { width: 375 });
    for (const s of [1, 2, 3, 4, 5]) {
      await page.click(`.win[data-step="${s}"]`);
      assert.equal(await noHScroll(page), true, `步驟 ${s} 有橫向捲動`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${label}：在 Claude 裡跑完五步 AI 流程`, async () => {
    const { ctx, page, errors } = await open(url, { claude: true });
    await page.waitForFunction(() => document.querySelector('#aiOff').hidden && !document.querySelector('#btnExplain').disabled);

    // 1. 加入照片會清掉示範案例，AI 診斷後產生修繕清單（未知代碼被丟掉）
    await page.setInputFiles('#photoInput', [photo('a.png', [200, 190, 170]), photo('b.png', [120, 130, 140])]);
    await page.waitForSelector('.ph >> nth=1');
    assert.equal(await page.isVisible('#demoBanner'), false);
    await page.fill('#fPing', '20');
    await page.click('#btnDiag');
    await page.waitForFunction(() => /完成/.test(document.querySelector('#diagStatus').textContent));
    assert.equal(await page.locator('.find-card').count(), 2);
    const repairText = await page.textContent('#repairList');
    for (const w of ['全室油漆', '漏水／壁癌處理', '浴室整理', '燈具更換']) assert.ok(repairText.includes(w), w);
    assert.match(await page.textContent('#repairTotal'), /萬/);
    const calls = await page.evaluate(() => window.__calls);
    assert.equal(calls[0].images, 2);

    // 2. 改圖指令與前後對照
    await page.click('.win[data-step="2"]');
    await page.click('#btnPrompt');
    await page.waitForSelector('#promptBox:not([hidden])');
    assert.match(await page.textContent('#promptEn'), /repaint/);
    await page.setInputFiles('#afterInput', photo('after.png', [250, 250, 245]));
    await page.waitForSelector('#cmp');

    // 3. 謄本：共有 3 人 → 需準備同意書，屋齡自動帶入
    await page.click('.win[data-step="3"]');
    await page.setInputFiles('#deedInput', photo('deed.png', [255, 255, 255]));
    await page.click('#btnDeed');
    await page.waitForSelector('#deedCard:not([hidden]) .checks li');
    const deed = await page.textContent('#deedResult');
    assert.match(deed, /共有，所有權人 3 位/);
    assert.match(deed, /主要用途「住家用」/);
    assert.ok(Number(await page.inputValue('#fAge')) >= 35);

    // 4. 新案件要填稅單與月租才會出結論；整理費用自動帶入修繕清單估計
    await page.click('.win[data-step="4"]');
    assert.match(await page.textContent('#conclusion'), /填入房屋評定現值/);
    await page.fill('#cHouse', '450000');
    await page.fill('#cLand', '600000');
    await page.fill('#cRent', '18000');
    assert.match(await page.textContent('#conclusion'), /淨收入最高/);
    assert.ok(Number(await page.inputValue('#cReno')) > 0);

    // 5. 白話說明串流、報告、下載
    await page.click('.win[data-step="5"]');
    await page.click('[data-concern="擔心房客弄壞房子"]');
    await page.click('#btnExplain');
    await page.waitForFunction(() => /完成/.test(document.querySelector('#explainStatus').textContent));
    assert.match(await page.textContent('#explainOut'), /二房東/);
    const explainPrompt = (await page.evaluate(() => window.__calls)).find(c => c.kind === 'text').prompt;
    assert.match(explainPrompt, /擔心房客弄壞房子/);
    assert.match(explainPrompt, /不要自己計算/);
    assert.match(await page.textContent('#reportPreview'), /給屋主的說明/);
    assert.equal(await page.locator('#reportPreview .rp-two img').count(), 2);
    await page.click('#btnDownload');
    await page.waitForFunction(() => window.__saved);
    const saved = await page.evaluate(() => window.__saved);
    assert.match(saved.filename, /^亮燈報告-/);
    assert.match(saved.head, /^<!doctype html>/);
    assert.ok(saved.size > 5000);

    // 五扇窗都亮
    assert.equal(await page.locator('.win.done').count(), 5);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
