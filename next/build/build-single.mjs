/* 把 next/ 应用内联成单个 HTML（离线双击可玩） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const distDir = path.resolve(appDir, '..', 'dist');

const INDEX = path.join(appDir, 'index.html');
let html = fs.readFileSync(INDEX, 'utf8');
const inlined = { css: 0, js: 0 };

html = html.replace(/<link\b[^>]*>/gi, (tag) => {
  const m = /rel\s*=\s*"stylesheet"/i.test(tag) && /href\s*=\s*"([^"]+)"/i.exec(tag);
  if (!m) return tag;
  const css = fs.readFileSync(path.join(appDir, m[1]), 'utf8');
  inlined.css++;
  return '<style>\n' + css + '\n</style>';
});

html = html.replace(/<script\b[^>]*src\s*=\s*"([^"]+)"[^>]*>\s*<\/script>/gi, (_tag, src) => {
  const js = fs.readFileSync(path.join(appDir, src), 'utf8');
  inlined.js++;
  return '<script>\n/* ---- ' + src + ' ---- */\n' + js + '\n</script>';
});

const leftovers = html.match(/(?:src|href)\s*=\s*"(?!#|mailto:|data:)[^"]*"/gi) || [];
if (leftovers.length) {
  console.error('构建失败：仍存在外部引用 → ' + leftovers.join(', '));
  process.exit(1);
}
if (/https?:\/\//.test(html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, ''))) {
  console.error('构建失败：HTML 中仍存在网络地址');
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
const outPath = path.join(distDir, '五子棋对围棋.html');
fs.writeFileSync(outPath, html, 'utf8');

const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log('单文件构建完成：' + outPath);
console.log('内联 CSS ' + inlined.css + ' 个、脚本 ' + inlined.js + ' 个，共 ' + kb + ' KB');
