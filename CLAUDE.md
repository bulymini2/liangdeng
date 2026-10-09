# 亮燈：給 Claude 的開發說明

包租代管業者用的空屋房源開發工具原型。使用者介面全部是繁體中文（台灣用語）。

## 不能破壞的原則

- **金額只由 `js/calc.js` 計算。** AI（`js/prompts.js`、`js/deed.js`）只看照片、讀文件、把算好的數字說成白話；不要讓 AI 產生或改寫金額。
- **每條稅率規則都要有來源。** 新規則加進 `js/rules.js` 的 `LD.SRC`，並更新 `docs/rules.md`（推定的要標 ⚠️）。
- **AI 回覆不可信。** 新的 AI 輸出一定要經過 normalize 函式（限制代碼、範圍、長度），並加單元測試。
- 謄本提示詞不得要求輸出姓名、身分證字號等個資。
- 不用打包工具：`js/` 檔案用一般 `<script>` 依序載入，掛在全域 `LD` 底下；`index.html` 雙擊要能開。新增檔案時同時加到 `index.html` 和 `test/unit/load.js`。
- AI 與下載只透過 `js/platform.js`，畫面程式不直接呼叫 `window.claude` 或任何 API。API 金鑰不得出現在前端。

## 指令

```bash
npm test        # 單元測試（必跑）
npm run build   # 產生 dist/（dist 不進版控）
npm run e2e     # 瀏覽器端到端測試（需 npm install 與 npx playwright install chromium）
```

改動試算規則時，同步更新 `test/unit/calc.test.js` 的手算期望值，註解寫出算式。

## 更新 Claude 線上原型

`npm run build` 後，用 `dist/artifact.html` 發布到既有的 Artifact 網址（capabilities：`sample`（images: true）與 `downloads`）。
