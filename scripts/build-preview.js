// 打包預覽頁：把 preview/dashboard.html 用到的 ../js/ 內嵌，產生 dist/preview-dashboard.html（給 Claude 線上預覽發布用）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'preview/dashboard.html'), 'utf8');
html = html.replace(/<script src="\.\.\/(js\/[^"]+)"><\/script>/g, (_, p) => `<script>\n${readFileSync(join(root, p), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`);
const pick = name => html.match(new RegExp(`<!-- build:${name} -->([\\s\\S]*?)<!-- /build:${name} -->`))[1].trim();
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/preview-dashboard.html'), pick('head') + '\n' + pick('body') + '\n');
console.log('已產生 dist/preview-dashboard.html');
