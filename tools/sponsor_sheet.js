// Prints the sponsor sheet (event/sponsor-sheet/) to a one-page US Letter PDF.
//   node tools/sponsor_sheet.js      (with `python3 -m http.server 8765` running in the repo root)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport: { width: 900, height: 1200 } })).newPage();
  await p.goto('http://localhost:8765/event/sponsor-sheet/', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: 'event/files/when-the-waters-rise-sponsor-sheet.pdf', format: 'Letter', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await p.emulateMedia({ media: 'print' });
  await (await p.$('.sheet')).screenshot({ path: process.env.PREVIEW || '/tmp/sponsor-sheet.png' });
  console.log('wrote event/files/when-the-waters-rise-sponsor-sheet.pdf');
  await b.close();
})();
