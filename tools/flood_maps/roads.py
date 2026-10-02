# Streets near each town closeup, from the OpenStreetMap extract in the Nationwide Update folder (one pass, about a minute).
# pip install osmium. Writes ~/noah/roads.json for render_closeups.py.
import osmium, json, time, math, os
t = time.time()
PBF = os.path.expanduser('~/mnt/Nationwide Update/philippines-260925.osm.pbf')
TOWNS = {'Metro Manila': (121.100, 14.645), 'Rizal': (121.118, 14.578), 'Misamis Oriental': (124.645, 8.480), 'Lanao del Norte': (124.240, 8.230),
         'Leyte': (124.607, 11.006), 'Samar': (124.886, 11.776), 'Eastern Samar': (125.432, 11.608), 'Cagayan': (121.727, 17.614),
         'Camarines Sur': (123.190, 13.620), 'Albay': (123.740, 13.140), 'Camarines Norte': (122.955, 14.113), 'Catanduanes': (124.232, 13.582),
         'Masbate': (123.620, 12.370), 'Cebu': (123.850, 10.245)}
R = 6.5  # km around each town centre: covers where the closeup can be framed
boxes = {p: (x - R / (111.32 * math.cos(math.radians(y))), y - R / 110.574, x + R / (111.32 * math.cos(math.radians(y))), y + R / 110.574) for p, (x, y) in TOWNS.items()}
out = {p: [] for p in TOWNS}
KEEP = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'motorway_link', 'trunk_link', 'primary_link',
        'secondary_link', 'tertiary_link', 'living_street', 'service', 'pedestrian'}
for o in osmium.FileProcessor(PBF).with_locations().with_filter(osmium.filter.KeyFilter('highway', 'waterway')):
    if not o.is_way(): continue
    hw, ww = o.tags.get('highway'), o.tags.get('waterway')
    if hw not in KEEP and ww not in ('river', 'stream', 'canal', 'drain'): continue
    try: pts = [(nd.lon, nd.lat) for nd in o.nodes]
    except Exception: continue
    if len(pts) < 2: continue
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    for p, b in boxes.items():
        if min(xs) < b[2] and max(xs) > b[0] and min(ys) < b[3] and max(ys) > b[1]:
            out[p].append([hw or ('w:' + ww), [[round(a, 6), round(c, 6)] for a, c in pts]])
json.dump(out, open(os.path.expanduser('~/noah/roads.json'), 'w'))
print({p: len(v) for p, v in out.items()}, round(time.time() - t), 's')
