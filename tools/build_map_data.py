"""Build the event map's boundary files from public sources.

Philippines: provinces from faeldon/philippines-json-maps (MIT; PSA PSGC boundaries as of 31 Dec 2023),
medium resolution, one file per region. The four NCR districts become "Metro Manila", the City of Isabela joins
Basilan and BARMM's Special Geographic Area joins Cotabato, so every shape matches one RSVP dropdown choice.
Bay Area: the nine counties from codeforgermany/click_that_hood (california-counties.geojson).

Usage: python3 tools/build_map_data.py <folder with med-*.json and ca.json>
Writes event/data/ph-provinces.json, event/data/bay-counties.json and event/data/provinces.txt (the dropdown list).
"""
import glob, json, os, sys
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/geo"
OUT = os.path.join(os.path.dirname(__file__), "..", "event", "data")
BAY = ["Alameda", "Contra Costa", "Marin", "Napa", "San Francisco", "San Mateo", "Santa Clara", "Solano", "Sonoma"]
MERGE = {"City of Isabela (Not a Province)": "Basilan", "None": "Cotabato"}


def ph_name(props):
    n = str(props.get("adm2_en"))
    if n.startswith("NCR"):
        return "Metro Manila"
    return MERGE.get(n, n)


def compact(geom, tol, nd):
    g = geom.simplify(tol, preserve_topology=True)
    polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
    out = []
    for p in polys:
        if p.area < tol * tol * 4:
            continue  # drop specks smaller than the simplification step
        out.append([[[round(x, nd), round(y, nd)] for x, y in p.exterior.coords]])
    return out


def main():
    groups = {}
    for f in sorted(glob.glob(os.path.join(SRC, "med-*.json"))):
        for ft in json.load(open(f))["features"]:
            groups.setdefault(ph_name(ft["properties"]), []).append(shape(ft["geometry"]).buffer(0))
    ph = []
    for name in sorted(groups):
        geom = unary_union(groups[name])
        c = geom.representative_point()
        ph.append({"name": name, "c": [round(c.x, 3), round(c.y, 3)], "p": compact(geom, 0.006, 3)})
    ca = json.load(open(os.path.join(SRC, "ca.json")))
    bay = []
    for ft in ca["features"]:
        n = ft["properties"]["name"]
        if n in BAY:
            geom = shape(ft["geometry"]).buffer(0)
            c = geom.representative_point()
            bay.append({"name": n, "c": [round(c.x, 4), round(c.y, 4)], "p": compact(geom, 0.003, 4)})
    os.makedirs(OUT, exist_ok=True)
    src_ph = "Provinces: PSA PSGC boundaries (31 Dec 2023) via faeldon/philippines-json-maps, MIT licence."
    src_bay = "Counties: codeforgermany/click_that_hood, california-counties.geojson."
    json.dump({"source": src_ph, "features": ph}, open(os.path.join(OUT, "ph-provinces.json"), "w"), separators=(",", ":"))
    json.dump({"source": src_bay, "features": sorted(bay, key=lambda b: b["name"])}, open(os.path.join(OUT, "bay-counties.json"), "w"), separators=(",", ":"))
    open(os.path.join(OUT, "provinces.txt"), "w").write("\n".join(p["name"] for p in ph) + "\n")
    print(len(ph), "provinces;", len(bay), "counties")


if __name__ == "__main__":
    main()
