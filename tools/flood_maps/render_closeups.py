# Second pass for the reveal's zoomed views (run after render_maps.py and roads.py, from the same folder).
#
# Province maps: the NOAH levels from render_maps.py, upsampled with smoothing so the 10 m cells of the flood model
#   don't show as stair steps when zoomed in, then antialiased. Light theme colours (darker blue = deeper).
# Town closeups (about 3 km across): drawn like BahaWatch's dashboard. Paper-coloured land, the three depth blues,
#   OpenStreetMap streets in white, and every building footprint in a light warm grey with a thin dark outline, so a
#   building reads as a building whether it sits on dry land or in deep water. Drawn at twice the size and scaled down,
#   so edges are smooth. Saved as WebP.
#
# Reads ~/noah/fm/*.npy (render_maps.py), ~/noah/roads.json (roads.py), the PSA boundaries and PHL_buildings.parquet.
# Writes prov2-<slug>.png, town2-<slug>.webp and manifest2.json into OUT. Resumable; re-run until ALL DONE.
import os, sys, re, json, time, math
import numpy as np, shapefile, shapely, rasterio.features as rf
from rasterio.transform import from_bounds
from PIL import Image, ImageDraw, ImageFilter
import pyarrow.dataset as ds, pyarrow.compute as pc

SRC = os.path.expanduser('~/mnt/Nationwide Update')
OUT = os.path.join(SRC, 'bahawatch-data', 'campuses', '_lagmay_event')
WORK = os.path.expanduser('~/noah/fm')
BUDGET = float(os.environ.get('BUDGET', 150)); T0 = time.time()

PH = (116.929, 4.642, 126.605, 20.834)
KX = math.cos(math.radians((PH[1] + PH[3]) / 2))
PROV_PX = 1400
OLD_TILE_W, ASPECT, OLD_KM, SEARCH_KM = 1600, 1200 / 760, 4.5, 2.5
TILE_KM, TW = 3.0, 2400                       # the new closeup: 3 km across, about 1.25 m a pixel
TH = round(TW / ASPECT); SS = 2                # drawn at 2x, then scaled down
TOWNS = {
    'Metro Manila': ('Marikina', 121.100, 14.645), 'Rizal': ('Cainta', 121.118, 14.578),
    'Misamis Oriental': ('Cagayan de Oro', 124.645, 8.480), 'Lanao del Norte': ('Iligan', 124.240, 8.230),
    'Leyte': ('Ormoc', 124.607, 11.006), 'Samar': ('Catbalogan', 124.886, 11.776), 'Eastern Samar': ('Borongan', 125.432, 11.608),
    'Cagayan': ('Tuguegarao', 121.727, 17.614), 'Camarines Sur': ('Naga', 123.190, 13.620), 'Albay': ('Legazpi', 123.740, 13.140),
    'Camarines Norte': ('Daet', 122.955, 14.113), 'Catanduanes': ('Virac', 124.232, 13.582), 'Sorsogon': ('Sorsogon City', 124.005, 12.972),
    'Masbate': ('Masbate City', 123.620, 12.370), 'Cebu': ('Talisay', 123.850, 10.245),
}
# THEME=dark (an environment variable) draws the dark set for the presentation: brighter blue = deeper, dark buildings
# with a light outline. The default light set is for ?present&light. Files get a -dark suffix.
THEME = os.environ.get('THEME', 'light'); SFX = '-dark' if THEME == 'dark' else ''
if THEME == 'dark':
    HZ = {1: (0x2A, 0x4F, 0x86), 2: (0x46, 0x77, 0xB8), 3: (0x8D, 0xB2, 0xE3)}
    SEA, LAND = (0x00, 0x00, 0x00), (0x26, 0x26, 0x26)
    BLD, BLD_EDGE = (0x3A, 0x3A, 0x3A), (0xE6, 0xDF, 0xD2)
    ROAD, ROAD_EDGE = (0x70, 0x70, 0x70), (0x14, 0x14, 0x14)
else:   # light: darker = deeper
    HZ = {1: (0x9E, 0xB8, 0xDB), 2: (0x5A, 0x7F, 0xB5), 3: (0x23, 0x3F, 0x78)}
    SEA, LAND = (0xD6, 0xDD, 0xDE), (0xF6, 0xF2, 0xE9)
    BLD, BLD_EDGE = (0xD8, 0xD0, 0xC0), (0x2A, 0x26, 0x22)
    ROAD, ROAD_EDGE = (0xFF, 0xFF, 0xFF), (0xB9, 0xB0, 0x9F)
ROAD_M = {'motorway': 14, 'trunk': 12, 'primary': 11, 'secondary': 10, 'tertiary': 8, 'unclassified': 6, 'residential': 6,
          'living_street': 5, 'pedestrian': 5, 'service': 4}   # metres wide, roughly

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
adm = shapefile.Reader(os.path.expanduser('~/noah/adm/phl_admin2'))
names = [r[0] for r in adm.records()]
def ours(n):
    if n.startswith('Metropolitan Manila'): return 'Metro Manila'
    return {'City of Isabela (not a province)': 'Basilan', 'Special Geographic Area': 'Cotabato', 'Cotabato (North Cotabato)': 'Cotabato',
            'Davao de Oro (Compostela Valley)': 'Davao de Oro', 'Samar (Western Samar)': 'Samar'}.get(n, n)
prov_idx = {}
for i, n in enumerate(names): prov_idx.setdefault(ours(n), []).append(i)
adm_bbox = [adm.shape(i).bbox for i in range(len(names))]
def pbounds(P):
    bb = np.array([adm_bbox[i] for i in prov_idx[P]]); return (bb[:, 0].min(), bb[:, 1].min(), bb[:, 2].max(), bb[:, 3].max())

def smooth_levels(lv, scale, sigma):
    """Upsample a 0-3 level grid by `scale`, smoothing each depth band's edge: bilinear, blur, threshold at half."""
    H, W = lv.shape; out = np.zeros((H * scale, W * scale), np.uint8)
    for v in (1, 2, 3):
        m = Image.fromarray(((lv >= v) * 255).astype(np.uint8)).resize((W * scale, H * scale), Image.BILINEAR)
        if sigma: m = m.filter(ImageFilter.GaussianBlur(sigma))
        out[np.asarray(m) >= 128] = v
    return out

man_f = os.path.join(OUT, 'manifest2%s.json' % SFX)
man = json.load(open(man_f)) if os.path.exists(man_f) else {}
def note(name, b, extra=None):
    man[name] = dict({'bounds': [round(float(x), 6) for x in b]}, **(extra or {})); json.dump(man, open(man_f, 'w'), indent=1)

# ---- province maps, smoothed and antialiased ----
for P in TOWNS:
    n = 'prov2-%s%s.png' % (slug(P), SFX)
    if n in man: continue
    if time.time() - T0 > BUDGET: print('PAUSE', flush=True); sys.exit(0)
    lv = np.load(os.path.join(WORK, 'prov-' + slug(P) + '.npy'))
    up = smooth_levels(lv, 3, 1.6)
    rgba = np.zeros(up.shape + (4,), np.uint8)
    for v, c in HZ.items(): rgba[up == v] = c + (255,)
    im = Image.fromarray(rgba, 'RGBA').resize((lv.shape[1] * 2, lv.shape[0] * 2), Image.LANCZOS)
    im.quantize(48, method=Image.FASTOCTREE).save(os.path.join(OUT, n), optimize=True)
    note(n, pbounds(P), {'province': P})
    print('prov', P, flush=True)

# ---- town closeups ----
roads = json.load(open(os.path.expanduser('~/noah/roads.json')))
bld = ds.dataset(os.path.join(SRC, 'PHL_buildings.parquet'))
def old_area(lon, lat):
    h = OLD_KM / ASPECT / 110.574; w = h * ASPECT / KX
    tb = (lon - w / 2, lat - h / 2, lon + w / 2, lat + h / 2); px = (tb[2] - tb[0]) / OLD_TILE_W; py = (tb[3] - tb[1]) / round(OLD_TILE_W / ASPECT)
    mx = SEARCH_KM / (111.32 * math.cos(math.radians(lat))); my = SEARCH_KM / 110.574
    sb = (tb[0] - mx, tb[1] - my, tb[2] + mx, tb[3] + my)
    return sb, round((sb[2] - sb[0]) / px), round((sb[3] - sb[1]) / py)
for P, (town, lon, lat) in TOWNS.items():
    n = 'town2-%s%s.webp' % (slug(P), SFX)
    if n in man: continue
    if time.time() - T0 > BUDGET: print('PAUSE', flush=True); sys.exit(0)
    t = time.time()
    (sx0, sy0, sx1, sy1), SW, SH = old_area(lon, lat)
    ap = os.path.join(WORK, 'area-' + slug(P) + '.npy')
    haz = np.load(ap) if os.path.exists(ap) else np.zeros((1, 1), np.uint8)
    if (haz > 0).sum() == 0: print(P, 'no hazard here, skipped', flush=True); man[n] = {'skip': True}; json.dump(man, open(man_f, 'w'), indent=1); continue
    f = (pc.field('bbox', 'xmin') < sx1) & (pc.field('bbox', 'xmax') > sx0) & (pc.field('bbox', 'ymin') < sy1) & (pc.field('bbox', 'ymax') > sy0)
    tb = bld.to_table(columns=['geometry'], filter=f)
    geoms = shapely.from_wkb(tb.column('geometry').to_numpy(zero_copy_only=False))
    c = shapely.centroid(geoms); cx, cy = shapely.get_x(c), shapely.get_y(c)
    col = np.clip(((cx - sx0) / (sx1 - sx0) * SW).astype(int), 0, SW - 1); row = np.clip(((sy1 - cy) / (sy1 - sy0) * SH).astype(int), 0, SH - 1)
    blev = haz[row, col]
    # the 3 km window, in the area grid's pixels, framed on the most buildings in water over 0.5 m deep
    h_deg = TILE_KM / ASPECT / 110.574; w_deg = h_deg * ASPECT / KX
    aw, ah = round(w_deg / ((sx1 - sx0) / SW)), round(h_deg / ((sy1 - sy0) / SH))
    acc = np.zeros((SH + 1, SW + 1), np.int64); np.add.at(acc, (row[blev >= 2] + 1, col[blev >= 2] + 1), 1); acc = acc.cumsum(0).cumsum(1)
    best = None
    for r0 in range(0, SH - ah + 1, 20):
        for c0 in range(0, SW - aw + 1, 20):
            k = acc[r0 + ah, c0 + aw] - acc[r0, c0 + aw] - acc[r0 + ah, c0] + acc[r0, c0]
            if best is None or k > best[0]: best = (k, r0, c0)
    _, r0, c0 = best
    tx0 = sx0 + c0 * (sx1 - sx0) / SW; ty1 = sy1 - r0 * (sy1 - sy0) / SH
    tx1 = tx0 + aw * (sx1 - sx0) / SW; ty0 = ty1 - ah * (sy1 - sy0) / SH
    W2, H2 = TW * SS, TH * SS
    tr = from_bounds(tx0, ty0, tx1, ty1, W2, H2)
    # land, then the smoothed hazard bands
    near = [i for i, b in enumerate(adm_bbox) if b[0] < tx1 and b[2] > tx0 and b[1] < ty1 and b[3] > ty0]
    land = rf.rasterize([(adm.shape(i).__geo_interface__, 1) for i in near], out_shape=(H2, W2), transform=tr, fill=0, dtype='uint8') if near else np.zeros((H2, W2), np.uint8)
    sub = haz[r0:r0 + ah, c0:c0 + aw]
    hz = np.asarray(Image.fromarray(smooth_levels(sub, 4, 6.0)).resize((W2, H2), Image.NEAREST))
    img = np.empty((H2, W2, 3), np.uint8); img[:] = SEA; img[land > 0] = LAND
    for v in (1, 2, 3): img[hz == v] = HZ[v]
    im = Image.fromarray(img, 'RGB'); d = ImageDraw.Draw(im)
    def px(lo, la): return ((lo - tx0) / (tx1 - tx0) * W2, (ty1 - la) / (ty1 - ty0) * H2)
    mpp = (TILE_KM * 1000) / W2                     # metres per drawn pixel
    ways = [w for w in roads.get(P, []) if not w[0].startswith('w:')]
    ways.sort(key=lambda w: ROAD_M.get(w[0], 4))
    for edge in (True, False):                      # all casings first, so junctions join cleanly
        for kind, pts in ways:
            wpx = max(2, ROAD_M.get(kind, 4) / mpp)
            q = [px(a, b) for a, b in pts]
            if all(x < -50 or x > W2 + 50 for x, _ in q) or all(y < -50 or y > H2 + 50 for _, y in q): continue
            d.line(q, fill=ROAD_EDGE if edge else ROAD, width=int(round(wpx + (3 if edge else 0))), joint='curve')
    inw = (cx > tx0) & (cx < tx1) & (cy > ty0) & (cy < ty1)
    for g in geoms[inw]:
        for poly in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
            q = [px(a, b) for a, b in poly.exterior.coords]
            if len(q) >= 3: d.polygon(q, fill=BLD, outline=BLD_EDGE, width=2)
    im = im.resize((TW, TH), Image.LANCZOS)
    im.save(os.path.join(OUT, n), 'WEBP', quality=86, method=5)
    note(n, (tx0, ty0, tx1, ty1), {'province': P, 'town': town, 'buildings': int(inw.sum()), 'in_hazard': int((inw & (blev >= 1)).sum())})
    print(P, town, int(inw.sum()), 'buildings', round(time.time() - t), 's', flush=True)
print('ALL DONE', flush=True)
