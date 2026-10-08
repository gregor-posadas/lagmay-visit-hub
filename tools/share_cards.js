// Story cards (1080 x 1920) for the event site's Share button, in the style of gregor-posadas.github.io's.
//   node tools/share_cards.js      (with `python3 -m http.server 8765` running in the repo root)
const { chromium } = require('playwright');
const B = 'http://localhost:8765/';
const CO = { en: 'Presented by', fil: 'Hatid ng' };
const cards = {
  'event-en': { lang: 'en', kicker: 'Free public talk · Mon, Nov 9', title: 'When the Waters Rise', sub: 'Flooding in the Philippines, a public conversation',
    body: 'The scientist behind Project NOAH\'s national flood maps, in conversation with UC Berkeley scholars Dr. Lisandro Claudio and Dr. Diana Martinez. Banatao Auditorium. Everyone welcome.', cta: 'RSVP', img: 'event/data/maps/town-metro-manila.webp' },
  'event-fil': { lang: 'fil', kicker: 'Libreng talakayan · Lunes, Nob 9', title: 'Si Dr. Mahar Lagmay sa UC Berkeley', sub: 'Pagbaha sa Pilipinas, isang pampublikong talakayan',
    body: 'Ang siyentipiko sa likod ng mga pambansang flood map ng Project NOAH, kasama ang mga iskolar ng UC Berkeley na sina Dr. Lisandro Claudio at Dr. Diana Martinez. Banatao Auditorium. Bukas sa lahat.', cta: 'Mag-RSVP', img: 'event/data/maps/town-metro-manila.webp', path: 'fil/' },
  'support-en': { lang: 'en', kicker: 'Help bring Dr. Lagmay to Berkeley', title: 'Support the event', sub: 'When the Waters Rise · Nov 9 · UC Berkeley',
    body: 'The talk is free, and his flight, the room and the reception are covered. Help with the speakers\' honoraria and his rides around the Bay Area, or lend a hand on the day.', cta: 'How to help', img: 'event/data/maps/town-cebu.webp', path: 'support/' },
};
const html = c => `<!doctype html><html lang="${c.lang}"><head><meta charset="utf-8"><style>
@font-face { font-family: A; src: url(${B}fonts/AtkinsonHyperlegibleNext-Regular.woff2); }
@font-face { font-family: A; font-weight: 700; src: url(${B}fonts/AtkinsonHyperlegibleNext-Bold.woff2); }
* { box-sizing: border-box; margin: 0; } body { width: 1080px; height: 1920px; background: #f4f0e8; color: #1b1a17; font-family: A, sans-serif; position: relative; overflow: hidden; }
.band { background: #1b1a17; color: #fff; padding: 92px 90px 70px; position: relative; }
.band h1 { font-size: 50px; letter-spacing: 0.02em; text-transform: uppercase; display: flex; align-items: center; gap: 22px; }
.band p { font-size: 32px; color: #ddd; margin-top: 16px; }
.flag { position: absolute; left: 0; right: 0; bottom: -14px; height: 14px; background: linear-gradient(#385F96 50%, #A3242A 50%); }
.pic { margin: 80px auto 0; width: 900px; height: 500px; border: 6px solid #1b1a17; box-shadow: 20px 20px 0 #1b1a17; background: url(${B}${c.img}) center / cover; }
.k { margin: 64px 90px 0; font-size: 32px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #4d4a43; }
.t { margin: 16px 90px 0; font-size: 92px; font-weight: 700; line-height: 1.05; }
.b { margin: 30px 90px 0; font-size: 38px; line-height: 1.38; color: #36332d; }
.u { position: absolute; left: 90px; right: 90px; bottom: 120px; border: 6px solid #1b1a17; box-shadow: 14px 14px 0 #1b1a17; background: #fcfaf5; padding: 30px 34px; display: flex; justify-content: space-between; align-items: center; }
.co { margin: 40px 90px 0; display: flex; align-items: center; gap: 22px; font-size: 32px; font-weight: 700; color: #4d4a43; }
.co img { height: 80px; background: #fff; border: 4px solid #1b1a17; padding: 6px 14px; }
.co { flex-wrap: wrap; gap: 16px 18px; }
.u b { font-size: 40px; } .u span { font-size: 27px; color: #4d4a43; display: block; margin-top: 6px; } .u i { font-style: normal; font-size: 52px; font-weight: 700; }
</style></head><body>
<div class="band"><h1><svg width="56" height="56" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#385F96"/><path d="M6 19c3-3 5 3 10 0s7 3 10 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>When the Waters Rise</h1><p>${c.sub}</p><div class="flag"></div></div>
<div class="pic"></div>
<p class="k">${c.kicker}</p><p class="t">${c.title === 'When the Waters Rise' ? 'Dr. Mahar Lagmay at UC Berkeley' : c.title}</p><p class="b">${c.body}</p>
<div class="co"><span>${CO[c.lang]}</span><img src="${B}event/img/logos/logo-deveng.png" alt=""><img src="${B}event/img/logos/logo-phildev.png" alt=""></div>
<div class="u"><div><b>${c.cta}</b><span>gregor-posadas.github.io/lagmay-visit-hub/event${c.path ? '/' + c.path.replace(/\/$/, '') : ''}</span></div><i>↗</i></div>
</body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
  await p.goto(B + 'version.json');   // same origin as the fonts, so they load
  for (const [name, c] of Object.entries(cards)) {
    await p.setContent(html(c), { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `event/img/share/${name}.jpg`, type: 'jpeg', quality: 86 });
    console.log('wrote', name);
  }
  // The link preview for LinkedIn, Facebook and WhatsApp (1200 x 630, og:image)
  await p.setViewportSize({ width: 1200, height: 630 });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: A; src: url(${B}fonts/AtkinsonHyperlegibleNext-Regular.woff2); }
@font-face { font-family: A; font-weight: 700; src: url(${B}fonts/AtkinsonHyperlegibleNext-Bold.woff2); }
* { box-sizing: border-box; margin: 0; } body { width: 1200px; height: 630px; background: #f4f0e8; color: #1b1a17; font-family: A, sans-serif; display: grid; grid-template-columns: 470px 1fr; overflow: hidden; }
.pic { background: url(${B}event/data/maps/town-metro-manila.webp) 30% center / cover; border-right: 6px solid #1b1a17; position: relative; }
.pic::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 12px; background: linear-gradient(#385F96 50%, #A3242A 50%); }
.txt { padding: 56px 56px 0; } .k { font-size: 24px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #4d4a43; }
h1 { font-size: 66px; line-height: 1.05; margin-top: 14px; } .b { font-size: 27px; line-height: 1.4; margin-top: 22px; color: #36332d; }
.co2 { margin-top: 26px; display: flex; align-items: center; gap: 14px; font-size: 20px; font-weight: 700; color: #4d4a43; } .co2 img { height: 46px; background: #fff; border: 3px solid #1b1a17; padding: 4px 10px; }
.u { margin-top: 26px; font-size: 22px; font-weight: 700; border: 4px solid #1b1a17; box-shadow: 8px 8px 0 #1b1a17; background: #fcfaf5; padding: 12px 18px; display: inline-block; }
</style></head><body><div class="pic"></div><div class="txt"><p class="k">Free · Mon, Nov 9 · UC Berkeley</p><h1>When the Waters Rise</h1>
<p class="b">Dr. Mahar Lagmay of Project NOAH, with UC Berkeley scholars Dr. Lisandro Claudio and Dr. Diana Martinez, on flooding in the Philippines.</p><p class="u">RSVP · Banatao Auditorium</p><p class="co2"><span>Presented by</span><img src="${B}event/img/logos/logo-deveng.png" alt=""><img src="${B}event/img/logos/logo-phildev.png" alt=""></p></div></body></html>`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: 'event/img/share/og.jpg', type: 'jpeg', quality: 86 }); console.log('wrote og');
  await b.close();
})();
