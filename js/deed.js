/* 建物謄本：AI 擷取欄位的提示詞、回覆整理，以及資格初篩規則。 */
(function (LD) {
  'use strict';

  const DEED_KEYS = ['門牌', '主要用途', '主要建材', '層數', '層次', '總面積平方公尺', '建築完成日期', '登記原因', '所有權人數', '權利範圍', '他項權利'];

  const DEED_PROMPT = `這張照片是台灣的建物登記謄本（可能是手機翻拍，可能只拍到一部分）。請擷取下列欄位，只填照片上看得到的內容，看不到或看不清楚就填 null，不要推測：
{"門牌":"字串或 null","主要用途":"字串或 null","主要建材":"字串或 null","層數":"字串或 null","層次":"字串或 null","總面積平方公尺":數字或 null,"建築完成日期":"例如 民國083年05月20日，或 null","登記原因":"例如 繼承、買賣，或 null","所有權人數":整數或 null,"權利範圍":["每位所有權人的權利範圍，例如 全部 或 3分之1"],"他項權利":"有、無或看不到","讀不清楚的欄位":["欄位名稱"]}
不要輸出任何人的姓名、身分證字號、統一編號、出生日期或住址。只回覆這個 JSON 物件，不要其他文字。`;

  /** 把 AI 回覆整理成固定欄位，型別不對的一律當作讀不到。 */
  function normalizeDeed(o) {
    const f = {};
    const str = v => v == null ? null : String(v).slice(0, 80);
    for (const k of ['門牌', '主要用途', '主要建材', '層數', '層次', '建築完成日期', '登記原因', '他項權利']) f[k] = str(o && o[k]);
    const area = Number(o && o['總面積平方公尺']);
    f['總面積平方公尺'] = Number.isFinite(area) && area > 0 ? Math.round(area * 100) / 100 : null;
    const n = Number(o && o['所有權人數']);
    f['所有權人數'] = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    f['權利範圍'] = Array.isArray(o && o['權利範圍']) ? o['權利範圍'].filter(Boolean).map(s => String(s).slice(0, 20)).slice(0, 20) : [];
    f['讀不清楚的欄位'] = Array.isArray(o && o['讀不清楚的欄位']) ? o['讀不清楚的欄位'].map(s => String(s).slice(0, 20)).slice(0, 12) : [];
    return f;
  }

  /** "民國083年05月20日" → 83 */
  function rocYear(s) {
    const m = String(s || '').match(/(\d{2,3})\s*年/);
    return m ? Number(m[1]) : null;
  }

  /**
   * 資格初篩。回傳 [{ s: ok|warn|bad|unk|info, l: 標籤, t: 標題, d: 說明 }]
   * nowYear：西元年（測試時可固定）
   */
  function deedChecks(f, nowYear) {
    const year = nowYear || new Date().getFullYear();
    const out = [];
    const use = f['主要用途'];
    if (!use) out.push({ s: 'unk', l: '待確認', t: '讀不到主要用途', d: '請人工確認謄本的「主要用途」欄。' });
    else if (/住/.test(use)) out.push({ s: 'ok', l: '符合', t: `主要用途「${use}」為住宅用途`, d: '社宅包租代管要求住宅用途；也必須是有門牌的合法建物（住宅法第 3 條）。' });
    else out.push({ s: 'bad', l: '不符合', t: `主要用途「${use}」沒有「住」字`, d: '可能無法加入社宅包租代管，需先確認實際用途或辦理變更。' });

    const n = f['所有權人數'];
    const shares = Array.isArray(f['權利範圍']) ? f['權利範圍'].filter(Boolean) : [];
    const shared = (n && n > 1) || shares.some(s => !/全部/.test(s));
    if (n == null && !shares.length) out.push({ s: 'unk', l: '待確認', t: '讀不到所有權人數', d: '請人工確認是否為共有。' });
    else if (shared) out.push({ s: 'warn', l: '需準備', t: `共有，所有權人 ${n || shares.length} 位`, d: '出租需要其他共有人同意，請準備共有人同意書；實際要求依業者審查。' });
    else out.push({ s: 'ok', l: '符合', t: '單獨所有', d: '不需要其他共有人同意。' });

    const yr = rocYear(f['建築完成日期']);
    if (yr) out.push({ s: 'info', l: '資訊', t: `屋齡約 ${year - (yr + 1911)} 年（民國 ${yr} 年完成）`, d: '已帶入步驟 1 的屋齡。' });
    if (f['登記原因'] && /繼承/.test(f['登記原因'])) out.push({ s: 'info', l: '資訊', t: '登記原因：繼承', d: shared ? '繼承取得的共有房屋，空置時適用較低的特定稅率，請在步驟 4 勾選。' : '繼承取得、單獨所有：空置時依一般非自住稅率計算。' });
    if (f['他項權利'] === '有') out.push({ s: 'info', l: '資訊', t: '有他項權利登記（例如抵押權）', d: '請交由業者確認是否影響出租。' });
    return out;
  }

  LD.deed = { DEED_KEYS, DEED_PROMPT, normalizeDeed, rocYear, deedChecks };
})(globalThis.LD = globalThis.LD || {});
