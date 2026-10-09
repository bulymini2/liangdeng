/* 稅率、補助規則與來源。
   規則改了：先改這裡，再改 docs/rules.md，最後跑 npm test。
   每一條規則都要能在 SRC 找到來源；推定的數字要在 docs/rules.md 標「待確認」。 */
(function (LD) {
  'use strict';

  /** 來源清單：t = 標題，u = 網址 */
  LD.SRC = {
    tpTax2:   { t: '臺北市稅捐稽徵處：房屋稅 2.0 新制重點', u: 'https://www-ws.gov.taipei/001/Upload/336/relfile/16016/137731/367fa217-fd40-4b0d-b73f-0c8b1de4ec05.pdf' },
    tpTable:  { t: '臺北市稅捐稽徵處：出租房屋租稅優惠一覽表', u: 'https://www-ws.gov.taipei/001/Upload/336/relfile/16016/4068/3ad22b1d-9504-4f75-ac4a-7acd1101d08c.pdf' },
    tpSocial: { t: '臺北市社會住宅興辦及公益出租人出租房屋減免地價稅及房屋稅自治條例 第 3 條', u: 'https://laws.gov.taipei/law/LawSearch/LawExport/FL089690?type=2' },
    mofBase:  { t: '新頭殼：財政部公布房屋稅差別稅率基準（2024/02/16）', u: 'https://newtalk.tw/news/view/2024-02-16/908920' },
    hcRent:   { t: '新竹縣政府稅務局：釋出空屋享優惠，房屋稅最低 1.6%（115/08/10）', u: 'https://www.etax.nat.gov.tw/etwmain/announcement/news/pKZEajp' },
    hcSocial: { t: '新竹縣興辦社會住宅與公益出租人減免地價稅及房屋稅自治條例 第 3 條', u: 'https://www.rootlaw.com.tw/LawArticle.aspx?LawID=B060220000000200-1090110' },
    hc2022:   { t: '新頭殼：新竹縣社會住宅等特定房屋按 1.6% 課徵（2022/05/12）', u: 'https://newtalk.tw/news/view/2022-05-12/753659' },
    law:      { t: '住宅法第 3、22、23 條（全國法規資料庫）', u: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0070195' },
    ntbt:     { t: '工商時報：社宅出租每月 1.5 萬元免稅、必要費用 60%，一般出租 43%（台北國稅局）', u: 'https://www.ctee.com.tw/news/20240313700403-430103' },
    subsidy:  { t: '臺北市都發局：社會住宅包租代管第 4 期計畫宣傳摺頁', u: 'https://www.udd.gov.taipei/assets/fqG3ogqi6Q2PE8hF8Znn1i/attachs/社會住宅包租代管第4期計畫宣傳摺頁(2023版).pdf' },
    plan:     { t: '行政院核定「百萬戶租屋家庭支持計畫（114–121 年）」包租代管內容', u: 'https://leasing-and-management.udd.gov.taipei/attachments/百萬戶租屋家庭支持計畫包租代管內容_行政院114年4月16日院臺建字第1141006421號函核定.pdf' },
    lowUse:   { t: '內政部統計通報：低度使用（用電）住宅', u: 'https://ws.moi.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvNDAwL3JlbGZpbGUvMC8yMjI3NS9jNTAwMmI4YS03MTg5LTQwMDAtOTRmOC00MDY0ZjE2ZjQzZDgucGRm&n=MTE05bm056ysMzHpgLHlhafmlL/ntbHoqIjpgJrloLFf5L2O5bqm55So6Zu7LnBkZg%3D%3D' },
    p_paint:  { t: 'PRO360：油漆工程價格', u: 'https://www.pro360.com.tw/price/wall_painting' },
    p_spc:    { t: 'PRO360：SPC 地板價格', u: 'https://www.pro360.com.tw/price/spc_floor' },
    p_leak:   { t: 'PRO360：牆壁漏水處理費用', u: 'https://www.pro360.com.tw/price/wall_leak_treatment' },
    p_find:   { t: 'PRO360：抓漏費用', u: 'https://www.pro360.com.tw/price/roof_repair' },
    p_bath:   { t: 'PRO360：浴室裝潢費用', u: 'https://www.pro360.com.tw/price/bathroom_decorating' },
    p_kb:     { t: 'PRO360：廚衛翻新行情（2026/07）', u: 'https://www.pro360.com.tw/guide/old_k_b_renovation_remodel_cost' },
    p_heater: { t: 'PRO360：熱水器安裝價格', u: 'https://www.pro360.com.tw/price/heater_installation' },
    p_light:  { t: 'PRO360：燈具安裝價格', u: 'https://www.pro360.com.tw/price/light_fixture_installation' },
    p_window: { t: 'PRO360：鋁窗價格', u: 'https://www.pro360.com.tw/price/aluminum_windows' },
    p_ac:     { t: 'PRO360：分離式冷氣安裝價格', u: 'https://www.pro360.com.tw/price/split_ac_installation' }
  };

  /**
   * 各縣市房屋稅規則。級距寫成 [戶數上限, 稅率]，依「全國持有非自住戶數」查表。
   * vacant：非自住、未出租（繼續空著）
   * rent：出租且申報租賃所得達租金標準（繼承共有也適用這張表）
   * social：社宅包租代管。rate = 直接訂的稅率；或 base × (1 - cut) = 稅額減徵
   * landCut：社宅包租代管減徵應納地價稅的比例
   * notary：社宅包租代管公證費補助上限（每件）
   */
  LD.RULES = {
    hsinchu: {
      name: '新竹縣', notary: 3000,
      vacant: [[1, 0.026], [4, 0.032], [6, 0.038], [Infinity, 0.048]],
      rent:   [[4, 0.016], [6, 0.020], [Infinity, 0.024]],
      social: { base: 0.016, cut: 0.25 },
      landCut: 0.8
    },
    taipei: {
      name: '台北市', notary: 4500,
      vacant: [[2, 0.032], [4, 0.038], [6, 0.042], [Infinity, 0.048]],
      rent:   [[4, 0.015], [6, 0.020], [Infinity, 0.024]],
      social: { rate: 0.01 },
      landCut: 0.8
    }
  };

  /** 全國一致的規則 */
  LD.NATIONAL = {
    landRate: 0.01,      // 地價稅一般用地基本稅率千分之十（假設未超過累進起點）
    expGeneral: 0.43,    // 一般出租：必要費用 43%
    exempt: 15000,       // 社宅包租代管：每屋每月 1.5 萬元以內免稅
    expSocial: 0.60,     // 社宅包租代管：超過部分必要費用 60%
    repairCap: 10000,    // 修繕費補助每年每屋上限
    insureCap: 3500,     // 包租居家安全保險費補助每年上限
    share: { '包租': 0.8, '代管': 0.9 }  // 屋主拿到的市價比例
  };
})(globalThis.LD = globalThis.LD || {});
