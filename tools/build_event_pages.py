"""Build the event site's pages from their bodies in event/src/, wrapping each in the shared head, header and footer.

    python3 tools/build_event_pages.py      (then scripts/stamp-version.sh before publishing)

event/src/<name>.html holds the page's <main> contents and, on its first line, an HTML comment with settings:
    <!-- out: history/index.html | title: Flood history | lang: en | nav: history | desc: ... | scripts: ... -->
"""
import pathlib, re, html

ROOT = pathlib.Path(__file__).resolve().parent.parent
EV = ROOT / "event"

ICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' "
        "fill='%23385F96'/%3E%3Cpath d='M6 19c3-3 5 3 10 0s7 3 10 0' stroke='%23fff' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")
GLOBE = ('<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2">'
         '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c3 3 3 16 0 19M12 2.5c-3 3-3 16 0 19"/></g></svg>')
MARK = ('<svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="15" fill="#385F96"/>'
        '<path d="M6 19c3-3 5 3 10 0s7 3 10 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>')
NAV = {
    "en": [("event", "", "Event"), ("about", "about/", "About"), ("history", "history/", "Flood history"), ("faq", "faq/", "Questions"), ("directions", "directions/", "Directions"),
           ("support", "support/", "Support us"), ("access", "accessibility/", "Accessibility")],
    "fil": [("event", "fil/", "Pagtitipon"), ("about", "fil/about/", "Tungkol"), ("history", "history/", "Kasaysayan"), ("faq", "faq/", "Mga tanong"), ("directions", "fil/directions/", "Direksyon"),
            ("support", "support/", "Suportahan"), ("access", "accessibility/", "Accessibility")],
}
# The language link goes to the same page in the other language where there is one, else to the other language's event page.
OTHER = {"": "fil/", "about/": "fil/about/", "directions/": "fil/directions/", "fil/": "", "fil/about/": "about/", "fil/directions/": "directions/"}
SITE = "https://gregor-posadas.github.io/lagmay-visit-hub/event/"
WORDS = {
    "en": dict(skip="Skip to content", sub="Flooding in the Philippines, a public conversation", sound="Sound on", theme="Dark mode", share="Share",
               foot='Organized by Gregor Posadas, Noam Anglo and Veronica Sison at UC Berkeley, with Rapha Felipe at Stanford. Questions: see <a href="{R}faq/">Questions</a>, ask any of us on the day, or reply to your RSVP email.'),
    "fil": dict(skip="Lumaktaw sa nilalaman", sub="Baha sa Pilipinas, isang pampublikong talakayan", sound="May tunog", theme="Madilim", share="Ibahagi",
                foot='Inorganisa nina Gregor Posadas, Noam Anglo at Veronica Sison sa UC Berkeley, kasama si Rapha Felipe sa Stanford. May tanong? Tingnan ang <a href="{R}faq/">Mga tanong</a>, lapitan kami sa mismong araw, o sumagot sa email ng iyong RSVP.'),
}


def build(src):
    text = src.read_text(encoding="utf-8")
    m = re.match(r"\s*<!--(.*?)-->\s*\n", text, re.S)
    meta = {k.strip(): v.strip() for k, v in (p.split(":", 1) for p in m.group(1).split("|"))}
    body = text[m.end():]
    out = EV / meta["out"]
    depth = meta["out"].count("/")
    R = "../" * depth                      # path back to event/
    A = "../" * (depth + 1)                # path back to the site root (fonts, assets)
    lang = meta.get("lang", "en")
    w = WORDS[lang]
    links = []
    here = meta["out"][: -len("index.html")]
    # The other language is a small switch among the header tools, not a tab, so nobody lands on it by accident.
    other = R + OTHER.get(here, "fil/" if lang == "en" else "")
    langsw = (f'<a class="tool tool--lang" href="{other or "./"}" lang="fil" hreflang="fil" title="{"Basahin ang pahinang ito sa Filipino" if here in OTHER else "Basahin ang pahina ng pagtitipon sa Filipino"}">{GLOBE}Filipino</a>' if lang == "en"
              else f'<a class="tool tool--lang" href="{other or "./"}" lang="en" hreflang="en" title="{"Read this page in English" if here in OTHER else "Read the event page in English"}">{GLOBE}English</a>')
    for key, href, label in NAV[lang]:
        cur = ' aria-current="page"' if key == meta.get("nav") else ""
        lng = ' lang="fil" hreflang="fil"' if key == "fil" else (' lang="en" hreflang="en"' if key == "en" else "")
        links.append(f'      <a href="{(R + href) or "./"}"{cur}{lng}>{label}</a>')
    nav = "\n".join(links)
    nav = nav.replace(f'href="{R}"', f'href="{R or "./"}"')
    scripts = "".join(f'<script src="{R}{s.strip()}?v=0"></script>\n' for s in meta.get("scripts", "").split(",") if s.strip())
    present = '<script>try { var t = localStorage.getItem("lv.theme"); if (t) document.documentElement.setAttribute("data-theme", t); if (/[?&#]present/.test(location.href)) document.documentElement.setAttribute("data-theme", /[?&#]light/.test(location.href) ? "light" : "dark"); } catch (e) {}</script>'
    page = f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(meta["title"])}</title>
<meta name="description" content="{html.escape(meta.get("desc", ""))}">
<meta name="color-scheme" content="light dark">
<link rel="preload" href="{A}fonts/AtkinsonHyperlegibleNext-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{A}fonts/AtkinsonHyperlegibleNext-Bold.woff2" as="font" type="font/woff2" crossorigin>
<link rel="icon" href="{ICON}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="When the Waters Rise">
<meta property="og:title" content="{html.escape(meta["title"])}">
<meta property="og:description" content="{html.escape(meta.get("desc", ""))}">
<meta property="og:url" content="{SITE + here}">
<meta property="og:image" content="{SITE}img/share/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" hreflang="en" href="https://gregor-posadas.github.io/lagmay-visit-hub/event/">
<link rel="alternate" hreflang="fil" href="https://gregor-posadas.github.io/lagmay-visit-hub/event/fil/">
<link rel="stylesheet" href="{A}assets/styles.css?v=0">
<link rel="stylesheet" href="{R}site.css?v=0">
<link rel="stylesheet" href="{R}event.css?v=0">
{present}
</head>
<body class="ev-page ev-page--{meta.get("nav", "x")}">
<!-- Built by tools/build_event_pages.py from event/src/{src.name}. Edit that file, not this one. -->
<a class="skip" href="#main">{w["skip"]}</a>
<header class="band" role="banner">
  <div class="band__inner">
    <a class="brand" href="{R or "./"}{"fil/" if lang == "fil" else ""}">
      <span class="brand__name">{MARK}When the Waters Rise</span>
      <span class="brand__sub">{w["sub"]}</span>
    </a>
    <nav class="nav" aria-label="{"Mga pahina" if lang == "fil" else "Pages"}">
{nav}
    </nav>
    <div class="band__tools">
      <button type="button" class="tool" id="sound-toggle" aria-pressed="true"><span class="tool__state">{w["sound"]}</span></button>
      <button type="button" class="tool theme-toggle" id="theme-toggle">{w["theme"]}</button>
      {langsw}
      <button type="button" class="tool" id="share-btn" aria-haspopup="dialog" data-url="{SITE + here}" data-title="{html.escape(meta["title"])}" data-card="{R}img/share/{meta.get("card", "event-fil" if lang == "fil" else "event-en")}.jpg">{w["share"]}</button>
    </div>
  </div>
</header>
{body.rstrip()}
<footer class="foot"><p>{w["foot"].replace("{R}", R)}</p></footer>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<script src="{R}site.js?v=0"></script>
{scripts}</body>
</html>
"""
    page = page.replace("{R}", R).replace("{A}", A)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    print("wrote", out.relative_to(ROOT))


for src in sorted((EV / "src").glob("*.html")):
    build(src)
