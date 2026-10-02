"""Step 3. Turn exposure_raw.json into event/data/exposure.json (shares only) for the event map."""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
raw = json.load(open(os.path.join(here, 'exposure_raw.json')))
out = {}
for p, r in raw.items():
    if not r.get('noah') or not r['buildings']:
        out[p] = None; continue
    b = r['buildings']; any_ = r['b1'] + r['b2'] + r['b3']
    mapped = (r.get('a1', 0) + r.get('a2', 0) + r.get('a3', 0)) / r['area_km2']
    out[p] = {'any': round(any_ / b, 3), 'deep': round((r['b2'] + r['b3']) / b, 3), 'buildings': b,
              'limited': p not in ('Maguindanao del Norte', 'Maguindanao del Sur') and mapped < 0.01}
doc = {
  'source': 'Flood hazard: UP NOAH flood hazard maps for a 100-year rain. Buildings: Google Open Buildings (CC BY 4.0). Provinces: PSA boundaries.',
  'method': 'Share of a province\'s buildings whose centre lies inside any NOAH 100-year flood hazard zone ("any": low, medium or high; "deep": medium or high, over 0.5 m). Computed October 2026 by tools/noah_exposure. "limited" means the NOAH map covers under 1% of the province, so the share is likely too low. Guimaras, Siquijor, Sulu and Tawi-Tawi have no NOAH 100-year map in this set.',
  'national_any': round(sum(r['b1'] + r['b2'] + r['b3'] for r in raw.values() if r.get('noah')) / sum(r['buildings'] for r in raw.values() if r.get('noah')), 3),
  'values': out}
json.dump(doc, open(os.path.join(here, '..', '..', 'event', 'data', 'exposure.json'), 'w'), indent=0, separators=(',', ':'))
print('provinces with data:', sum(1 for v in out.values() if v), 'limited:', [p for p, v in out.items() if v and v['limited']], 'national', doc['national_any'])
