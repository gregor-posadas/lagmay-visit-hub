const { chromium } = require('playwright');
const B = 'http://localhost:8765/';
// A 1920x1080 version of the share card, for slides and screens.
//   node tools/wide_card.js out.png   (with `python3 -m http.server 8765` running in the repo root)
const OUT = process.argv[2] || "wide-1920x1080.png";
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await p.goto(B + 'version.json');
  await p.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@font-face { font-family: A; src: url(${B}fonts/AtkinsonHyperlegibleNext-Regular.woff2); }
@font-face { font-family: A; font-weight: 700; src: url(${B}fonts/AtkinsonHyperlegibleNext-Bold.woff2); }
* { box-sizing: border-box; margin: 0; }
body { width: 1920px; height: 1080px; background: #f4f0e8; color: #1b1a17; font-family: A, sans-serif; display: grid; grid-template-columns: 820px 1fr; overflow: hidden; }
.pic { background: url(${B}event/data/maps/town-metro-manila.webp) 30% center / cover; border-right: 8px solid #1b1a17; position: relative; }
.pic::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 18px; background: linear-gradient(#385F96 50%, #A3242A 50%); }
.txt { padding: 72px 96px 0 96px; position: relative; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.brand { display: flex; align-items: center; gap: 18px; font-size: 30px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.k { margin-top: 34px; font-size: 30px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #4d4a43; }
h1 { font-size: 88px; line-height: 1.04; margin-top: 14px; }
.b { font-size: 34px; line-height: 1.4; margin-top: 24px; color: #36332d; max-width: 900px; }
.facts { display: flex; gap: 0; margin-top: 40px; border: 4px solid #1b1a17; background: #fcfaf5; width: fit-content; }
.facts div { padding: 18px 26px; border-right: 2px solid #cfc8b8; } .facts div:last-child { border-right: 0; }
.facts b { display: block; font-size: 30px; } .facts span { font-size: 24px; color: #4d4a43; }
.foot { position: absolute; left: 96px; right: 96px; bottom: 64px; display: flex; align-items: flex-end; justify-content: space-between; gap: 30px; }
.cta { border: 5px solid #1b1a17; box-shadow: 12px 12px 0 #1b1a17; background: #fcfaf5; padding: 18px 22px; display: flex; align-items: center; gap: 22px; }
.cta img { width: 128px; height: 128px; background: #fff; }
.cta b { font-size: 38px; display: block; } .cta span { font-size: 26px; color: #4d4a43; display: block; margin-top: 6px; white-space: nowrap; }
.co { margin-top: 30px; display: flex; align-items: center; gap: 18px; white-space: nowrap; font-size: 26px; font-weight: 700; color: #4d4a43; }
.co img { height: 72px; background: #fff; border: 4px solid #1b1a17; padding: 6px 14px; }
</style></head><body><div class="pic"></div><div class="txt">
<div class="top"><p class="brand"><svg width="44" height="44" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#385F96"/><path d="M6 19c3-3 5 3 10 0s7 3 10 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>When the Waters Rise</p></div>
<div class="co"><span>Co-hosted with</span><img src="${B}event/img/logos/logo-phildev.png" alt=""></div>
<p class="k">Free public talk · Mon, Nov 9 · UC Berkeley</p>
<h1>Dr. Mahar Lagmay at UC Berkeley</h1>
<p class="b">The scientist behind Project NOAH's national flood maps, in conversation with UC Berkeley scholars Dr. Lisandro Claudio and Dr. Diana Martinez. Everyone welcome.</p>
<div class="facts"><div><b>4 to 5 PM</b><span>Monday, November 9</span></div><div><b>Banatao Auditorium</b><span>Sutardja Dai Hall</span></div><div><b>Free</b><span>Livestreamed too</span></div></div>
<div class="foot"><div class="cta"><img src="${B}event/img/qr-event.svg" alt=""><div><b>RSVP</b><span>gregor-posadas.github.io/lagmay-visit-hub/event</span></div></div></div>
</div></body></html>`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: OUT, type: 'png' });
  await b.close();
})();
