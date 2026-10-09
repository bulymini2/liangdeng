# 亮燈：給 Claude 的開發說明

包租代管業者用的空屋房源開發工具原型。使用者介面全部是繁體中文（台灣用語）。三個畫面：開場（`#intro`）、案件總覽（`#cases`）、拜訪流程（`#visit/案件ID/步驟`），另有一鍵導覽。

## 不能破壞的原則

- **金額只由 `js/calc.js` 計算。** AI（`js/prompts.js`、`js/deed.js`）只看照片、讀文件、把算好的數字說成白話；不要讓 AI 產生或改寫金額。
- **每條稅率規則都要有來源。** 新規則加進 `js/rules.js` 的 `LD.SRC`，並更新 `docs/rules.md`（推定的要標 ⚠️）。收入假設、開場的市場數字也記在 `docs/rules.md`。
- **AI 回覆不可信。** 新的 AI 輸出一定要經過 normalize 函式（限制代碼、範圍、長度），並加單元測試。
- **存起來的資料和備份檔也不可信。** 讀進來的案件一律經過 `LD.pipeline.normalizeCase`；案件 ID、照片 ID 只能是英數字、`-`、`_`（會放進網址與 HTML 屬性）。改了案件欄位，要一起改 `blankCase`、`normalizeCase` 和 `test/unit/pipeline.test.js`。
- 示範案件（`js/demo.js`）永遠不保存、全部標「示範」；地址與謄本是虛構的，不放任何真實姓名。示範數字改了，`test/unit/demo.test.js` 與 `js/app.js` 的導覽文字要一起改。
- 謄本提示詞不得要求輸出姓名、身分證字號等個資。
- 不用打包工具：`js/` 檔案用一般 `<script>` 依序載入，掛在全域 `LD` 底下；`index.html` 雙擊要能開。新增檔案時同時加到 `index.html` 和 `test/unit/load.js`（`app.js` 除外，它會操作畫面）。
- AI 與下載只透過 `js/platform.js`，畫面程式不直接呼叫 `window.claude` 或任何 API。API 金鑰不得出現在前端。
- 圖片在畫面上用 data: 網址顯示，不用 blob: 網址（部分內嵌環境不允許）。

## 指令

```bash
npm test        # 單元測試（必跑）
npm run build   # 產生 dist/（dist 不進版控）
npm run e2e     # 瀏覽器端到端測試（需 npm install 與 npx playwright install chromium）
```

改動試算規則時，同步更新 `test/unit/calc.test.js` 的手算期望值，註解寫出算式。改了畫面的 ID 或流程，同步更新 `test/e2e/flow.test.js`；手機寬度 375px 不能出現橫向捲動。

## 更新 Claude 線上原型

`npm run build` 後，用 `dist/artifact.html` 發布到既有的 Artifact 網址（capabilities：`sample`（images: true）與 `downloads`；重新發布時沿用即可）。
