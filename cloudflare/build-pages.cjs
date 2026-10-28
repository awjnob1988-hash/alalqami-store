// Cloudflare Pages publishes this allowlist, never the repository or demo admin.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist-pages');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const api = 'const ALQAMI_API="https://alalqami-store-api.awjnob1988.workers.dev";';
if (source.split(api).length !== 2) throw new Error('Expected one storefront API setting');
if (path.dirname(output) !== root || path.basename(output) !== 'dist-pages') throw new Error('Unexpected output path');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'index.html'), source.replace(api, 'const ALQAMI_API="";')
  .replace('</head>', '<link rel="canonical" href="https://alalqami.com/">\n</head>'));
fs.cpSync(path.join(root, 'assets', 'catalog'), path.join(output, 'assets', 'catalog'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'pages-public-api.mjs'), path.join(output, '_worker.js'));
fs.writeFileSync(path.join(output, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }));
fs.writeFileSync(path.join(output, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n');
fs.writeFileSync(path.join(output, '404.html'), '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مجموعة العلقمي</title><body><h1>الصفحة غير موجودة</h1><a href="/">العودة إلى متجر العلقمي</a></body></html>');
console.log('Cloudflare storefront built in dist-pages');
