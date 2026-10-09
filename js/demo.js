/* 示範資料：竹北老公寓的完整案例（屋況插圖、整理後示意、示範謄本），以及業者總覽用的 6 筆示範案件。
   插圖是用程式畫的示意圖，不是真實照片；所有地址、謄本內容都是虛構並標「示範」。 */
(function (LD) {
  'use strict';

  /* ================= 房間插圖（一點透視，800×600） ================= */
  const VP = { x: 400, y: 260 };
  const BACK = { l: 200, r: 600, t: 120, b: 400 };
  // 地板上的點：從後牆底邊 x 往前延伸到 y 的位置
  const floorX = (x, y) => VP.x + (x - VP.x) * (y - VP.y) / (BACK.b - VP.y);

  function shell(c) {
    let s = '';
    s += `<rect width="800" height="600" fill="${c.ceiling}"/>`;
    s += `<polygon points="0,0 800,0 ${BACK.r},${BACK.t} ${BACK.l},${BACK.t}" fill="${c.ceiling}"/>`;
    s += `<polygon points="0,0 ${BACK.l},${BACK.t} ${BACK.l},${BACK.b} 0,600" fill="${c.side}"/>`;
    s += `<polygon points="800,0 ${BACK.r},${BACK.t} ${BACK.r},${BACK.b} 800,600" fill="${c.side2 || c.side}"/>`;
    s += `<rect x="${BACK.l}" y="${BACK.t}" width="${BACK.r - BACK.l}" height="${BACK.b - BACK.t}" fill="${c.wall}"/>`;
    s += `<polygon points="0,600 800,600 ${BACK.r},${BACK.b} ${BACK.l},${BACK.b}" fill="${c.floor}"/>`;
    // 地板線：瓷磚格線或木地板
    const lines = [];
    if (c.planks) {
      for (let x = BACK.l; x <= BACK.r; x += 25) lines.push(`M${x} ${BACK.b} L${floorX(x, 600).toFixed(1)} 600`);
    } else {
      for (let x = BACK.l; x <= BACK.r; x += 50) lines.push(`M${x} ${BACK.b} L${floorX(x, 600).toFixed(1)} 600`);
      for (const y of [425, 458, 503, 565]) lines.push(`M${floorX(BACK.l, y).toFixed(1)} ${y} L${floorX(BACK.r, y).toFixed(1)} ${y}`);
    }
    s += `<path d="${lines.join(' ')}" stroke="${c.floorLine}" stroke-width="1.6" fill="none"/>`;
    // 踢腳板
    s += `<rect x="${BACK.l}" y="${BACK.b - 8}" width="${BACK.r - BACK.l}" height="8" fill="${c.skirt}"/>`;
    return s;
  }

  const stain = (x, y, rx, ry, color, op) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${op}"/>`;
  function efflorescence(x, y, w, h, seed) {
    // 壁癌：白色結晶與油漆起泡
    let s = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 1.6}" ry="${h / 1.4}" fill="#8f7c55" opacity=".28"/>`;
    let r = seed;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 26; i++) s += `<circle cx="${(x + rnd() * w).toFixed(1)}" cy="${(y + rnd() * h).toFixed(1)}" r="${(2 + rnd() * 6).toFixed(1)}" fill="#f4f1e6" opacity="${(0.55 + rnd() * 0.4).toFixed(2)}"/>`;
    for (let i = 0; i < 6; i++) s += `<path d="M${(x + rnd() * w).toFixed(1)} ${(y + rnd() * h).toFixed(1)} l${(6 + rnd() * 10).toFixed(1)} ${(-4 + rnd() * 8).toFixed(1)} l${(4 + rnd() * 6).toFixed(1)} ${(4 + rnd() * 6).toFixed(1)}" stroke="#7d6a45" stroke-width="1.4" fill="none" opacity=".6"/>`;
    return s;
  }
  const crack = (pts) => `<polyline points="${pts}" fill="none" stroke="#6d6556" stroke-width="2.2" stroke-linejoin="round" opacity=".8"/>`;
  function windowBack(x, y, w, h, frame, glass) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${frame}"/><rect x="${x + 7}" y="${y + 7}" width="${w / 2 - 10}" height="${h - 14}" fill="${glass}"/><rect x="${x + w / 2 + 3}" y="${y + 7}" width="${w / 2 - 10}" height="${h - 14}" fill="${glass}"/>` +
      `<path d="M${x + 14} ${y + h - 20} L${x + w / 2 - 12} ${y + 20}" stroke="#ffffff" stroke-width="5" opacity=".35"/>`;
  }

  function room(type, after) {
    const B = { ceiling: '#d6cfb6', side: '#bdb391', side2: '#c4ba98', wall: '#cdc3a2', floor: '#b6ad9b', floorLine: '#8f8676', skirt: '#9c8f6e' };
    const A = { ceiling: '#fbfaf7', side: '#e6e3dc', side2: '#ece9e3', wall: '#f4f2ed', floor: '#cfa77c', floorLine: '#b48a5e', skirt: '#e0dbd2', planks: true };
    const c = after ? A : B;
    if (type === 'bathroom') { c.floor = after ? '#dfe3e6' : '#a9a698'; c.planks = false; c.floorLine = after ? '#c4cacf' : '#7d7a6e'; }
    if (type === 'kitchen') { c.planks = false; c.floor = after ? '#d9d6cf' : '#b2aa98'; c.floorLine = after ? '#c3bfb6' : '#8b8373'; }
    let s = shell(c);

    if (type === 'living') {
      s += windowBack(330, 165, 140, 140, after ? '#e9eef2' : '#8c9196', after ? '#bfe0f2' : '#9fb3bf');
      if (after) {
        s += '<rect x="300" y="160" width="26" height="170" rx="4" fill="#d9cdb8"/><rect x="474" y="160" width="26" height="170" rx="4" fill="#d9cdb8"/>';
        s += '<circle cx="400" cy="58" r="34" fill="#ffffff"/><circle cx="400" cy="58" r="34" fill="none" stroke="#e3dfd7" stroke-width="3"/>';
        s += '<rect x="250" y="355" width="300" height="70" rx="12" fill="#6f8091"/><rect x="250" y="330" width="300" height="40" rx="12" fill="#7c8d9e"/><rect x="235" y="345" width="30" height="85" rx="10" fill="#66778a"/><rect x="535" y="345" width="30" height="85" rx="10" fill="#66778a"/>';
        s += '<rect x="330" y="460" width="150" height="16" rx="6" fill="#b88d5f"/><rect x="345" y="476" width="8" height="40" fill="#9a734b"/><rect x="457" y="476" width="8" height="40" fill="#9a734b"/>';
        s += '<rect x="618" y="380" width="44" height="60" rx="6" fill="#e8e2d6"/><circle cx="640" cy="352" r="34" fill="#5e8f5c"/><circle cx="622" cy="336" r="20" fill="#6fa36c"/>';
      } else {
        s += '<rect x="310" y="40" width="180" height="12" rx="4" fill="#efeee6"/><rect x="310" y="52" width="180" height="5" fill="#a9a48f"/>';
        s += efflorescence(212, 250, 105, 120, 7);
        s += stain(560, 150, 60, 22, '#8a6f3e', .35) + stain(560, 150, 36, 12, '#8a6f3e', .35);
        s += crack('260,520 300,500 318,512 352,480 380,488') + crack('520,560 548,530 540,512 566,470');
        s += '<rect x="480" y="230" width="60" height="44" fill="#d4ccb0" opacity=".9"/><path d="M480 230 l60 0 l-10 18 l-50 2 z" fill="#b9ad89"/>';
      }
    } else if (type === 'bedroom') {
      // 左牆窗戶
      s += `<polygon points="40,150 150,175 150,330 40,360" fill="${after ? '#e9eef2' : '#8c9196'}"/><polygon points="50,163 140,183 140,322 50,348" fill="${after ? '#bfe0f2' : '#9fb3bf'}"/>`;
      if (after) {
        s += '<rect x="330" y="150" width="140" height="40" rx="8" fill="#f8f8f8"/><rect x="340" y="182" width="120" height="4" fill="#d5d8db"/>';
        s += '<circle cx="400" cy="58" r="30" fill="#ffffff"/><circle cx="400" cy="58" r="30" fill="none" stroke="#e3dfd7" stroke-width="3"/>';
        s += '<rect x="290" y="270" width="220" height="70" rx="6" fill="#b88d5f"/><polygon points="250,470 550,470 520,340 280,340" fill="#eef0f2"/><polygon points="250,470 550,470 550,500 250,500" fill="#d5dade"/><polygon points="275,380 525,380 520,340 280,340" fill="#7d93a8"/><rect x="300" y="345" width="80" height="22" rx="8" fill="#ffffff"/><rect x="420" y="345" width="80" height="22" rx="8" fill="#ffffff"/>';
        s += '<rect x="570" y="390" width="60" height="60" rx="4" fill="#c99d6c"/><circle cx="600" cy="378" r="12" fill="#ffe7a8"/>';
      } else {
        s += '<rect x="360" y="170" width="80" height="50" fill="#5d5a50"/><rect x="368" y="178" width="64" height="34" fill="#2f2d28"/>';
        s += stain(575, 135, 40, 16, '#7a5f32', .45) + stain(585, 140, 22, 8, '#6a5028', .4);
        s += '<rect x="370" y="52" width="60" height="16" rx="3" fill="#e6dfb8"/>';
        s += crack('420,540 446,512 470,520 498,476');
      }
    } else if (type === 'bathroom') {
      // 牆磚
      const tile = after ? '#f2f5f7' : '#c9c6b4', line = after ? '#d9dfe3' : '#9e9a86';
      s += `<rect x="${BACK.l}" y="${BACK.t}" width="400" height="280" fill="${tile}"/>`;
      let g = '';
      for (let x = BACK.l; x <= BACK.r; x += 40) g += `M${x} ${BACK.t} L${x} ${BACK.b} `;
      for (let y = BACK.t; y <= BACK.b; y += 40) g += `M${BACK.l} ${y} L${BACK.r} ${y} `;
      s += `<path d="${g}" stroke="${line}" stroke-width="1.5"/>`;
      // 洗臉盆與馬桶
      s += `<rect x="250" y="250" width="110" height="30" rx="10" fill="${after ? '#ffffff' : '#e8e3cf'}"/><rect x="290" y="280" width="30" height="110" fill="${after ? '#ffffff' : '#ddd6bd'}"/>`;
      s += `<rect x="295" y="225" width="12" height="28" fill="${after ? '#b9c2c9' : '#8a6a3f'}"/>`;
      s += `<rect x="440" y="250" width="90" height="70" rx="8" fill="${after ? '#ffffff' : '#e3dcc2'}"/><ellipse cx="485" cy="370" rx="62" ry="34" fill="${after ? '#ffffff' : '#ddd5b8'}"/><rect x="455" y="370" width="60" height="50" fill="${after ? '#f4f6f7' : '#d3caa9'}"/>`;
      if (after) {
        s += '<rect x="250" y="140" width="110" height="80" rx="6" fill="#dfe9ef" stroke="#c9d3d9" stroke-width="3"/>';
        s += '<polygon points="560,120 600,120 600,400 560,420" fill="#cfe6f0" opacity=".55"/>';
        s += '<circle cx="400" cy="55" r="26" fill="#ffffff"/>';
      } else {
        s += stain(490, 405, 40, 10, '#8a7a3c', .55) + stain(305, 300, 12, 40, '#7d6232', .35);
        s += crack('360,160 372,186 366,200 380,226') + '<path d="M480 330 q6 14 0 26" stroke="#6b5a2e" stroke-width="3" fill="none" opacity=".6"/>';
        s += '<rect x="372" y="44" width="56" height="14" rx="3" fill="#e6dfb8"/>';
      }
    } else if (type === 'kitchen') {
      // 流理台與吊櫃
      const cab = after ? '#ffffff' : '#c8bfa3', top = after ? '#d7d2c8' : '#9e9886', door = after ? '#e6e2da' : '#b3aa8c';
      s += `<rect x="${BACK.l}" y="135" width="400" height="80" fill="${cab}"/><rect x="${BACK.l}" y="290" width="400" height="22" fill="${top}"/><rect x="${BACK.l}" y="312" width="400" height="80" fill="${cab}"/>`;
      let d = '';
      for (let x = BACK.l; x < BACK.r; x += 80) d += `<rect x="${x + 6}" y="141" width="68" height="68" fill="${door}"/><rect x="${x + 6}" y="318" width="68" height="68" fill="${door}"/>`;
      s += d;
      s += `<rect x="300" y="282" width="90" height="10" fill="${after ? '#bfc6cc' : '#8f8f86'}"/><rect x="335" y="250" width="8" height="34" fill="${after ? '#b9c2c9' : '#7a6a48'}"/>`;
      // 右側陽台的熱水器
      s += `<polygon points="660,170 730,150 730,300 660,300" fill="${after ? '#f5f6f7' : '#b9b3a3'}"/><polygon points="672,190 718,178 718,280 672,286" fill="${after ? '#e9ecef' : '#9a8c6e'}"/>`;
      if (after) {
        s += '<rect x="${BACK.l}" y="215" width="400" height="75" fill="#eef1f3"/>'.replace('${BACK.l}', BACK.l);
        s += '<circle cx="400" cy="55" r="28" fill="#ffffff"/>';
      } else {
        s += '<path d="M200 290 L600 290" stroke="#2f2c25" stroke-width="3" opacity=".55"/>';
        s += stain(700, 260, 22, 30, '#8a4f22', .55) + stain(690, 200, 10, 14, '#8a4f22', .5);
        s += '<rect x="372" y="44" width="56" height="14" rx="3" fill="#e6dfb8"/>';
      }
    }
    // 角落標示
    s += `<rect x="16" y="560" width="${after ? 178 : 150}" height="26" rx="6" fill="#0d1726" opacity=".72"/><text x="28" y="578" font-size="14" fill="#ffffff" font-family="sans-serif">${after ? '示範插圖・整理後示意' : '示範插圖・現況'}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">${s}</svg>`;
  }

  /* ================= 示範謄本 ================= */
  function deedSVG() {
    const rows = [
      ['建物標示部', ''],
      ['建物門牌', '新竹縣竹北市○○路○○號三樓'],
      ['主要用途', '住家用'],
      ['主要建材', '鋼筋混凝土造'],
      ['層數', '五層'],
      ['層次', '三層'],
      ['總面積', '84.60 平方公尺'],
      ['建築完成日期', '民國083年05月20日'],
      ['建物所有權部', ''],
      ['登記原因', '繼承'],
      ['所有權人', '○○○（已遮蔽）'],
      ['權利範圍', '全部'],
      ['建物他項權利部', ''],
      ['', '（空白）']
    ];
    let y = 190, s = '';
    for (const [k, v] of rows) {
      if (!v) { s += `<rect x="60" y="${y - 24}" width="680" height="34" fill="#eef0f2"/><text x="72" y="${y}" font-size="20" font-weight="700" fill="#1d2633">${k}</text>`; }
      else { s += `<text x="72" y="${y}" font-size="19" fill="#5a6372">${k}</text><text x="270" y="${y}" font-size="19" fill="#141c2b">${v}</text><line x1="60" x2="740" y1="${y + 12}" y2="${y + 12}" stroke="#e1e4e8"/>`; }
      y += 50;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 900" width="800" height="900"><rect width="800" height="900" fill="#fdfdfb"/><rect x="30" y="30" width="740" height="840" fill="none" stroke="#c9ced6" stroke-width="2"/>
      <text x="400" y="92" font-size="28" font-weight="700" fill="#141c2b" text-anchor="middle">建物登記謄本（示範）</text>
      <text x="400" y="128" font-size="16" fill="#5a6372" text-anchor="middle">新竹縣竹北市○○段○○小段　建號○○○○</text>${s}
      <text x="400" y="560" font-size="96" font-weight="900" fill="#c2553a" opacity=".14" text-anchor="middle" transform="rotate(-24 400 560)">示範用・非真實謄本</text></svg>`;
  }

  /** SVG 字串 → JPEG Blob（AI 只收 JPEG/PNG；失敗時回傳 SVG Blob 給畫面顯示）。
      用 data: 網址載入，不依賴 blob: 網址（部分內嵌環境不允許）。 */
  async function svgToJpeg(svg, w, h) {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
    try {
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      const jpg = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.88));
      return jpg || svgBlob;
    } catch (e) { return svgBlob; }
  }

  /* ================= 示範案件 ================= */
  const DEMO_ID = 'demo-zhubei';
  const BASE_CALC = { houseValue: 450000, landValue: 600000, count: 1, inherited: false, bracket: 0.2, rent: 18000, renoAuto: true, reno: 0, mode: '包租', vacancy: 1, agentMonths: 0.25, maint: 12000, years: 10 };

  function mainDemo() {
    return {
      id: DEMO_ID, demo: true, status: 'thinking', followUp: '2026-10-14', note: '屋主想先和住台北的兄弟姊妹討論，下週三再聯絡。',
      createdAt: '2026-10-03', updatedAt: '2026-10-08', step: 1,
      case: { city: 'hsinchu', addr: '新竹縣竹北市○○路（示範）', ping: 25, age: 32, rooms: 3, halls: 2, baths: 1, kwh: 28 },
      photos: [
        { id: 'demo-p1', room: '客廳', art: 'living', w: 800, h: 600 },
        { id: 'demo-p2', room: '臥室', art: 'bedroom', w: 800, h: 600 },
        { id: 'demo-p3', room: '浴室', art: 'bathroom', w: 800, h: 600 },
        { id: 'demo-p4', room: '廚房', art: 'kitchen', w: 800, h: 600 }
      ],
      diagnosis: {
        demo: true,
        overall: '屋況屬於一般老公寓，結構沒有明顯問題。主要是油漆、地板和浴室設備老舊，客廳靠窗的壁癌要先找出漏水來源。整理完就能出租。',
        photos: [
          { photoId: 'demo-p1', room: '客廳', score: 3, summary: '牆面泛黃、靠窗有壁癌，磁磚地板有裂痕', findings: [
            { item: 'paint', severity: '中', count: 1, evidence: '牆面與天花板整體泛黃、多處髒污' },
            { item: 'leak', severity: '中', count: 1, evidence: '靠窗牆面約一平方公尺油漆起泡、白色結晶' },
            { item: 'floor', severity: '中', count: 1, evidence: '磁磚地板兩處裂痕' },
            { item: 'lighting', severity: '輕', count: 2, evidence: '日光燈老舊，燈管發黃' } ] },
          { photoId: 'demo-p2', room: '臥室', score: 3, summary: '天花板角落有水漬，只剩舊窗型冷氣孔', findings: [
            { item: 'leak', severity: '輕', count: 1, evidence: '天花板角落約手掌大的水漬' },
            { item: 'aircon', severity: '中', count: 1, evidence: '臥室沒有冷氣，牆上留有舊窗型冷氣孔' },
            { item: 'lighting', severity: '輕', count: 1, evidence: '吸頂燈燈罩發黃' } ] },
          { photoId: 'demo-p3', room: '浴室', score: 2, summary: '馬桶與洗臉盆老舊，龍頭鏽蝕', findings: [
            { item: 'bathroom', severity: '中', count: 1, evidence: '馬桶底座黃垢、牆磚裂痕、龍頭鏽蝕' } ] },
          { photoId: 'demo-p4', room: '廚房', score: 3, summary: '廚具堪用，熱水器外殼生鏽', findings: [
            { item: 'kitchen', severity: '輕', count: 1, evidence: '檯面矽利康發黑，水槽龍頭鬆動' },
            { item: 'water_heater', severity: '中', count: 1, evidence: '陽台熱水器外殼生鏽、排氣口變色' } ] }
        ]
      },
      repairs: null, // 開啟時由診斷產生
      after: { photoId: 'demo-p1', prompt: { en: 'Using this photo of the living room as the base, keep the camera angle, room size, wall and window positions and the daylight direction. Repaint all walls and the ceiling in warm white, remove the water damage and efflorescence under the window, replace the cracked tiles with light oak plank flooring, swap the fluorescent tube for a round LED ceiling light, and add a simple grey fabric sofa, a small wooden coffee table and a potted plant. Clean, bright and practical, not luxurious. No added doors or windows, no text, no people.', zh: '牆面與天花板重新粉刷、處理窗下壁癌、地板換成淺色木紋、換 LED 吸頂燈，擺上簡單沙發與茶几。' }, afterArt: 'living', ownBefore: null },
      deedFields: { '門牌': '新竹縣竹北市○○路○○號三樓（示範）', '主要用途': '住家用', '主要建材': '鋼筋混凝土造', '層數': '五層', '層次': '三層', '總面積平方公尺': 84.6, '建築完成日期': '民國083年05月20日', '登記原因': '繼承', '所有權人數': 1, '權利範圍': ['全部'], '他項權利': '無', '讀不清楚的欄位': [] },
      deedDemo: true, deedArt: true,
      calc: { ...BASE_CALC },
      concerns: ['擔心房客弄壞房子', '要和家人一起決定'], concernText: '',
      explanation: '結論：以這間房子的條件，交給社宅包租十年下來剩得最多，比繼續空著多出一百五十多萬。\n\n擔心房客弄壞房子：包租是由業者當二房東，房客的管理和修繕都由業者處理，政府每年另外補助最高 1 萬元修繕費，以及最高 3,500 元的居家安全保險費。\n\n要和家人一起決定：這份報告可以直接轉給兄弟姊妹，每個數字都附上計算依據和來源，大家看的是同一份資料。\n\n簽約前請再確認兩件事：一是整理費用以工班實際報價為準；二是加入社宅包租代管要先通過業者與主管機關的審查。'
    };
  }

  /** 其他示範案件：只有基本資料與試算條件，用來讓總覽有內容 */
  function otherDemos() {
    const mk = (id, addr, city, ping, age, status, created, calc, extra) => ({
      id, demo: true, status, createdAt: created, updatedAt: created, step: 4,
      followUp: extra && extra.followUp || '', note: extra && extra.note || '',
      case: { city, addr, ping, age, rooms: 2, halls: 1, baths: 1, kwh: '' },
      photos: [], diagnosis: null, repairs: [{ key: id + '-r', id: 'custom', name: '工班報價（示範）', amount: extra.reno, auto: false, on: true, detail: '示範金額' }],
      after: { photoId: null, prompt: null, ownBefore: null }, deedFields: null, deedDemo: false,
      calc: { ...BASE_CALC, ...calc }, concerns: [], concernText: '', explanation: ''
    });
    return [
      mk('demo-zhudong', '新竹縣竹東鎮○○街（示範）', 'hsinchu', 30, 38, 'signed', '2026-09-18', { houseValue: 380000, landValue: 720000, rent: 16000, mode: '包租', bracket: 0.12 }, { reno: 180000, note: '9/30 簽約，包租 3 年。' }),
      mk('demo-hukou', '新竹縣湖口鄉○○路（示範）', 'hsinchu', 18, 22, 'signed', '2026-09-22', { houseValue: 520000, landValue: 480000, rent: 14000, mode: '代管', bracket: 0.05 }, { reno: 60000, note: '屋主想自己挑房客，選代管。' }),
      mk('demo-xinfeng', '新竹縣新豐鄉○○街（示範）', 'hsinchu', 22, 27, 'report', '2026-10-01', { houseValue: 410000, landValue: 500000, rent: 15000, count: 2 }, { reno: 120000, followUp: '2026-10-09', note: '報告已用 LINE 傳給屋主。' }),
      mk('demo-daan', '台北市大安區○○路（示範）', 'taipei', 15, 45, 'lost', '2026-09-25', { houseValue: 300000, landValue: 1800000, rent: 26000, bracket: 0.3 }, { reno: 350000, note: '屋主決定都更前先出售。' }),
      mk('demo-zhubei2', '新竹縣竹北市○○一路（示範）', 'hsinchu', 28, 18, 'visit', '2026-10-08', { houseValue: 900000, landValue: 900000, rent: 24000, bracket: 0.3 }, { reno: 80000 })
    ];
  }

  LD.demo = { DEMO_ID, room, deedSVG, svgToJpeg, mainDemo, otherDemos };
})(globalThis.LD = globalThis.LD || {});
