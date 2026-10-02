# Flood hazard maps for the event page's reveal, from UP NOAH 100-year flood hazard maps and building footprints.
#
# Writes (into OUT):
#   ph-hazard-light.png, ph-hazard-dark.png   the whole country, for the overview map (light and dark themes)
#   prov-<slug>.png                            one per storm province, sharper, for the zoom to a province (dark)
#   town-<slug>.png                            one closeup per storm province (a few km across) with every building:
#                                              orange if its centre is inside a flood hazard zone, grey if not (dark)
#   manifest.json                              lon/lat bounds of every image, so the page can place it on its map
#
# Data: NOAH 100-year flood hazard shapefiles ("Var" 1 low <0.5 m, 2 medium 0.5-1.5 m, 3 high >1.5 m), one zip per
# province inside the 100yr-*.zip downloads; building footprints from PHL_buildings.parquet (VIDA's combination of
# Google Open Buildings, Microsoft and OpenStreetMap footprints); land from PSA admin2 boundaries (adm/phl_admin2).
#
# Resumable: every run does as much as fits in BUDGET seconds and saves its progress in WORK. Re-run until it prints ALL DONE.
# pip install pyshp pyarrow shapely rasterio pillow numpy
import os, sys, re, json, time, math, zipfile, shutil
import numpy as np, shapefile, shapely, rasterio.features as rf
from rasterio.enums import MergeAlg
from rasterio.transform import from_bounds
from PIL import Image
import pyarrow.dataset as ds, pyarrow.compute as pc

SRC = os.path.expanduser('~/mnt/Nationwide Update')
OUT = os.path.join(SRC, 'bahawatch-data', 'campuses', '_lagmay_event')
WORK = os.path.expanduser('~/noah/fm')
BUDGET = float(os.environ.get('BUDGET', 150))
T0 = time.time()
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)

# The event map's projection: plate carree over these bounds, longitudes squeezed by cos(mid-latitude).
PH = (116.929, 4.642, 126.605, 20.834)
KX = math.cos(math.radians((PH[1] + PH[3]) / 2))
NAT_W = 2000
NAT_H = round(NAT_W * (PH[3] - PH[1]) / ((PH[2] - PH[0]) * KX))
PROV_PX = 1400
TILE_W, TILE_ASPECT = 1600, 1200 / 760     # tile fills the reveal's map exactly when zoomed in
TILE_KM = 4.5                              # tile width on the ground
SEARCH_KM = 2.5                            # how far the tile centre may move from the town centre to frame the most flooding

TOWNS = {  # province: (town, lon, lat) -- where each storm hit hardest
    'Metro Manila': ('Marikina', 121.100, 14.645), 'Rizal': ('Cainta', 121.118, 14.578),
    'Misamis Oriental': ('Cagayan de Oro', 124.645, 8.480), 'Lanao del Norte': ('Iligan', 124.240, 8.230),
    'Leyte': ('Ormoc', 124.607, 11.006), 'Samar': ('Catbalogan', 124.886, 11.776), 'Eastern Samar': ('Borongan', 125.432, 11.608),
    'Cagayan': ('Tuguegarao', 121.727, 17.614), 'Camarines Sur': ('Naga', 123.190, 13.620), 'Albay': ('Legazpi', 123.740, 13.140),
    'Camarines Norte': ('Daet', 122.955, 14.113), 'Catanduanes': ('Virac', 124.232, 13.582), 'Sorsogon': ('Sorsogon City', 124.005, 12.972),
    'Masbate': ('Masbate City', 123.620, 12.370), 'Cebu': ('Talisay', 123.850, 10.245),
}
# Colours: blues get stronger with depth (Davos-like, colour-blind safe); buildings in a hazard zone orange, others grey.
PAL = {
    'light': {1: '#9EB8DB', 2: '#5A7FB5', 3: '#233F78'},
    'dark': {1: '#2A4F86', 2: '#4677B8', 3: '#8DB2E3'},
}
TOWN_PAL = {0: '#000000', 1: '#2A4F86', 2: '#4677B8', 3: '#8DB2E3', 4: '#262626', 5: '#8A8A8A', 6: '#FF8A3D'}
# town tile values: 0 sea, 4 land, 1-3 hazard on land, 5 building outside hazard, 6 building inside hazard

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
norm = lambda s: re.sub(r'[^a-z]', '', s.lower())
ALIAS = {'Davao de Oro': 'compostellavalley', 'Maguindanao del Norte': 'maguindanao', 'Maguindanao del Sur': 'maguindanao'}

def hex2rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def save_png(level, pal, path, transparent0=True):
    im = Image.fromarray(level.astype(np.uint8), 'P')
    flat = []
    for i in range(256): flat += hex2rgb(pal[i]) if i in pal else (0, 0, 0)
    im.putpalette(flat)
    if transparent0: im.info['transparency'] = 0
    im.save(path, optimize=True, **({'transparency': 0} if transparent0 else {}))

# ---- admin2 provinces (land, and each province's extent) ----
adm = shapefile.Reader(os.path.join(os.path.expanduser('~/noah'), 'adm/phl_admin2'))
recs = adm.records(); names = [r[0] for r in recs]
def ours(n):
    if n.startswith('Metropolitan Manila'): return 'Metro Manila'
    return {'City of Isabela (not a province)': 'Basilan', 'Special Geographic Area': 'Cotabato', 'Cotabato (North Cotabato)': 'Cotabato',
            'Davao de Oro (Compostela Valley)': 'Davao de Oro', 'Samar (Western Samar)': 'Samar'}.get(n, n)
prov_idx = {}
for i, n in enumerate(names): prov_idx.setdefault(ours(n), []).append(i)
adm_bbox = [adm.shape(i).bbox for i in range(len(names))]
def pbounds(P):
    bb = np.array([adm_bbox[i] for i in prov_idx[P]]); return (bb[:, 0].min(), bb[:, 1].min(), bb[:, 2].max(), bb[:, 3].max())

# ---- the NOAH zips ----
noah = {}
for z in sorted(f for f in os.listdir(SRC) if f.startswith('100yr-') and f.endswith('.zip')):
    with zipfile.ZipFile(os.path.join(SRC, z)) as zf:
        for info in zf.infolist():
            if not info.filename.endswith('.zip'): continue
            k = norm(os.path.basename(info.filename)[:-4])
            if k not in noah or info.file_size > noah[k][2]: noah[k] = (z, info.filename, info.file_size)

# ---- grids: (bounds, width, height) ----
def tile_bounds(lon, lat, km_w):
    h_deg = km_w / TILE_ASPECT / 110.574; w_deg = h_deg * TILE_ASPECT / KX
    return (lon - w_deg / 2, lat - h_deg / 2, lon + w_deg / 2, lat + h_deg / 2)
GRIDS = {'nat': (PH, NAT_W, NAT_H)}
for P in TOWNS:
    b = pbounds(P); w, h = (b[2] - b[0]) * KX, b[3] - b[1]; s = PROV_PX / max(w, h)
    GRIDS['prov:' + P] = (b, max(1, round(w * s)), max(1, round(h * s)))
for P, (town, lon, lat) in TOWNS.items():
    tb = tile_bounds(lon, lat, TILE_KM); px = (tb[2] - tb[0]) / TILE_W; py = (tb[3] - tb[1]) / round(TILE_W / TILE_ASPECT)
    mx = SEARCH_KM / (111.32 * math.cos(math.radians(lat))); my = SEARCH_KM / 110.574
    sb = (tb[0] - mx, tb[1] - my, tb[2] + mx, tb[3] + my)
    GRIDS['area:' + P] = (sb, round((sb[2] - sb[0]) / px), round((sb[3] - sb[1]) / py))

def gpath(k): return os.path.join(WORK, slug(k) + '.npy')
def gload(k):
    b, w, h = GRIDS[k]
    return np.load(gpath(k)) if os.path.exists(gpath(k)) else np.zeros((h, w), np.uint8)

prog_f = os.path.join(WORK, 'progress.json')
prog = json.load(open(prog_f)) if os.path.exists(prog_f) else {'done': []}
ONLY = sys.argv[1:]   # optional: just these provinces (for testing)
for P in sorted(prov_idx):
    if P in prog['done'] or (ONLY and P not in ONLY): continue
    if time.time() - T0 > BUDGET: print('PAUSE after', len(prog['done']), 'provinces', flush=True); sys.exit(0)
    t = time.time(); key = ALIAS.get(P, norm(P))
    if key not in noah or noah[key][2] < 1000:
        prog['done'].append(P); json.dump(prog, open(prog_f, 'w')); print(P, 'no NOAH map', flush=True); continue
    x0, y0, x1, y1 = pbounds(P)
    z, inner, size = noah[key]
    tmp = os.path.join(WORK, 'tmp'); shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
    with zipfile.ZipFile(os.path.join(SRC, z)) as zf: zf.extract(inner, tmp)
    with zipfile.ZipFile(os.path.join(tmp, inner)) as zf: zf.extractall(os.path.join(tmp, 'x'))
    shps = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(tmp, 'x')) for f in fs if f.lower().endswith('.shp')]
    def centre_in(path):
        b = shapefile.Reader(path).bbox; cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        return x0 <= cx <= x1 and y0 <= cy <= y1
    shp = ([p for p in shps if centre_in(p)] or shps)[0]
    r = shapefile.Reader(shp); fld = [f[0] for f in r.fields[1:]]; vi = fld.index('Var')
    # Stream the rings in chunks (big provinces have millions), counting ring crossings per pixel; odd count = inside.
    touched = [k for k, (gb, W, H) in GRIDS.items() if k == 'nat' or (gb[0] < x1 and gb[2] > x0 and gb[1] < y1 and gb[3] > y0)]
    cnts, buf, nr = {}, {1: [], 2: [], 3: []}, {1: 0, 2: 0, 3: 0}
    def flush(v):
        if not buf[v]: return
        rings = np.concatenate(buf[v]); bb = shapely.bounds(rings); buf[v] = []; nr[v] = 0
        for k in touched:
            (gx0, gy0, gx1, gy1), W, H = GRIDS[k]
            keep = (bb[:, 0] < gx1) & (bb[:, 2] > gx0) & (bb[:, 1] < gy1) & (bb[:, 3] > gy0)
            if not keep.any(): continue
            a = rf.rasterize(((g, 1) for g in rings[keep]), out_shape=(H, W), transform=from_bounds(gx0, gy0, gx1, gy1, W, H),
                             fill=0, dtype='uint16', merge_alg=MergeAlg.add)
            if (k, v) in cnts: cnts[(k, v)] += a
            else: cnts[(k, v)] = a
    total = 0
    for i, recd in enumerate(r.records()):
        v = int(round(float(recd[vi])))
        if v not in (1, 2, 3): continue
        sh = r.shape(i)
        pts = np.asarray(sh.points, dtype=np.float64); parts = np.asarray(list(sh.parts) + [len(pts)]); del sh
        st, ln = parts[:-1], np.diff(parts); good = np.nonzero(ln >= 4)[0]
        for j in range(0, len(good), 100000):   # one record can hold millions of rings: build them a slice at a time
            sel = good[j:j + 100000]; L = ln[sel]; cs = np.cumsum(L)
            idx = np.arange(cs[-1]) - np.repeat(cs - L, L) + np.repeat(st[sel], L)
            rings = shapely.polygons(shapely.linearrings(pts[idx], indices=np.repeat(np.arange(len(sel)), L)))
            buf[v].append(rings); nr[v] += len(rings); total += len(rings)
            if nr[v] > 150000: flush(v)
        del pts
    r.close()
    for v in (1, 2, 3): flush(v)
    for k in touched:
        if not any((k, v) in cnts for v in (1, 2, 3)): continue
        out = gload(k)
        for v in (1, 2, 3):
            if (k, v) in cnts:
                m = (cnts[(k, v)] & 1).astype(bool); out[m] = np.maximum(out[m], v)
        np.save(gpath(k), out)
    shutil.rmtree(tmp, ignore_errors=True)
    prog['done'].append(P); json.dump(prog, open(prog_f, 'w'))
    print(P, total, 'rings', round(time.time() - t), 's', flush=True)

if ONLY: print('ONLY done'); sys.exit(0)

# ---- pass 2: images ----
man_f = os.path.join(OUT, 'manifest.json')
man = json.load(open(man_f)) if os.path.exists(man_f) else {}
def note(name, b, extra=None):
    man[name] = dict({'bounds': [round(x, 6) for x in b]}, **(extra or {})); json.dump(man, open(man_f, 'w'), indent=1)

if 'ph-hazard-light.png' not in man:
    # At the scale of the whole country the hazard zones are thin river corridors that vanish at one sample per pixel,
    # so pool 2x2 and keep the deepest level: a ~1 km cell is blue if any of its four samples is in a hazard zone.
    a = gload('nat'); H2, W2 = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
    lvl = a[:H2, :W2].reshape(H2 // 2, 2, W2 // 2, 2).max(axis=(1, 3))
    nb = (PH[0], PH[3] - (PH[3] - PH[1]) * H2 / a.shape[0], PH[0] + (PH[2] - PH[0]) * W2 / a.shape[1], PH[3])
    for th in ('light', 'dark'): save_png(lvl, PAL[th], os.path.join(OUT, 'ph-hazard-%s.png' % th))
    note('ph-hazard-light.png', nb); note('ph-hazard-dark.png', nb)
    print('national done', flush=True)
for P in TOWNS:
    n = 'prov-%s.png' % slug(P)
    if n in man: continue
    save_png(gload('prov:' + P), PAL['dark'], os.path.join(OUT, n)); note(n, GRIDS['prov:' + P][0], {'province': P})

bld = ds.dataset(os.path.join(SRC, 'PHL_buildings.parquet'))
for P, (town, lon, lat) in TOWNS.items():
    n = 'town-%s.png' % slug(P)
    if n in man: continue
    if time.time() - T0 > BUDGET: print('PAUSE in towns', flush=True); sys.exit(0)
    t = time.time()
    (sx0, sy0, sx1, sy1), SW, SH = GRIDS['area:' + P]
    tr = from_bounds(sx0, sy0, sx1, sy1, SW, SH)
    haz = gload('area:' + P)
    # land: every admin2 polygon that touches the area
    near = [i for i, b in enumerate(adm_bbox) if b[0] < sx1 and b[2] > sx0 and b[1] < sy1 and b[3] > sy0]
    land = rf.rasterize([(adm.shape(i).__geo_interface__, 1) for i in near], out_shape=(SH, SW), transform=tr, fill=0, dtype='uint8') if near else np.zeros((SH, SW), np.uint8)
    f = (pc.field('bbox', 'xmin') < sx1) & (pc.field('bbox', 'xmax') > sx0) & (pc.field('bbox', 'ymin') < sy1) & (pc.field('bbox', 'ymax') > sy0)
    tb = bld.to_table(columns=['geometry', 'bf_source'], filter=f)
    geoms = shapely.from_wkb(tb.column('geometry').to_numpy(zero_copy_only=False))
    src = np.array(tb.column('bf_source').to_pylist())
    c = shapely.centroid(geoms); cx, cy = shapely.get_x(c), shapely.get_y(c)
    col = np.clip(((cx - sx0) / (sx1 - sx0) * SW).astype(int), 0, SW - 1); row = np.clip(((sy1 - cy) / (sy1 - sy0) * SH).astype(int), 0, SH - 1)
    blev = haz[row, col]
    # frame the tile on the most buildings in medium or deep water, within SEARCH_KM of the town centre
    TW, TH = TILE_W, round(TILE_W / TILE_ASPECT)
    acc = np.zeros((SH + 1, SW + 1), np.int64)
    np.add.at(acc, (row[blev >= 2] + 1, col[blev >= 2] + 1), 1); acc = acc.cumsum(0).cumsum(1)
    best = None
    for r0 in range(0, SH - TH + 1, 25):
        for c0 in range(0, SW - TW + 1, 25):
            k = acc[r0 + TH, c0 + TW] - acc[r0, c0 + TW] - acc[r0 + TH, c0] + acc[r0, c0]
            if best is None or k > best[0]: best = (k, r0, c0)
    _, r0, c0 = best
    img = np.where(land[r0:r0 + TH, c0:c0 + TW] > 0, 4, 0).astype(np.uint8)
    hz = haz[r0:r0 + TH, c0:c0 + TW]; img[hz > 0] = hz[hz > 0]
    tx0 = sx0 + c0 * (sx1 - sx0) / SW; ty1 = sy1 - r0 * (sy1 - sy0) / SH
    tx1 = tx0 + TW * (sx1 - sx0) / SW; ty0 = ty1 - TH * (sy1 - sy0) / SH
    ttr = from_bounds(tx0, ty0, tx1, ty1, TW, TH)
    inw = (cx > tx0) & (cx < tx1) & (cy > ty0) & (cy < ty1)
    wet = inw & (blev >= 1); dry = inw & (blev == 0)
    for mask, val in ((dry, 5), (wet, 6)):
        if mask.any():
            b = rf.rasterize(((g, 1) for g in geoms[mask]), out_shape=(TH, TW), transform=ttr, fill=0, dtype='uint8', all_touched=True)
            img[b > 0] = val
    save_png(img, TOWN_PAL, os.path.join(OUT, n), transparent0=False)
    srcs = {s: int((src[inw] == s).sum()) for s in ('google', 'microsoft', 'osm')}
    note(n, (tx0, ty0, tx1, ty1), {'province': P, 'town': town, 'buildings': int(inw.sum()), 'in_hazard': int(wet.sum()),
                                  'deep': int((inw & (blev >= 2)).sum()), 'sources': srcs})
    print(P, town, int(inw.sum()), 'buildings,', int(wet.sum()), 'in hazard', round(time.time() - t), 's', flush=True)
print('ALL DONE', flush=True)
