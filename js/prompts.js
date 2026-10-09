/* 給 Claude 的提示詞，以及把 AI 回覆整理成安全格式的函式。
   原則：AI 只負責看照片、讀文件、把數字說成白話；金額一律由 js/calc.js 計算。 */
(function (LD) {
  'use strict';

  /** 屋況診斷：一次送一批照片，回傳固定代碼的發現。 */
  function diagPrompt(batch, offset) {
    const list = batch.map((p, i) => `第 ${offset + i + 1} 張：${p.room}`).join('\n');
    return `你是台灣老屋出租前整理的屋況評估助理，協助包租代管業務向屋主說明屋況。
以下 ${batch.length} 張照片來自同一戶準備出租的空屋，順序如下：
${list}

只根據照片看得到的狀況判斷；看不清楚的就不要列，也不要猜照片外的情況。
findings 的 item 只能用下列代碼：
- paint：牆面或天花板油漆老舊、髒污、剝落
- floor：地板磨損、破損、起翹、磁磚破裂
- leak：水漬、漏水痕跡、壁癌（白色結晶、油漆起泡）、發霉。severity：輕＝小面積斑點；中＝整面牆或明顯擴散；重＝大範圍或疑似仍在漏水
- bathroom：浴室設備。severity：輕＝龍頭、抽風機老舊；中＝馬桶或洗臉盆需更換；重＝磁磚大量破損或需整間翻新
- kitchen：廚房。severity：輕＝龍頭或局部老舊；中＝廚具需更換；重＝需整間翻新
- water_heater：熱水器老舊、生鏽
- lighting：燈具老舊、損壞或缺燈，count 填盞數
- window：窗戶玻璃破損、窗框鏽蝕或變形，count 填樘數
- aircon：臥室或客廳沒有冷氣，或冷氣明顯老舊，count 填台數

只回覆一個 JSON 物件，不要任何其他文字，格式如下：
{"photos":[{"index":${offset + 1},"room":"${batch[0].room}","score":3,"summary":"一句話描述這個空間","findings":[{"item":"leak","severity":"中","count":1,"evidence":"靠窗牆面約一平方公尺油漆起泡並有白色結晶"}]}],"overall":"兩到三句給屋主看的整體屋況說明"}
每張照片都要有一筆，index 用上面的編號。score 是 1 到 5 的整數，5 代表幾乎不用整理。severity 只能是 輕、中、重。evidence 寫出照片中的位置與狀況，30 字以內，用繁體中文。沒有問題的照片 findings 為空陣列。`;
  }

  /** 整理診斷回覆：未知代碼丟掉、嚴重度與數量限制在合理範圍、文字截斷。 */
  function normalizeDiag(out, batch, offset) {
    const { clampInt } = LD.util;
    const arr = out && Array.isArray(out.photos) ? out.photos : [];
    return {
      photos: batch.map((p, k) => {
        const o = arr.find(x => Number(x && x.index) === offset + k + 1) || arr[k] || {};
        const findings = (Array.isArray(o.findings) ? o.findings : [])
          .filter(f => f && LD.FIND_ITEMS.includes(f.item))
          .map(f => ({
            item: f.item,
            severity: ['輕', '中', '重'].includes(f.severity) ? f.severity : '中',
            count: clampInt(f.count, 1, 1, 12),
            evidence: String(f.evidence || '').slice(0, 60)
          }));
        return { photoId: p.id, room: p.room, score: clampInt(o.score, 3, 1, 5), summary: String(o.summary || '').slice(0, 80), findings };
      }),
      overall: String(out && out.overall || '').slice(0, 240)
    };
  }

  /** 整理後樣貌：請 AI 寫一段給影像編輯工具的英文指令。 */
  function editPrompt(room, findings) {
    const list = findings.length
      ? findings.map(f => `- ${LD.ITEM_LABEL[f.item]}（${f.severity}）：${f.evidence}`).join('\n')
      : '- 沒有明顯問題，只需一般整理';
    return `這張照片是一戶準備出租的空屋（${room}）。屋況診斷的發現：
${list}

請寫一段給 AI 影像編輯工具的指令，讓它以這張照片為底，畫出整理完成、可以出租的樣子：
1. 保留：拍攝角度、房間大小與格局、牆面位置、門窗的位置與大小、自然光方向
2. 修好上面列出的問題
3. 風格：白色或米白色牆面、淺木紋地板、LED 吸頂燈、${LD.ROOM_FURNITURE[room] || LD.ROOM_FURNITURE['其他']}；乾淨、明亮、實在，不要豪華裝潢
4. 不要：新增或移除門窗、改變房間大小、加入文字或浮水印、加入人物

只回覆一個 JSON 物件，不要其他文字：{"en":"英文指令，120 字以內","zh":"中文說明，告訴業務這張圖會改哪些地方，60 字以內"}`;
  }

  /**
   * 白話說明：只給算好的數字，請 AI 對應屋主顧慮。
   * v：{ title, age, concerns[], res, totals, mode, notary }
   */
  function explainPrompt(v) {
    const { fmt, wan, pct } = LD.util;
    const name = k => LD.calc.pathName(k, v.mode);
    const res = v.res, t = v.totals;
    const lines = [res.A, res.B, res.C].map(p =>
      `- ${name(p.key)}：${res.years} 年淨收入約 ${wan(p.total)}；每年淨收入 ${fmt(p.net)} 元；每年稅金合計 ${fmt(p.house + p.land + p.income)} 元` +
      (p.reno ? `；整理費用 ${fmt(p.reno)} 元，約第 ${p.payback || '—'} 年回收` : '')
    ).join('\n');
    return `你是包租代管業務的助理，要用白話向屋主說明三個選擇的試算結果。
規則：
- 只能使用下面「試算結果」和「規則重點」裡的數字，不要自己計算或推估新的數字，也不要承諾這些內容以外的事。
- 用繁體中文、台灣用語，口吻親切、不推銷，像跟長輩說明。
- 總長 300 字以內，不要用表格、Markdown 標題或粗體符號。

房子：${v.title}${v.age ? `，屋齡 ${v.age} 年` : ''}
屋主的顧慮：${v.concerns.length ? v.concerns.join('、') : '（沒有特別提到）'}

試算結果：
${lines}
整理費用估計 ${wan(t.mid)}（${wan(t.lo)}–${wan(t.hi)}），實際以工班報價為準。

規則重點：
- 房屋稅率：繼續空著 ${pct(res.vacantRate)}、自己出租 ${pct(res.rentRate)}、社宅包租代管 ${pct(res.socialRate)}
- 地價稅：一般千分之十；社宅包租代管減徵 80%
- 租金所得稅：自己出租扣除 43% 費用後計稅；社宅包租代管每月 1.5 萬元以內免稅，超過部分扣除 60% 費用
- 補助：修繕費每年最高 1 萬元；包租另有居家安全保險費每年最高 3,500 元；公證費每件最高 ${fmt(v.notary)} 元
- 包租：業者擔任二房東、簽 3 年約、每月付屋主市價 8 折，空租風險由業者承擔；代管：屋主直接和房客簽約、市價 9 折，業者負責管理
- 目前試算的社宅方案是：${v.mode}

請依序寫：
1. 一句話結論
2. 針對每個顧慮各寫一小段回應，每段 70 字以內，開頭寫出是哪個顧慮
3. 最後提醒兩件簽約前要再確認的事`;
  }

  LD.prompts = { diagPrompt, normalizeDiag, editPrompt, explainPrompt };
})(globalThis.LD = globalThis.LD || {});
