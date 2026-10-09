// 打包：把 index.html 用到的 css/ 與 js/ 內嵌成單一檔案。不需要安裝任何套件。
//   dist/liangdeng.html  完整網頁，雙擊就能開，也能直接傳給別人
//   dist/artifact.html   給 Claude 線上原型發布用（沒有 <html>/<head>/<body>，由 Claude 外框包起來）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
let html = read('index.html');

// <link rel="stylesheet" href="css/xxx.css"> → <style>
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, p) => `<style>\n${read(p)}</style>`);
// <script src="js/xxx.js"></script> → <script>；內容裡的 </script 要跳脫
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, p) => `<script>\n${read(p).replace(/<\/script/gi, '<\\/script')}</script>`);

const left = html.match(/<(link|script) [^>]*(href|src)="(?!https:|data:)[^"]+"/);
if (left) throw new Error('還有沒內嵌的本地檔案：' + left[0]);

const pick = name => {
  const m = html.match(new RegExp(`<!-- build:${name} -->([\\s\\S]*?)<!-- /build:${name} -->`));
  if (!m) throw new Error(`index.html 少了 build:${name} 標記`);
  return m[1].trim();
};

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/liangdeng.html'), html);
writeFileSync(join(root, 'dist/artifact.html'), pick('head') + '\n' + pick('body') + '\n');
console.log('已產生 dist/liangdeng.html 與 dist/artifact.html');
