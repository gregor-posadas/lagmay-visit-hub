// The 2000 x 100 supporter logo strip used in the Canva designs (event/img/logo-strip.png).
//   node tools/logo_strip.js   (with `python3 -m http.server 8765` running in the repo root)
const { chromium } = require('playwright');
const { logoRow, FIT } = require('./logos');
const B = 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport: { width: 2000, height: 100 } })).newPage();
  await p.goto(B + 'version.json');
  await p.setContent(`<!doctype html><html><head><style>* { box-sizing: border-box; margin: 0; }
body { width: 2000px; height: 100px; background: #fff; overflow: hidden; }
.lg { width: 2000px; height: 100px; display: flex; align-items: center; justify-content: space-between; gap: 22px; padding: 0 6px; }
.lg img { display: block; flex: none; } .lg .sep { width: 3px; height: 72px; background: #cfc8b8; flex: none; }
</style></head><body><div class="lg">${logoRow(B)}</div></body></html>`, { waitUntil: 'networkidle' });
  const h = await p.evaluate(`(${FIT})('.lg', 72)`);
  console.log('logo height', h);
  await p.screenshot({ path: 'event/img/logo-strip.png' });
  await b.close();
})();
