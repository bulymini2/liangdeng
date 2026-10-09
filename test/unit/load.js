// 在 Node 裡載入 js/ 下的檔案（跟瀏覽器一樣依序執行），回傳全域 LD。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 和 index.html 的順序相同；app.js 會操作畫面，不在 Node 裡載入。
const FILES = ['util.js', 'rules.js', 'catalog.js', 'calc.js', 'deed.js', 'prompts.js', 'charts.js', 'report.js', 'pipeline.js', 'store.js', 'demo.js', 'platform.js', 'motion.js', 'intro.js', 'tour.js'];

export function loadLD() {
  const ctx = vm.createContext({ console });
  for (const f of FILES) {
    vm.runInContext(readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8'), ctx, { filename: 'js/' + f });
  }
  return ctx.LD;
}

/** 示範案例的試算條件（跟 js/demo.js 的 BASE_CALC 一致） */
export const DEMO = { city: 'hsinchu', houseValue: 450000, landValue: 600000, count: 1, inherited: false, bracket: 0.2, rent: 18000, mode: '包租', vacancy: 1, agentMonths: 0.25, maint: 12000, years: 10 };
