# Step 2. Per province: buildings inside the province (PSA admin2, 2025) and how many fall in NOAH's 100-year flood hazard
# zones, by level (NOAH "Var": 1 low <0.5 m, 2 medium 0.5-1.5 m, 3 high >1.5 m). Exact point-in-polygon with shapely
# (even-odd rule over every ring, so holes are respected). Needs adm/phl_admin2.* unzipped from phl_admin_boundaries.shp.zip
# and lon.npy/lat.npy from centroids.py. Resumable: re-run until it prints BATCH DONE 83.
# pip install pyshp pyarrow shapely
import shapefile, numpy as np, zipfile, os, json, re, shutil, time, sys, math
import shapely
from shapely.geometry import shape as to_geom
SRC = os.path.expanduser('~/mnt/Nationwide Update')
lon = np.load('lon.npy').astype(np.float64); lat = np.load('lat.npy').astype(np.float64)
adm = shapefile.Reader('adm/phl_admin2')
recs = adm.records(); names = [r[0] for r in recs]
def ours(n):
    if n.startswith('Metropolitan Manila'): return 'Metro Manila'
    return {'City of Isabela (not a province)': 'Basilan', 'Special Geographic Area': 'Cotabato', 'Cotabato (North Cotabato)': 'Cotabato',
            'Davao de Oro (Compostela Valley)': 'Davao de Oro', 'Samar (Western Samar)': 'Samar'}.get(n, n)
prov_idx = {}
for i, n in enumerate(names): prov_idx.setdefault(ours(n), []).append(i)
norm = lambda s: re.sub(r'[^a-z]', '', s.lower())
noah = {}
for z in sorted(f for f in os.listdir(SRC) if f.startswith('100yr-') and f.endswith('.zip')):
    with zipfile.ZipFile(os.path.join(SRC, z)) as zf:
        for info in zf.infolist():
            if not info.filename.endswith('.zip'): continue
            k = norm(os.path.basename(info.filename)[:-4])
            if k not in noah or info.file_size > noah[k][2]: noah[k] = (z, info.filename, info.file_size)
ALIAS = {'Davao de Oro': 'compostellavalley', 'Maguindanao del Norte': 'maguindanao', 'Maguindanao del Sur': 'maguindanao'}

def ring_km2(shp_shape):
    """Signed-ring area in km2 (outer rings clockwise in shapefiles count positive)."""
    pts = shp_shape.points; parts = list(shp_shape.parts) + [len(pts)]; tot = 0.0
    for a, b in zip(parts[:-1], parts[1:]):
        r = np.asarray(pts[a:b])
        if len(r) < 3: continue
        x, y = r[:, 0], r[:, 1]
        s = np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y) / 2
        tot += -s * 111.32 * math.cos(math.radians(y.mean())) * 110.57
    return tot

out = json.load(open('exposure2.json')) if os.path.exists('exposure2.json') else {}
todo = [p for p in sorted(prov_idx) if p not in out]
if len(sys.argv) > 1:
    todo = todo[:int(sys.argv[1])] if sys.argv[1].isdigit() else [p for p in todo if p in sys.argv[1:]]
for P in todo:
    t = time.time()
    pg = shapely.union_all([to_geom(adm.shape(i).__geo_interface__) for i in prov_idx[P]])
    x0, y0, x1, y1 = pg.bounds
    sel = np.nonzero((lon >= x0) & (lon <= x1) & (lat >= y0) & (lat <= y1))[0]
    shapely.prepare(pg)
    inside = sel[shapely.contains_xy(pg, lon[sel], lat[sel])]
    px, py = lon[inside], lat[inside]
    rec = {'area_km2': float(sum(recs[i][17] for i in prov_idx[P])), 'buildings': int(len(inside))}
    key = ALIAS.get(P, norm(P))
    if key in noah and noah[key][2] > 1000:
        z, inner, size = noah[key]
        shutil.rmtree('tmp', ignore_errors=True); os.makedirs('tmp')
        with zipfile.ZipFile(os.path.join(SRC, z)) as zf: zf.extract(inner, 'tmp')
        with zipfile.ZipFile(os.path.join('tmp', inner)) as zf: zf.extractall('tmp/x')
        shps = [os.path.join(dp, f) for dp, _, fs in os.walk('tmp/x') for f in fs if f.lower().endswith('.shp')]
        def centre_in(path):
            b = shapefile.Reader(path).bbox; cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            return x0 <= cx <= x1 and y0 <= cy <= y1
        shp = ([p for p in shps if centre_in(p)] or shps)[0]   # Cotabato.zip also holds South Cotabato's map
        r = shapefile.Reader(shp); fld = [f[0] for f in r.fields[1:]]; vi = fld.index('Var')
        level = np.zeros(len(px), np.uint8)
        part = 'part-' + norm(P)
        if os.path.exists(part + '.json'):   # resume a big province level by level
            st = json.load(open(part + '.json')); level = np.load(part + '.npy'); rec.update(st['rec'])
        else: st = {'done': [], 'rec': {}}
        ptree = shapely.STRtree(shapely.points(px, py))
        for i, recd in enumerate(r.records()):
            v = int(round(float(recd[vi])))
            if v not in (1, 2, 3) or i in st['done']: continue
            s = r.shape(i)
            rec['a%d' % v] = rec.get('a%d' % v, 0.0) + ring_km2(s)
            pts = np.asarray(s.points, dtype=np.float64); parts = np.asarray(list(s.parts) + [len(pts)])
            ids = np.repeat(np.arange(len(parts) - 1), np.diff(parts))
            ok = np.diff(parts) >= 4
            keep = ok[ids]
            rings = shapely.polygons(shapely.linearrings(pts[keep], indices=np.searchsorted(np.nonzero(ok)[0], ids[keep])))
            gi, pi = ptree.query(rings, predicate='contains')   # rings are prepared as query geometries: fast for big rings
            cnt = np.bincount(pi, minlength=len(px))
            hit = np.nonzero(cnt % 2 == 1)[0]   # even-odd rule: inside an outer ring and not inside one of its holes
            level[hit] = np.maximum(level[hit], v)
            st['done'].append(i); st['rec']['a%d' % v] = rec['a%d' % v]
            np.save(part + '.npy', level); json.dump(st, open(part + '.json', 'w'))
        r.close()
        for v in (1, 2, 3): rec['b%d' % v] = int((level == v).sum())
        rec['noah'] = os.path.basename(inner)
        for f in (part + '.json', part + '.npy'):
            if os.path.exists(f): os.remove(f)
        shutil.rmtree('tmp', ignore_errors=True)
    else:
        rec['noah'] = None
    out[P] = rec
    json.dump(out, open('exposure2.json', 'w'), indent=1)
    print(P, rec, round(time.time() - t), 's', flush=True)
print('BATCH DONE', len(out), flush=True)
