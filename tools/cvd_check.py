# Colour-vision check for the hub and the event page.
# For every pair of colours that has to be told apart, and every colour against the background it sits on,
# simulates protan, deutan and tritan vision (Machado et al. 2009, full severity, via colorspacious) and reports
# the CAM02-UCS distance (about 10+ reads as clearly different, under about 6 is risky) and, for marks on a
# background, the WCAG contrast ratio (3:1 is the floor for graphics).
# pip install colorspacious
import itertools, sys
from colorspacious import cspace_convert

def rgb(h): h = h.lstrip('#'); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
def sim(h, kind):
    if kind == 'normal': return rgb(h)
    out = cspace_convert(rgb(h), {'name': 'sRGB1+CVD', 'cvd_type': kind, 'severity': 100}, 'sRGB1')
    return [min(1, max(0, v)) for v in out]
def dist(a, b):
    A = cspace_convert(a, 'sRGB1', 'CAM02-UCS'); B = cspace_convert(b, 'sRGB1', 'CAM02-UCS')
    return sum((x - y) ** 2 for x, y in zip(A, B)) ** 0.5
def lum(c):
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, c); return 0.2126 * r + 0.7152 * g + 0.0722 * b
def contrast(a, b): la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)
KINDS = ['normal', 'protanomaly', 'deuteranomaly', 'tritanomaly']

SETS = {
  'hub statuses, light': ('#f6f2e9', {'in progress': '#385F96', 'done': '#1b1a17', 'overdue': '#B8481A', 'waiting/our move': '#E7B800'}),
  'hub statuses, dark': ('#000000', {'in progress': '#9EB8DB', 'done': '#ffffff', 'overdue': '#ff7a2e', 'waiting/our move': '#ffe27a'}),
  'team colours, light': ('#f6f2e9', {'blue': '#385F96', 'orange': '#CF5921', 'maroon': '#800000', 'gold': '#E7B800'}),
  'event map, light': ('#e2dac8', {'hazard <0.5 m': '#9EB8DB', 'hazard 0.5-1.5 m': '#5A7FB5', 'hazard >1.5 m': '#233F78', 'line to province': '#CF5921'}),
  'event map, dark': ('#262626', {'hazard <0.5 m': '#2A4F86', 'hazard 0.5-1.5 m': '#4677B8', 'hazard >1.5 m': '#8DB2E3', 'line to province': '#e8743f', 'focus outline': '#E7B800'}),
  'town closeup (dark)': ('#262626', {'hazard <0.5 m': '#2A4F86', 'hazard 0.5-1.5 m': '#4677B8', 'hazard >1.5 m': '#8DB2E3', 'building outside': '#8A8A8A', 'building in flood zone': '#FF8A3D'}),
}
# Waiting/our move is gold on paper (under 3:1), so its icon carries an ink outline in light mode; the team colours sit
# in filled circles with a white initial and, in dark mode, a white ring.
# Pairs that never sit side by side don't need to differ (a building outside a hazard zone never sits on hazard colour).
SKIP = {('building outside', 'hazard <0.5 m'), ('building outside', 'hazard 0.5-1.5 m'), ('building outside', 'hazard >1.5 m')}
worst = []
for name, (bg, cols) in SETS.items():
    print('\n' + name)
    for (la, a), (lb, b) in itertools.combinations(cols.items(), 2):
        if (la, lb) in SKIP or (lb, la) in SKIP: continue
        d = {k: dist(sim(a, k), sim(b, k)) for k in KINDS}
        m = min(d.values()); flag = '  <-- low' if m < 8 else ''
        print('  %-22s vs %-22s ' % (la, lb) + ' '.join('%s %5.1f' % (k[:4], v) for k, v in d.items()) + flag)
        worst.append((m, name, la, lb))
    for la, a in cols.items():
        c = contrast(rgb(a), rgb(bg)); print('  %-22s on background  contrast %.2f%s' % (la, c, '  <-- under 3:1' if c < 3 else ''))
worst.sort(); print('\nclosest pairs:'); [print('  %.1f  %s: %s vs %s' % w) for w in worst[:8]]
