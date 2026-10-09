# 亮燈：AI 空屋活化顧問（原型）

給包租代管業者的房源開發工具。業務拜訪空屋屋主時，用手機拍照、讀謄本，幾分鐘內產出屋況診斷、整理後樣貌，以及「繼續空著、自己出租、交給社宅包租代管」三條路的十年試算，讓屋主當場看懂、帶走一頁報告和家人討論。

這是 115 年新竹縣青春靚點子全國學生創業挑戰賽的參賽原型。

## 打開來看

| 方式 | AI 功能 | 適合 |
| --- | --- | --- |
| Claude 線上原型（擁有者分享連結） | 可以用 | Demo、實際拜訪測試 |
| 下載這個 repo，雙擊 `index.html` | 不能用（顯示提示） | 改程式、看試算 |
| `npm run build` 後的 `dist/liangdeng.html` | 不能用 | 傳單一檔案給別人看 |

不用安裝任何東西就能開。GitHub 上按 **Code → Download ZIP**，解壓縮後雙擊 `index.html` 即可。

## 五個步驟

1. **屋況**：照片交給 AI 辨識壁癌、水漬、老舊設備，對應到修繕項目；金額由估價表計算。
2. **樣貌**：AI 寫改圖指令，貼到影像生成工具產生整理後的樣子，上傳後左右拖曳對照。
3. **資格**：AI 讀建物謄本（主要用途、共有、屋齡），初步判斷能否加入社宅包租代管。
4. **三條路**：規則引擎依縣市稅率算十年收支，**不用 AI**，每條規則附來源。
5. **報告**：AI 依屋主顧慮把數字說成白話，產出可下載的一頁報告和 LINE 訊息。

最重要的原則：**金額一律由程式計算，AI 不自己算數字。** AI 只負責看照片、讀文件、把算好的數字說成白話。

## 專案結構

```
index.html          頁面（標記）
css/style.css       頁面樣式
js/util.js          數字格式、HTML 跳脫
js/rules.js         稅率、補助規則與來源  ← 改稅率從這裡
js/catalog.js       修繕估價表           ← 換工班報價從這裡
js/calc.js          三條路試算、修繕金額（純函式）
js/deed.js          謄本提示詞與資格初篩
js/prompts.js       屋況、改圖、白話說明的提示詞與回覆整理
js/charts.js        長條圖、折線圖
js/report.js        一頁報告、下載檔、LINE 訊息
js/platform.js      AI 與下載的介面層     ← 之後接後端從這裡
js/app.js           畫面、狀態、事件
test/unit/          試算與回覆整理的單元測試
test/e2e/           用瀏覽器跑完五步的端到端測試（AI 用假的回覆）
scripts/build.js    打包成單一 HTML
docs/rules.md       每條規則的來源與待確認事項
```

所有 `js/` 檔案用一般的 `<script>` 依序載入、掛在全域 `LD` 底下，所以不需要打包工具，雙擊就能開。

## 開發

需要 [Node.js](https://nodejs.org/) 20 以上（Mac 可以用 `brew install node`）。

```bash
npm test          # 單元測試，不用安裝套件
npm run build     # 產生 dist/liangdeng.html 與 dist/artifact.html
npm run dev       # 用 http://localhost:8000 開啟（雙擊也可以）

# 端到端測試（第一次要安裝）
npm install
npx playwright install chromium
npm run e2e
```

改了 `js/rules.js` 或 `js/calc.js`，請一起更新 `test/unit/calc.test.js` 的期望值和 `docs/rules.md`，並在 commit 訊息寫清楚依據。

### 更新 Claude 線上原型

`npm run build` 後，請 Claude 用 `dist/artifact.html` 重新發布到原本的線上原型連結（同一個網址會更新）。

## AI 怎麼接

畫面只呼叫 `LD.platform`：

- `platform.json(prompt, { images, signal })`：回傳一個 JSON 值（屋況、改圖指令、謄本）
- `platform.text(prompt, { onText, signal })`：串流文字（白話說明）
- `platform.saveFile(filename, data, asciiName)`：下載報告

目前在 Claude 裡用 Claude 的執行環境；在一般瀏覽器 AI 顯示為不可用。要在一般網站上使用 AI，下一步是做一個後端代理（例如 Cloudflare Workers 或 Vercel Functions）呼叫 Anthropic API，再在 `platform.js` 加一種 `kind`。**API 金鑰只能放後端，不能放在前端程式。**

## 下一步

- [ ] 新竹縣稅率向稅務局確認（見 `docs/rules.md` 的待確認項目）
- [ ] 用 3–5 間真實空屋測試 AI 判斷，記下判斷錯的地方，調整 `js/prompts.js`
- [ ] 業者訪談時要工班報價單，替換 `js/catalog.js` 的 PRO360 行情
- [ ] 後端代理：Anthropic API（屋況、謄本、白話說明）＋影像編輯 API（整理後樣貌直接產生）
- [ ] 租金預測：用內政部不動產租賃實價登錄（data.gov.tw 資料集 25118）取代手動輸入月租
- [ ] 案件保存與業務帳號（目前草稿只存在那台裝置的瀏覽器）
- [ ] 規則庫擴充到六都與新竹市
