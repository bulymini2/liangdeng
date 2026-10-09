/* 修繕估價表與 AI 用的分類。
   金額是 PRO360 公開行情；正式版要換成合作工班的報價單。
   range = [低, 高]（每單位），tiers = 依輕／中／重分級的整筆金額，perPing = 依室內坪數計。 */
(function (LD) {
  'use strict';

  LD.CATALOG = {
    paint:   { name: '全室油漆', unit: '坪', perPing: true, range: [1250, 2500], note: '批土＋乳膠漆兩道（每塗刷坪 500–1,000 元）；以室內坪數 × 2.5 換算塗刷面積，換算倍數為原型假設', src: ['p_paint'] },
    floor:   { name: '全室地板（SPC 直鋪）', unit: '坪', perPing: true, range: [2000, 4000], note: '連工帶料', src: ['p_spc'] },
    leak:    { name: '漏水／壁癌處理', unit: '處', tiers: { '輕': [3000, 8000], '中': [8000, 20000], '重': [20000, 50000] },
               tierText: { '輕': '局部刮除、防水底漆、補漆', '中': '整面牆處理、矽酸質防水', '重': '先抓漏止漏（含儀器檢測）' }, note: '依漏水處理與抓漏行情組合；三級分法為原型假設', src: ['p_leak', 'p_find'] },
    bathroom:{ name: '浴室整理', unit: '間', tiers: { '輕': [2700, 8000], '中': [14700, 43000], '重': [120000, 350000] },
               tierText: { '輕': '換龍頭、抽風機', '中': '換馬桶、洗臉盆、龍頭、抽風機', '重': '整間拆除翻新' }, note: '設備含安裝：馬桶 8,000–15,000、洗臉盆 4,000–20,000、龍頭 1,500–4,000、抽風機 1,200–4,000；整間翻新 12–35 萬', src: ['p_bath', 'p_kb'] },
    kitchen: { name: '廚房整理', unit: '間', tiers: { '輕': [1500, 4000], '中': [80000, 150000], '重': [100000, 350000] },
               tierText: { '輕': '換龍頭、局部修補', '中': '更換一字型系統廚具', '重': '整間拆除翻新' }, note: '系統廚具 8–15 萬；整間翻新 10–35 萬', src: ['p_bath', 'p_kb'] },
    water_heater: { name: '熱水器更換', unit: '台', range: [5400, 19000], note: '瓦斯型含安裝（室外型到強制排氣型）', src: ['p_heater'] },
    lighting:{ name: '燈具更換（LED 吸頂燈）', unit: '盞', range: [1300, 4000], note: '安裝 300–1,000 元；燈具 1,000–3,000 元為原型假設', src: ['p_light'] },
    window:  { name: '鋁窗更換', unit: '樘', range: [6000, 9000], note: '每才 300–450 元，以 20 才的窗計', src: ['p_window'] },
    aircon:  { name: '冷氣新裝（入門 1 對 1）', unit: '台', range: [20000, 45000], note: '連工帶料行情 2–10 萬元／台，原型取入門款區間', src: ['p_ac'] },
    electrical: { name: '配電盤升級', unit: '案', range: [15000, 30000], note: '老屋總電量不足時', src: ['p_kb'] },
    leak_check: { name: '儀器抓漏檢測', unit: '次', range: [8000, 20000], src: ['p_find'] }
  };

  /** AI 屋況診斷只能回傳這些代碼 */
  LD.FIND_ITEMS = ['paint', 'floor', 'leak', 'bathroom', 'kitchen', 'water_heater', 'lighting', 'window', 'aircon'];
  LD.ITEM_LABEL = { paint: '油漆', floor: '地板', leak: '漏水／壁癌', bathroom: '浴室', kitchen: '廚房', water_heater: '熱水器', lighting: '燈具', window: '窗戶', aircon: '冷氣' };
  LD.ROOMS = ['客廳', '臥室', '廚房', '浴室', '陽台', '其他'];
  LD.ROOM_FURNITURE = { '客廳': '一組簡單的布沙發、茶几與電視櫃', '臥室': '一張雙人床、床頭櫃和衣櫃', '廚房': '整齊的一字型廚具', '浴室': '乾淨的白色衛浴設備', '陽台': '整齊的洗衣機位置', '其他': '少量基本家具' };
  LD.CONCERNS = ['擔心房客弄壞房子', '以後想留給子女', '幾年後可能要賣', '怕被查稅', '不想花時間管', '要和家人一起決定'];
})(globalThis.LD = globalThis.LD || {});
