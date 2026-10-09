# Builds event/canva/index.html: the event graphic as five fixed-size pages
# (wide, Facebook/link, Instagram post, story, square) for Canva's "import from URL".
# Every element is absolutely positioned real text or an image, so Canva can make
# each piece editable. Run: python3 tools/canva_pages.py
import html

INK, MUTED, BODY, CARD, BG = '#1b1a17', '#4d4a43', '#36332d', '#fcfaf5', '#f4f0e8'
BLUE, RED, RULE = '#385F96', '#A3242A', '#cfc8b8'
URL = 'gregor-posadas.github.io/lagmay-visit-hub/event'
BASE = 'https://gregor-posadas.github.io/lagmay-visit-hub/event/canva/'   # Canva's importer needs absolute image URLs
FONT = "font-family:'Atkinson Hyperlegible',sans-serif;"
LOGO_RATIO = 556 / 216   # phildev-box.png width / height


def rect(x, y, w, h, bg, border=None):
    b = f'border:{border};' if border else ''
    return f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{bg};{b}box-sizing:border-box"></div>'


def text(x, y, w, size, s, weight=400, color=INK, lh=1.25, ls=0, tag='p'):
    return (f'<{tag} style="position:absolute;left:{x}px;top:{y}px;width:{w}px;margin:0;{FONT}font-size:{size}px;'
            f'font-weight:{weight};color:{color};line-height:{lh};letter-spacing:{ls}em">{html.escape(s)}</{tag}>')


def img(x, y, w, h, src, alt):
    return f'<img src="{BASE}{src}" alt="{html.escape(alt)}" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px">'


def flag(x, y, w, h):
    return rect(x, y, w, h / 2, BLUE) + rect(x, y + h / 2, w, h / 2, RED)


def brand(x, y, icon, size, color=INK):
    return img(x, y, icon, icon, 'wave-icon.jpg', 'Wave icon') + text(x + icon + size * 0.5, y + (icon - size * 1.2) / 2, 700, size, 'WHEN THE WATERS RISE', 700, color, 1.2, 0.04)


def cohost(x, y, size, h, gap=16):
    lab_w = round(size * 7.4)
    return (text(x, y + (h - size * 1.2) / 2, lab_w, size, 'Co-hosted with', 700, MUTED, 1.2)
            + img(x + lab_w + gap, y, round(h * LOGO_RATIO), h, 'phildev-box.jpg', 'PhilDev, the Philippine Development Foundation'))


def facts(x, y, widths, h, big, small):
    cells = [('4 to 5 PM', 'Monday, November 9'), ('Banatao Auditorium', 'Sutardja Dai Hall'), ('Free', 'Livestreamed too')]
    out = [rect(x, y, sum(widths), h, CARD, f'4px solid {INK}')]
    cx = x
    for i, (w, (a, b)) in enumerate(zip(widths, cells)):
        if i:
            out.append(rect(cx, y + 4, 2, h - 8, RULE))
        out.append(text(cx + 24, y + h * 0.17, w - 40, big, a, 700, INK, 1.2))
        out.append(text(cx + 24, y + h * 0.17 + big * 1.3, w - 40, small, b, 400, MUTED, 1.2))
        cx += w
    return ''.join(out)


def rsvp(x, y, w, h, qr, big, small, shadow=12):
    pad = (h - qr) / 2
    tx = x + pad + qr + 24
    return (rect(x + shadow, y + shadow, w, h, INK) + rect(x, y, w, h, CARD, f'5px solid {INK}')
            + img(x + pad, y + pad, qr, qr, 'qr-rsvp.jpg', 'QR code for the event page')
            + text(tx, y + h / 2 - big * 1.2 + 2, w - (tx - x) - 20, big, 'RSVP', 700, INK, 1.15)
            + text(tx, y + h / 2 + 8, w - (tx - x) - 20, small, URL, 400, MUTED, 1.2))


TITLE = 'Dr. Mahar Lagmay at UC Berkeley'
BLURB = "The scientist behind Project NOAH's national flood maps, in conversation with UC Berkeley scholars Dr. Lisandro Claudio and Dr. Diana Martinez. Everyone welcome."
MAP_ALT = 'Map of a Metro Manila neighborhood, streets and buildings, shaded blue where a 100-year flood would reach (UP NOAH)'

pages = []

# 1. Wide, 1920 x 1080 (screens, slides, event calendars, Facebook event cover)
W = [img(0, 0, 820, 1080, 'map-wide.jpg', MAP_ALT), flag(0, 1062, 820, 18), rect(820, 0, 8, 1080, INK)]
X = 924
W += [brand(X, 72, 44, 30), cohost(X, 138, 26, 72),
      text(X, 252, 900, 30, 'FREE PUBLIC TALK · MON, NOV 9 · UC BERKELEY', 700, MUTED, 1.2, 0.12),
      text(X, 300, 900, 88, TITLE, 700, INK, 1.04, 0, 'h1'),
      text(X, 510, 880, 34, BLURB, 400, BODY, 1.4),
      facts(X, 712, [270, 330, 250], 108, 30, 24),
      rsvp(X, 858, 740, 160, 124, 38, 26)]
pages.append(('Wide 1920 x 1080 (screens, slides, calendars)', 1920, 1080, W))

# 2. Facebook post and link preview, 1200 x 630
F = [img(0, 0, 470, 630, 'map-fb.jpg', MAP_ALT), flag(0, 618, 470, 12), rect(470, 0, 6, 630, INK)]
X = 532
F += [text(X, 54, 620, 24, 'FREE · MON, NOV 9 · 4 TO 5 PM', 700, MUTED, 1.2, 0.12),
      text(X, 92, 620, 66, 'When the Waters Rise', 700, INK, 1.05, 0, 'h1'),
      text(X, 246, 612, 27, 'Dr. Mahar Lagmay of Project NOAH, with UC Berkeley scholars Dr. Lisandro Claudio and Dr. Diana Martinez, on flooding in the Philippines.', 400, BODY, 1.4),
      rect(X + 8, 410, 470, 56, INK), rect(X, 402, 470, 56, CARD, f'4px solid {INK}'),
      text(X + 18, 416, 440, 22, 'RSVP · Banatao Auditorium, UC Berkeley', 700, INK, 1.2),
      cohost(X, 500, 20, 50, 12)]
pages.append(('Facebook post / link preview 1200 x 630', 1200, 630, F))

# 3. Instagram post, 1080 x 1350 (4:5)
P = [img(0, 0, 1080, 430, 'map-post.jpg', MAP_ALT), flag(0, 430, 1080, 16)]
X = 90
P += [brand(X, 488, 44, 30), cohost(X, 552, 26, 64),
      text(X, 652, 900, 26, 'FREE PUBLIC TALK · MON, NOV 9 · UC BERKELEY', 700, MUTED, 1.2, 0.12),
      text(X, 696, 900, 80, TITLE, 700, INK, 1.04, 0, 'h1'),
      text(X, 880, 900, 30, BLURB, 400, BODY, 1.38),
      facts(X, 1044, [260, 360, 280], 100, 28, 22),
      rsvp(X, 1180, 888, 118, 92, 32, 24, 10)]
pages.append(('Instagram post 1080 x 1350', 1080, 1350, P))

# 4. Story / phone, 1080 x 1920 (Instagram and Facebook stories, WhatsApp status)
S = [rect(0, 0, 1080, 282, INK), img(90, 90, 60, 60, 'wave-icon-dark.jpg', 'Wave icon'),
     text(172, 90, 820, 50, 'WHEN THE WATERS RISE', 700, '#ffffff', 1.2, 0.02),
     text(90, 172, 900, 32, 'Flooding in the Philippines, a public conversation', 400, '#dddddd', 1.3),
     flag(0, 282, 1080, 14),
     rect(110, 382, 900, 500, INK), rect(90, 362, 900, 500, INK), img(96, 368, 888, 488, 'map-story.jpg', MAP_ALT),
     text(90, 930, 900, 32, 'FREE PUBLIC TALK · MON, NOV 9 · 4 TO 5 PM', 700, MUTED, 1.2, 0.12),
     text(90, 978, 900, 92, TITLE, 700, INK, 1.05, 0, 'h1'),
     text(90, 1196, 900, 38, "The scientist behind Project NOAH's national flood maps, in conversation with UC Berkeley scholars Dr. Lisandro Claudio and Dr. Diana Martinez. Banatao Auditorium. Everyone welcome.", 400, BODY, 1.38),
     cohost(90, 1500, 32, 80, 22),
     rsvp(90, 1640, 900, 160, 124, 40, 26, 14)]
pages.append(('Story / phone 1080 x 1920', 1080, 1920, S))

# 5. Square, 1080 x 1080 (Instagram square, LinkedIn, X)
Q = [img(0, 0, 1080, 300, 'map-square.jpg', MAP_ALT), flag(0, 300, 1080, 14)]
X = 90
Q += [brand(X, 344, 40, 28),
      text(X, 412, 900, 24, 'FREE PUBLIC TALK · MON, NOV 9 · UC BERKELEY', 700, MUTED, 1.2, 0.12),
      text(X, 452, 900, 72, TITLE, 700, INK, 1.04, 0, 'h1'),
      text(X, 612, 900, 28, BLURB, 400, BODY, 1.38),
      facts(X, 776, [250, 350, 300], 92, 26, 20),
      rsvp(X, 912, 890, 112, 86, 30, 22, 10),
      cohost(600, 338, 22, 52, 12)]
pages.append(('Square 1080 x 1080', 1080, 1080, Q))

out = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">',
       '<title>When the Waters Rise: graphics for Canva</title><style>',
       "@font-face { font-family: 'Atkinson Hyperlegible'; src: url(../../fonts/AtkinsonHyperlegibleNext-Regular.woff2); }",
       "@font-face { font-family: 'Atkinson Hyperlegible'; font-weight: 700; src: url(../../fonts/AtkinsonHyperlegibleNext-Bold.woff2); }",
       "body { margin: 0; background: #888; font-family: 'Atkinson Hyperlegible', sans-serif; }",
       "section { position: relative; overflow: hidden; margin: 0 0 40px; background: " + BG + "; font-family: 'Atkinson Hyperlegible', sans-serif; }",
       '</style></head><body>']
for label, w, h, els in pages:
    out.append(f'<section data-document-role="page" data-label="{html.escape(label)}" style="width:{w}px;height:{h}px">{"".join(els)}</section>')
out.append('</body></html>')
open('event/canva/index.html', 'w').write('\n'.join(out))
print('wrote event/canva/index.html with', len(pages), 'pages')
