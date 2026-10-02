"""Bring BahaWatch's Flood history page onto the event site, as event/src/history.html.

    python3 tools/port_history.py ../bahawatch/template.html     then python3 tools/build_event_pages.py

Takes the photo essay between BahaWatch's <!--HISTORY--> markers, keeps its words, photos, credits and source links
as they are, and swaps BahaWatch's page frame for the event site's. Photos are in event/img/gallery (from BahaWatch's
shared/gallery). Re-run whenever BahaWatch's page changes.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / "bahawatch" / "template.html").read_text(encoding="utf-8")
block = src[src.index("<!--HISTORY-->"):src.index("<!--/HISTORY-->")]
rail = block[block.index('<nav class="ab-rail'):block.index("</nav>", block.index('<nav class="ab-rail')) + 6]
art = block[block.index('<article class="ab-main'):]
art = art[:art.rindex("</article>") + 10]

def fix(h):
    h = h.replace('class="ab-rail hi-rail"', 'class="rd-rail"').replace('<p class="ab-rail-h">', "<p>")
    h = h.replace('class="ab-main gl-main"', 'class="rd-main gl-main"').replace('class="ab-lead"', 'class="rd-lead"')
    h = re.sub(r'href="#history/(\w+)"', lambda m: f'href="#hi-{m.group(1)}-h"', h)
    h = re.sub(r' data-sec="\w+"', "", h)
    h = h.replace('href="#home/contact"', 'href="https://gregor-posadas.github.io/bahawatch/#home/contact"')
    h = h.replace("shared/gallery/", "{R}img/gallery/")
    h = h.replace("Behind every number on this dashboard", "Behind every number")
    return h

page = f"""<!-- out: history/index.html | title: Flood history: When the Waters Rise | lang: en | nav: history | desc: A photo essay on the Philippines' worst floods since 1991, living with water, and the politics of flood control. From BahaWatch. -->
<main id="main" tabindex="-1">
  <div class="wrap">
    <header class="rd-head">
      <p class="ev-kicker">From BahaWatch</p>
      <h1>Flood history</h1>
      <p class="rd-lead">The floods Dr. Lagmay, Dr. Claudio and Dr. Martinez will talk about, and the people who lived through them. This page comes from <a href="https://gregor-posadas.github.io/bahawatch/#history">BahaWatch</a>, a low-cost flood-sensing project by Berkeley graduate students, where it first appeared.</p>
    </header>
    <div class="rd-body">
   {fix(rail)}
   {fix(art)}
    </div>
  </div>
</main>
"""
out = ROOT / "event" / "src" / "history.html"
out.write_text(page, encoding="utf-8")
print("wrote", out.relative_to(ROOT), len(page), "bytes")
