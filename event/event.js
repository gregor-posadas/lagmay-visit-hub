/* When the Waters Rise: the public event page.
   Shows who is coming on two maps joined across the Pacific: the Bay Area (where people live) and the Philippines
   (where they have ties). Data are anonymous counts from the team's Apps Script (action=map), or made-up people with ?sample.
   Add ?present (or #present) for the step-by-step reveal used at the start of the event. */
(function () {
  "use strict";
  var cfg = window.EV_CONFIG || {};
  var qs = location.search + location.hash;
  var SAMPLE = /[?&#]sample/.test(qs) || !cfg.apiUrl;
  var PRESENT = /[?&#]present/.test(qs);
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var geo = { ph: null, bay: null, storms: [], maps: null, photos: {} }, data = null;

  /* ---------- small helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function n2w(n) { return n === 1 ? "1 person" : n + " people"; }
  function list(items) { return items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + (items.length > 2 ? "," : "") + " and " + items[items.length - 1]; }
  function sum(o) { var t = 0; Object.keys(o || {}).forEach(function (k) { t += o[k]; }); return t; }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("is-on"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("is-on"); }, 3500); }
  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  /* ---------- sample people (clearly labelled on every view) ---------- */
  function sampleData() {
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function pick(w) { var keys = Object.keys(w), t = 0, r; keys.forEach(function (k) { t += w[k]; }); r = rnd() * t; for (var i = 0; i < keys.length; i++) { r -= w[keys[i]]; if (r <= 0) return keys[i]; } return keys[0]; }
    var counties = { Alameda: 34, "San Francisco": 14, "Santa Clara": 16, "Contra Costa": 12, "San Mateo": 10, Solano: 6, Marin: 2, Sonoma: 2, Napa: 1, outside: 6, unsaid: 2 };
    var provs = { "Metro Manila": 22, Pampanga: 10, Cebu: 8, Pangasinan: 7, Batangas: 6, Iloilo: 6, Laguna: 5, Cavite: 5, "Ilocos Norte": 5, Bulacan: 4, Leyte: 4,
      Rizal: 3, "Camarines Sur": 3, "Davao del Sur": 3, "Negros Occidental": 3, Albay: 2, Bohol: 2, "La Union": 2, Quezon: 2, Cagayan: 2, Tarlac: 2,
      "Misamis Oriental": 1, Samar: 1, Zambales: 1, "Ilocos Sur": 2, Isabela: 2, Capiz: 1, Sorsogon: 1 };
    var ties = { born: 18, parents: 34, roots: 16, lived: 6, other: 6, none: 16, unsaid: 4 };
    var d = { total: 120, attend: { inPerson: 0, online: 0, unsure: 0 }, bay: {}, ph: {}, links: {}, sets: {}, ties: {}, stories: [], updated: new Date().toISOString(), sample: true };
    for (var i = 0; i < d.total; i++) {
      var a = rnd(); if (a < 0.7) d.attend.inPerson++; else if (a < 0.9) d.attend.online++; else d.attend.unsure++;
      var c = pick(counties), t = pick(ties); d.bay[c] = (d.bay[c] || 0) + 1; d.ties[t] = (d.ties[t] || 0) + 1;
      if (t === "none" || t === "unsaid") continue;
      var ps = [pick(provs)]; if (rnd() < 0.18) { var p2 = pick(provs); if (p2 !== ps[0]) ps.push(p2); }
      d.sets[ps.slice().sort().join("|")] = (d.sets[ps.slice().sort().join("|")] || 0) + 1;
      ps.forEach(function (p) { d.ph[p] = (d.ph[p] || 0) + 1; if (c !== "unsaid") { var k = c + "|" + p; d.links[k] = (d.links[k] || 0) + 1; } });
    }
    d.links = Object.keys(d.links).map(function (k) { var p = k.split("|"); return { from: p[0], to: p[1], n: d.links[k] }; });
    d.stories = [
      { text: "Sample story: my lola still talks about the night the water reached the second floor. They waited on the roof until morning.", province: "Metro Manila" },
      { text: "Sample story: every typhoon season my dad calls home twice a day until the rain stops.", province: "Pampanga" },
      { text: "Sample story: we sent a balikbayan box of rain boots and flashlights after the flood. It took two months to arrive.", province: "Camarines Sur" }
    ];
    return d;
  }

  /* ---------- geometry ---------- */
  function bounds(features) {
    var b = [180, 90, -180, -90];
    features.forEach(function (f) { f.p.forEach(function (poly) { poly[0].forEach(function (pt) { b[0] = Math.min(b[0], pt[0]); b[1] = Math.min(b[1], pt[1]); b[2] = Math.max(b[2], pt[0]); b[3] = Math.max(b[3], pt[1]); }); }); });
    return b;
  }
  function makeProj(features, box) {
    var b = bounds(features), lat0 = (b[1] + b[3]) / 2, kx = Math.cos(lat0 * Math.PI / 180);
    var w = (b[2] - b[0]) * kx, h = b[3] - b[1], s = Math.min(box.w / w, box.h / h);
    var ox = box.x + (box.w - w * s) / 2, oy = box.y + (box.h - h * s) / 2;
    var f = function (pt) { return [ox + (pt[0] - b[0]) * kx * s, oy + (b[3] - pt[1]) * s]; };
    f.scale = s; f.kx = kx; return f;
  }
  function pathOf(f, proj) {
    return f.p.map(function (poly) { return "M" + poly[0].map(function (pt) { var q = proj(pt); return q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("L") + "Z"; }).join("");
  }
  /* Where each person in a place stands: a small block of figures centred on the place. */
  function cluster(n, cx, cy, u) {
    var shown = Math.min(n, 60), cols = Math.max(1, Math.ceil(Math.sqrt(shown * 1.6))), rows = Math.ceil(shown / cols);
    var w = u, h = u * 1.3, gx = u * 1.12, gy = h * 1.08, out = [];
    for (var i = 0; i < shown; i++) {
      var r = Math.floor(i / cols), c = i % cols, inRow = r === rows - 1 ? shown - r * cols : cols;
      out.push([cx - (inRow * gx) / 2 + c * gx + (gx - w) / 2, cy - (rows * gy) / 2 + r * gy, w, h]);
    }
    return { pts: out, extra: n - shown, bottom: cy + (rows * gy) / 2 };
  }

  /* ---------- the map ---------- */
  var PERSON = '<symbol id="ev-person" viewBox="0 0 16 20"><circle cx="8" cy="4" r="3.4"/><path d="M3.2 19.5V12Q3.2 8.2 8 8.2Q12.8 8.2 12.8 12V19.5H9V15.2H7V19.5Z"/></symbol>';
  function layoutFor(width) {
    return width >= 720
      ? { W: 1200, H: 760, ph: { x: 20, y: 30, w: 470, h: 710 }, bay: { x: 860, y: 190, w: 320, h: 360 }, ocean: [690, 640], vertical: false, u: 9 }
      : { W: 600, H: 1300, ph: { x: 30, y: 520, w: 540, h: 760 }, bay: { x: 150, y: 40, w: 300, h: 330 }, ocean: [170, 470], vertical: true, u: 10 };
  }
  // UP NOAH flood hazard images (tools/flood_maps): placed on the map by their lon/lat bounds.
  function imgTag(cls, name, proj, attrs, lazy) {
    var m = geo.maps && geo.maps.images[name]; if (!m) return "";
    var bb = m.bounds, p0 = proj([bb[0], bb[3]]), p1 = proj([bb[2], bb[1]]);
    return '<image class="' + cls + '" ' + (lazy ? "data-href" : "href") + '="data/maps/' + name + '" x="' + p0[0].toFixed(2) + '" y="' + p0[1].toFixed(2) + '" width="' + (p1[0] - p0[0]).toFixed(2) + '" height="' + (p1[1] - p0[1]).toFixed(2) + '" preserveAspectRatio="none"' + (attrs || "") + "/>";
  }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function townOf(p) { var m = geo.maps && geo.maps.images["town-" + slug(p) + ".png"]; return m && m.in_hazard > 0 ? m : null; }
  function stormSet() { var s = {}; geo.storms.forEach(function (st) { st.provinces.forEach(function (p) { s[p] = true; }); }); return s; }

  function drawMap(host, d, opts) {
    opts = opts || {};
    var L = layoutFor(opts.width || host.clientWidth || 1000);
    var pp = makeProj(geo.ph.features, L.ph), bp = makeProj(geo.bay.features, L.bay);
    var phPt = {}, bayPt = {};
    geo.ph.features.forEach(function (f) { phPt[f.name] = pp(f.c); });
    geo.bay.features.forEach(function (f) { bayPt[f.name] = bp(f.c); });
    bayPt.outside = L.vertical ? [L.bay.x + L.bay.w + 40, L.bay.y + L.bay.h - 30] : [L.bay.x + L.bay.w / 2, L.bay.y + L.bay.h + 70];
    var storms = stormSet();
    var s = '<svg viewBox="0 0 ' + L.W + " " + L.H + '" class="m' + (L.vertical ? " m--v" : "") + '" role="img" aria-labelledby="who-summary" focusable="false">';
    s += "<defs>" + PERSON + "</defs>";
    // Panels and labels
    s += '<text class="m-label" x="' + (L.ph.x + 6) + '" y="' + (L.ph.y + 16) + '">The Philippines</text>';
    s += '<text class="m-label" x="' + (L.bay.x + 6) + '" y="' + (L.bay.y - 12) + '">The Bay Area</text>';
    s += '<text class="m-ocean" x="' + L.ocean[0] + '" y="' + L.ocean[1] + '" text-anchor="middle">Pacific Ocean</text>';
    // Land
    s += '<g class="m-ph">' + geo.ph.features.map(function (f) {
      var cls = "m-prov" + (d.ph[f.name] ? " is-home" : "") + (storms[f.name] ? " is-storm" : "");
      return '<path class="' + cls + '" data-name="' + esc(f.name) + '" d="' + pathOf(f, pp) + '"><title>' + esc(f.name) + (d.ph[f.name] ? ": " + n2w(d.ph[f.name]) : "") + "</title></path>";
    }).join("") + "</g>";
    s += '<g class="m-bay">' + geo.bay.features.map(function (f) {
      return '<path class="m-county' + (d.bay[f.name] ? " is-home" : "") + '" data-name="' + esc(f.name) + '" d="' + pathOf(f, bp) + '"><title>' + esc(f.name) + " County" + (d.bay[f.name] ? ": " + n2w(d.bay[f.name]) : "") + "</title></path>";
    }).join("") + "</g>";
    // Flood hazard: the whole country (light and dark versions; CSS shows the one that fits the theme).
    // In the reveal, sharper maps of each storm province and closeups of one town in each, loaded only when needed.
    s += '<g class="m-hazard">' + (opts.present ? "" : imgTag("m-haz m-haz--light", "ph-hazard-light.png", pp)) + imgTag("m-haz m-haz--dark", "ph-hazard-dark.png", pp);
    if (opts.present && geo.maps) Object.keys(geo.maps.images).forEach(function (n) {
      var m = geo.maps.images[n];
      if (!/^prov-/.test(n)) return;
      // clip each province's sharper map to the province itself, so it doesn't show as a rectangle
      var f = geo.ph.features.filter(function (x) { return x.name === m.province; })[0];
      if (f) s += '<clipPath id="clip-' + slug(m.province) + '"><path d="' + pathOf(f, pp) + '"/></clipPath>';
      s += imgTag("m-hazp", n, pp, ' data-prov="' + esc(m.province) + '"' + (f ? ' clip-path="url(#clip-' + slug(m.province) + ')"' : ""), true);
    });
    if (opts.present && geo.maps) Object.keys(geo.maps.images).forEach(function (n) {
      var m = geo.maps.images[n];
      if (/^town-/.test(n) && m.in_hazard > 0) s += imgTag("m-town", n, pp, ' data-prov="' + esc(m.province) + '"', true);
    });
    s += "</g>";
    // Lines across the ocean
    // One line per province, all leaving the Bay at the Golden Gate, as thick as the number of people tied to it.
    var gate = bp([-122.478, 37.815]);
    s += '<g class="m-arcs">' + Object.keys(d.ph).filter(function (p) { return phPt[p]; }).map(function (p) { return { to: p, n: d.ph[p] }; }).sort(function (a, b) { return a.n - b.n; }).map(function (l) {
      var a = gate, b = phPt[l.to], c;
      c = L.vertical ? [Math.max(a[0], b[0]) + 140 + Math.abs(a[1] - b[1]) * 0.08, (a[1] + b[1]) / 2] : [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 120 - Math.abs(a[0] - b[0]) * 0.12];
          var w = (1.2 + 2.2 * Math.log2(1 + l.n)).toFixed(1);
      return '<path class="m-arc" data-to="' + esc(l.to) + '" pathLength="1" stroke-width="' + w + '" d="M' + a[0].toFixed(1) + " " + a[1].toFixed(1) + "Q" + c[0].toFixed(1) + " " + c[1].toFixed(1) + " " + b[0].toFixed(1) + " " + b[1].toFixed(1) + '"/>';
    }).join("") + '<circle class="m-gate" cx="' + gate[0].toFixed(1) + '" cy="' + gate[1].toFixed(1) + '" r="5"/></g>';
    // People
    function people(counts, pts, cls, u) {
      return Object.keys(counts).filter(function (k) { return pts[k] && counts[k] > 0; }).map(function (k) {
        var cl = cluster(counts[k], pts[k][0], pts[k][1], u);
        return '<g class="m-people ' + cls + '" data-name="' + esc(k) + '">' + cl.pts.map(function (q) {
          return '<use href="#ev-person" x="' + q[0].toFixed(1) + '" y="' + q[1].toFixed(1) + '" width="' + q[2] + '" height="' + q[3].toFixed(1) + '"/>';
        }).join("") + (cl.extra > 0 ? '<text class="m-more" x="' + pts[k][0].toFixed(1) + '" y="' + (cl.bottom + 14).toFixed(1) + '" text-anchor="middle">+' + cl.extra + "</text>" : "") + "</g>";
      }).join("");
    }
    s += people(d.ph, phPt, "m-people--ph", L.u * 0.85);
    s += people(d.bay, bayPt, "m-people--bay", L.u);
    if (d.bay.outside) s += '<text class="m-small" x="' + bayPt.outside[0].toFixed(1) + '" y="' + (bayPt.outside[1] + (L.vertical ? 40 : 46)).toFixed(1) + '" text-anchor="middle">Outside the Bay Area</text>';
    s += "</svg>";
    host.innerHTML = s;
    host.firstChild.__proj = pp; host.firstChild.__L = L;
    return host.firstChild;
  }

  /* ---------- words ---------- */
  function facts(d) {
    var provs = Object.keys(d.ph).sort(function (a, b) { return d.ph[b] - d.ph[a] || a.localeCompare(b); });
    var counties = Object.keys(d.bay).filter(function (k) { return k !== "outside" && k !== "unsaid"; });
    var withTies = sum(d.sets), storms = stormSet(), inStorm = 0;
    Object.keys(d.sets || {}).forEach(function (k) { if (k.split("|").some(function (p) { return storms[p]; })) inStorm += d.sets[k]; });
    return { provs: provs, counties: counties, withTies: withTies, inStorm: inStorm, noTies: (d.ties && d.ties.none) || 0 };
  }
  function summary(d) {
    var f = facts(d);
    if (!d.total) return "No RSVPs yet. Be the first on the map.";
    var s = n2w(d.total) + (d.total === 1 ? " has" : " have") + " RSVPed: " + d.attend.inPerson + " in person and " + d.attend.online + " online" + (d.attend.unsure ? ", " + d.attend.unsure + " not sure yet" : "") + ". ";
    if (f.withTies) s += f.withTies + " of them have ties to " + f.provs.length + (f.provs.length === 1 ? " province" : " provinces") + " in the Philippines, most often " + list(f.provs.slice(0, 3)) + ".";
    if (f.noTies) s += " " + f.noTies + (f.noTies === 1 ? " is" : " are") + " coming with no ties to the Philippines at all, and are just as welcome.";
    return s;
  }
  function table(d) {
    var f = facts(d);
    var rows = function (obj, keys, label) {
      return keys.length ? '<table class="pm-table ev-tbl"><thead><tr><th scope="col">' + label + '</th><th scope="col" class="money">People</th></tr></thead><tbody>' +
        keys.map(function (k) { return "<tr><td>" + esc(k === "outside" ? "Outside the Bay Area" : k === "unsaid" ? "Preferred not to say" : k) + '</td><td class="money">' + obj[k] + "</td></tr>"; }).join("") + "</tbody></table>" : "";
    };
    var bayKeys = Object.keys(d.bay).sort(function (a, b) { return d.bay[b] - d.bay[a]; });
    return '<div class="ev-tables">' + rows(d.bay, bayKeys, "Where people live") + rows(d.ph, f.provs, "Province in the Philippines") + "</div>";
  }
  // Legends: each swatch has a word, and the blues get stronger with depth (checked with tools/cvd_check.py).
  function hazardKey(withBuildings) {
    var items = [["hz1", "Under 0.5 m deep"], ["hz2", "0.5 to 1.5 m"], ["hz3", "Over 1.5 m"]];
    if (withBuildings) items.push(["bin", "Building the flood would reach"], ["bout", "Building outside it"]);
    return '<span class="k-title">' + (withBuildings ? "A 100-year flood, up close (UP NOAH)" : "Where a 100-year flood would reach (UP NOAH)") + '</span><span class="k-scale" role="list">' +
      items.map(function (x) { return '<span class="k" role="listitem"><i class="sw sw--' + x[0] + '" aria-hidden="true"></i>' + x[1] + "</span>"; }).join("") + "</span>";
  }
  function key(d) {
    return hazardKey(false) + '<span class="k"><svg viewBox="0 0 16 20" width="12" height="15" aria-hidden="true"><use href="#ev-person"/></svg> One person</span>' +
      '<span class="k"><i class="k-arc" aria-hidden="true"></i> One line per province, thicker when more people are tied to it</span>' +
      (d.sample ? '<span class="k k--sample">Sample data</span>' : "");
  }

  /* ---------- the page ---------- */
  var lastWidthMode = null;
  function renderPage() {
    if (!data || !geo.ph) return;
    var host = $("map-svg"); lastWidthMode = layoutFor(host.clientWidth).vertical;
    drawMap(host, data);
    $("who-summary").textContent = summary(data);
    $("map-table").innerHTML = table(data);
    $("map-key").innerHTML = key(data);
    $("sample-note").hidden = !data.sample;
  }
  window.addEventListener("resize", function () { var h = $("map-svg"); if (h && data && layoutFor(h.clientWidth).vertical !== lastWidthMode && !PRESENT) renderPage(); });

  function loadData() {
    if (SAMPLE) return Promise.resolve(sampleData());
    var u = cfg.apiUrl + (cfg.apiUrl.indexOf("?") > -1 ? "&" : "?") + "action=map";
    return fetch(u, { redirect: "follow" }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error || "No data"); j.data.sets = j.data.sets || {}; return j.data; });
  }
  function refresh() {
    return loadData().then(function (d) { data = d; if (PRESENT) { buildSteps(); show(stepIndex); } else renderPage(); })
      .catch(function () { if (!data) $("who-summary").textContent = "The map couldn't load right now. Try reloading the page."; });
  }

  /* ---------- the reveal (?present) ---------- */
  // Each step says what to show, what to highlight, where the camera goes (zoom) and which legend and photo go with it.
  var steps = [], stepIndex = 0, pres = null, vb = null, zoomAnim = null;
  var FULL = { kind: "full" };
  function photoFor(storms) {
    var best = null;
    storms.forEach(function (st) { var ph = geo.photos[st.year + "|" + st.name]; if (ph && (!best || st.dead > best.dead)) best = { dead: st.dead, ph: ph }; });
    return best && best.ph;
  }
  function buildSteps() {
    var d = data, f = facts(d), counties = f.counties.length;
    var all = ["bay", "arcs", "ph", "water"];
    steps = [];
    steps.push({ caption: "When the Waters Rise", sub: "Before we begin, look for yourself on this map.", show: [], zoom: FULL });
    steps.push({ caption: "This is us tonight.", sub: n2w(d.total) + ", from " + counties + " Bay Area " + (counties === 1 ? "county" : "counties") + (d.bay.outside ? " and beyond" : "") + ".", show: ["bay"], zoom: FULL });
    if (f.withTies) steps.push({ caption: f.withTies + " of us are tied to the Philippines,", sub: "born there, with family there, or from time spent there: " + f.provs.length + (f.provs.length === 1 ? " province" : " provinces") + " in all.", show: ["bay", "arcs", "ph"], zoom: FULL });
    if (f.noTies) steps.push({ caption: f.noTies + " of us came with no ties to the Philippines at all.", sub: "You belong in this conversation too. What happens next will take people with every kind of connection, and people with none.", show: ["bay", "arcs", "ph"], zoom: FULL });
    steps.push({ caption: "This is where a once-in-a-century rain would flood.", sub: "UP NOAH's flood hazard map for a 100-year rain. The brighter the blue, the deeper the water.", show: all, legend: "hazard", zoom: FULL });
    var stormProvs = Object.keys(stormSet());
    if (f.inStorm) steps.push({ caption: f.inStorm + " of us are tied to places the worst floods since 1991 reached.", sub: "Provinces that have been affected by the Philippines' worst floods.", show: all, focus: stormProvs, legend: "hazard", zoom: FULL });
    // Groups of provinces in the room that share the same floods; the four with the most people. With few RSVPs yet,
    // fall back to the deadliest floods so the reveal always visits a few places.
    function groupsOf(only) {
      var byProv = {}, groups = {};
      geo.storms.forEach(function (st) { st.provinces.forEach(function (p) { if (only(p)) (byProv[p] = byProv[p] || []).push(st); }); });
      Object.keys(byProv).forEach(function (p) {
        var key = byProv[p].map(function (st) { return st.year + st.name; }).join("|");
        (groups[key] = groups[key] || { here: [], storms: byProv[p] }).here.push(p);
      });
      return Object.keys(groups).map(function (key) {
        var g = groups[key], k = 0;
        Object.keys(d.sets).forEach(function (s) { if (s.split("|").some(function (p) { return g.here.indexOf(p) > -1; })) k += d.sets[s]; });
        g.k = k; g.dead = Math.max.apply(null, g.storms.map(function (st) { return st.dead || 0; })); return g;
      });
    }
    var chosen = groupsOf(function (p) { return d.ph[p] > 0; }).sort(function (a, b) { return b.k - a.k; }).slice(0, 4);
    if (chosen.length < 2) {
      var used = {}; chosen.forEach(function (g) { g.here.forEach(function (p) { used[p] = 1; }); });
      groupsOf(function (p) { return !used[p]; }).sort(function (a, b) { return b.dead - a.dead; }).slice(0, 2 - chosen.length).forEach(function (g) { chosen.push(g); });
    }
    var firstTown = true;
    chosen.forEach(function (g) {
      var many = g.storms.length > 2, here = g.here.slice().sort();
      var names = g.storms.map(function (st) { return st.name + (st.intl && !many ? " (" + st.intl + ")" : "") + " in " + st.year; });
      var one = g.storms.length === 1 ? g.storms[0].line.charAt(0).toUpperCase() + g.storms[0].line.slice(1) + ". " : "";
      steps.push({ caption: "In " + list(here) + ", people remember " + list(names) + ".", sub: one + (g.k ? g.k + " of us " + (g.k === 1 ? "is" : "are") + " tied to " + (here.length > 1 ? "these provinces." : here[0] + ".") : ""),
        show: all, focus: g.here, legend: "hazard", photo: photoFor(g.storms), zoom: { kind: "prov", provs: g.here } });
      // Then down to one town, with every building: the province in the group with the most people (or the first with a closeup).
      var tp = g.here.slice().sort(function (a, b) { return (d.ph[b] || 0) - (d.ph[a] || 0); }).filter(townOf)[0];
      if (!tp) return;
      var t = townOf(tp);
      steps.push(firstTown
        ? { caption: "This is part of " + t.town + ", up close.", sub: "Every orange shape is a building a 100-year flood would reach: homes, schools, churches, shops. Grey buildings sit outside it.", show: all, legend: "town", zoom: { kind: "town", prov: tp }, place: t.town + ", " + tp }
        : { caption: "Part of " + t.town + ", up close.", sub: "Orange: buildings a 100-year flood would reach. Grey: buildings outside it.", show: all, legend: "town", zoom: { kind: "town", prov: tp }, place: t.town + ", " + tp });
      firstTown = false;
    });
    if (f.inStorm || chosen.length) steps.push({ caption: "If you, or someone close to you, lived through one of these floods, raise your hand.", sub: "Keep it up for a moment, and look around the room.", show: all, zoom: FULL });
    (d.stories || []).forEach(function (st) {
      steps.push({ caption: "“" + st.text + "”", sub: st.province ? "Shared by someone tied to " + st.province + "." : "Shared by someone in this room.", show: all, focus: st.province ? [st.province] : [], story: true, zoom: FULL });
    });
    steps.push({ caption: "These lines carry worry every typhoon season.", sub: "They also carry help: the calls home, the remittances, the balikbayan boxes. Tonight, anyone in this room can add to what they carry.", show: ["bay", "arcs", "ph", "glow"], zoom: FULL });
  }

  /* camera: animate the SVG viewBox */
  function boxFor(z, svg) {
    var L = svg.__L, pp = svg.__proj, W = L.W, H = L.H;
    if (!z || z.kind === "full") return [0, 0, W, H];
    var b;
    if (z.kind === "town") { var m = townOf(z.prov), bb = m.bounds; b = [pp([bb[0], bb[3]]), pp([bb[2], bb[1]])]; }
    else {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      geo.ph.features.forEach(function (f) {
        if (z.provs.indexOf(f.name) < 0) return;
        f.p.forEach(function (poly) { poly[0].forEach(function (pt) { var q = pp(pt); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }); });
      });
      var px = (x1 - x0) * 0.15 + 4, py = (y1 - y0) * 0.15 + 4; b = [[x0 - px, y0 - py], [x1 + px, y1 + py]];
    }
    var w = b[1][0] - b[0][0], h = b[1][1] - b[0][1], cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
    if (w / h > W / H) h = w * H / W; else w = h * W / H;   // keep the screen's shape so nothing stretches
    return [cx - w / 2, cy - h / 2, w, h];
  }
  function setVB(svg, v) { vb = v; svg.setAttribute("viewBox", v.map(function (x) { return x.toFixed(3); }).join(" ")); }
  function zoomTo(svg, target, done) {
    if (zoomAnim) cancelAnimationFrame(zoomAnim);
    var from = vb || [0, 0, svg.__L.W, svg.__L.H];
    if (reduced || from.join() === target.join()) { setVB(svg, target); if (done) done(); return; }
    // zoom out a little on long moves, like a flight, and spend longer on big changes of scale
    var ratio = Math.abs(Math.log(target[2] / from[2])), ms = Math.min(2600, 1100 + ratio * 380), t0 = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      // interpolate size in log space so the zoom feels even
      var w = Math.exp(Math.log(from[2]) + (Math.log(target[2]) - Math.log(from[2])) * e), h = w * from[3] / from[2];
      var cx = from[0] + from[2] / 2 + ((target[0] + target[2] / 2) - (from[0] + from[2] / 2)) * e;
      var cy = from[1] + from[3] / 2 + ((target[1] + target[3] / 2) - (from[1] + from[3] / 2)) * e;
      setVB(svg, [cx - w / 2, cy - h / 2, w, h]);
      if (t < 1) zoomAnim = requestAnimationFrame(frame); else { zoomAnim = null; setVB(svg, target); if (done) done(); }
    }
    zoomAnim = requestAnimationFrame(frame);
  }
  // Scale bar and place name, drawn in HTML over the map so they stay crisp at any zoom.
  function paintPlace(st, svg) {
    var el = $("present-place");
    if (!st.zoom || st.zoom.kind === "full") { el.hidden = true; return; }
    var pp = svg.__proj, r = svg.getBoundingClientRect(), pxPerUnit = Math.min(r.width / vb[2], r.height / vb[3]);
    var lat = st.zoom.kind === "town" ? (townOf(st.zoom.prov).bounds[1] + townOf(st.zoom.prov).bounds[3]) / 2 : 12;
    var kmPerUnit = 111.32 * Math.cos(lat * Math.PI / 180) / (pp.scale * pp.kx), pxPerKm = pxPerUnit / kmPerUnit;
    var nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200], km = nice[0];
    nice.forEach(function (n) { if (n * pxPerKm <= 220) km = n; });
    el.innerHTML = '<span class="ev-place__name">' + esc(st.place || list(st.zoom.provs || [])) + '</span><span class="ev-place__bar"><i style="width:' + Math.round(km * pxPerKm) + 'px"></i>' + (km < 1 ? km * 1000 + " m" : km + " km") + "</span>";
    el.hidden = false;
  }
  function loadImgs(svg, st) {
    if (!st || !st.zoom) return;
    var want = st.zoom.kind === "prov" ? st.zoom.provs : st.zoom.kind === "town" ? [st.zoom.prov] : [];
    svg.querySelectorAll(st.zoom.kind === "town" ? ".m-town, .m-hazp" : ".m-hazp").forEach(function (im) {
      if (want.indexOf(im.getAttribute("data-prov")) > -1 && !im.getAttribute("href")) im.setAttribute("href", im.getAttribute("data-href"));
    });
  }
  function show(i) {
    stepIndex = Math.max(0, Math.min(steps.length - 1, i));
    var st = steps[stepIndex], svg = pres.querySelector("svg"), z = st.zoom || FULL;
    ["bay", "arcs", "ph", "water", "glow"].forEach(function (k) { svg.classList.toggle("show-" + k, st.show.indexOf(k) > -1); });
    svg.classList.toggle("has-focus", !!(st.focus && st.focus.length));
    svg.classList.toggle("is-zoomed", z.kind !== "full");
    svg.classList.toggle("is-town", z.kind === "town");
    svg.querySelectorAll(".m-prov").forEach(function (p) { p.classList.toggle("is-focus", !!(st.focus && st.focus.indexOf(p.getAttribute("data-name")) > -1)); });
    svg.querySelectorAll(".m-arc").forEach(function (p) { p.classList.toggle("is-focus", !!(st.focus && st.focus.indexOf(p.getAttribute("data-to")) > -1)); });
    svg.querySelectorAll(".m-people--ph").forEach(function (p) { p.classList.toggle("is-focus", !!(st.focus && st.focus.indexOf(p.getAttribute("data-name")) > -1)); });
    loadImgs(svg, st); loadImgs(svg, steps[stepIndex + 1]);   // fetch this step's maps and the next one's
    var provs = z.kind === "prov" ? z.provs : z.kind === "town" ? [z.prov] : [];
    svg.querySelectorAll(".m-hazp").forEach(function (im) { im.classList.toggle("is-on", provs.indexOf(im.getAttribute("data-prov")) > -1); });
    svg.querySelectorAll(".m-town").forEach(function (im) { im.classList.toggle("is-on", z.kind === "town" && im.getAttribute("data-prov") === z.prov); });
    $("present-place").hidden = true;
    zoomTo(svg, boxFor(z, svg), function () { paintPlace(st, svg); });
    var lg = $("present-legend"); lg.hidden = !st.legend; if (st.legend) lg.innerHTML = hazardKey(st.legend === "town");
    var ph = $("present-photo");
    if (st.photo) { ph.querySelector("img").src = st.photo.src; ph.querySelector("img").alt = st.photo.alt; ph.querySelector("figcaption").textContent = st.photo.alt + " " + st.photo.credit + "."; ph.hidden = false; }
    else ph.hidden = true;
    ph.parentNode.classList.toggle("has-photo", !!st.photo);
    $("present-caption").textContent = st.caption;
    $("present-caption").classList.toggle("is-story", !!st.story);
    $("present-step").textContent = st.sub;
    $("present-prev").disabled = stepIndex === 0;
    $("present-next").textContent = stepIndex === steps.length - 1 ? "Done" : "Next";
    document.documentElement.classList.toggle("is-title", stepIndex === 0);
  }
  function startPresent() {
    $("present").hidden = false; document.body.classList.add("is-presenting");
    pres = $("present-map");
    drawMap(pres, data, { width: 1200, present: true }); vb = null;
    buildSteps(); show(0);
    $("present-sample").hidden = !data.sample;
    $("present-next").addEventListener("click", function () { if (stepIndex === steps.length - 1) { location.href = "./"; return; } show(stepIndex + 1); });
    $("present-prev").addEventListener("click", function () { show(stepIndex - 1); });
    window.addEventListener("resize", function () { var st = steps[stepIndex]; if (st) paintPlace(st, pres.querySelector("svg")); });
    document.addEventListener("keydown", function (e) {
      if (e.target.closest && e.target.closest("button, a") && (e.key === " " || e.key === "Enter")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); show(stepIndex + 1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); show(stepIndex - 1); }
      if (e.key === "r" || e.key === "R") { refresh().then(function () { drawMap(pres, data, { width: 1200, present: true }); vb = null; buildSteps(); show(stepIndex); toast("Map refreshed"); }); }
      if (e.key === "Escape") location.href = "./";
    });
  }

  /* ---------- RSVP button ---------- */
  function wireRsvp() {
    var b = $("rsvp-btn");
    if (cfg.rsvpUrl && /^https:\/\//.test(cfg.rsvpUrl)) { b.href = cfg.rsvpUrl; b.target = "_blank"; b.rel = "noopener"; return; }
    b.addEventListener("click", function (e) { e.preventDefault(); toast("The RSVP form opens soon. Check back in a few days."); });
    b.querySelector(".sr").textContent = " (opens soon)";
  }
  if (cfg.timeText) $("ev-time").textContent = cfg.timeText;

  /* ---------- theme and click sounds (same as the hub and gregor-posadas.github.io) ---------- */
  var store = { get: function (k) { try { return localStorage.getItem("lv." + k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem("lv." + k, v); } catch (e) { /* ignore */ } } };
  function theme() { return document.documentElement.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
  function paintTheme() { var b = $("theme-toggle"), next = theme() === "dark" ? "light" : "dark"; b.textContent = next === "light" ? "Light mode" : "Dark mode"; b.setAttribute("aria-label", "Switch to " + next + " mode"); }
  $("theme-toggle").addEventListener("click", function () { var n = theme() === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", n); store.set("theme", n); paintTheme(); });
  paintTheme();
  var soundBtn = $("sound-toggle"), saved = store.get("sound"), soundOn = saved === null ? !reduced : saved === "on", actx = null;
  function tick(kind) {
    if (!soundOn) return;
    try { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; if (!actx) actx = new AC(); if (actx.state === "suspended") { actx.resume().then(function () { play(kind); }, function () {}); return; } play(kind); } catch (e) { /* no audio */ }
  }
  function play(kind) {
    try {
      var up = kind === "up", t = actx.currentTime, out = actx.createGain(); out.gain.value = up ? 0.22 : 0.35; out.connect(actx.destination);
      var len = Math.max(1, Math.floor(actx.sampleRate * (up ? 0.006 : 0.009))), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      var src = actx.createBufferSource(); src.buffer = buf;
      var hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = up ? 4500 : 3000;
      var lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = up ? 9000 : 7000;
      src.connect(hp); hp.connect(lp); lp.connect(out); src.start(t);
      var o = actx.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(up ? 3400 : 2300, t); o.frequency.exponentialRampToValueAtTime(up ? 2900 : 1700, t + 0.012);
      var g = actx.createGain(); g.gain.setValueAtTime(up ? 0.10 : 0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (up ? 0.012 : 0.018));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.03);
    } catch (e) { /* no audio */ }
  }
  function paintSound() { soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false"); soundBtn.querySelector(".tool__state").textContent = soundOn ? "Sound on" : "Sound off"; }
  soundBtn.addEventListener("click", function () { soundOn = !soundOn; store.set("sound", soundOn ? "on" : "off"); paintSound(); if (soundOn) { tick("down"); setTimeout(function () { tick("up"); }, 70); } });
  paintSound();
  var pressed = null, PRESS = ".btn, .tool";
  document.addEventListener("pointerdown", function (e) { if (e.button !== undefined && e.button !== 0) return; var el = e.target.closest && e.target.closest(PRESS); if (el && !el.disabled) { pressed = el; tick("down"); } });
  function release() { if (pressed) { pressed = null; tick("up"); } }
  document.addEventListener("pointerup", release); document.addEventListener("pointercancel", release);

  /* ---------- start ---------- */
  // Speaker photos come from the speakers' university pages; if one won't load, show initials instead of a broken image.
  Array.prototype.forEach.call(document.querySelectorAll(".ev-speaker__photo img"), function (im) {
    function miss() { im.parentNode.classList.add("is-missing"); }
    if (im.complete && !im.naturalWidth) miss(); else im.addEventListener("error", miss);
  });
  wireRsvp();
  Promise.all([getJSON("data/ph-provinces.json"), getJSON("data/bay-counties.json"), getJSON("data/storms.json"),
    getJSON("data/maps/manifest.json").catch(function () { return null; }), getJSON("data/photos.json").catch(function () { return { photos: {} }; })]).then(function (r) {
    geo.ph = r[0]; geo.bay = r[1]; geo.storms = r[2].storms; geo.maps = r[3]; geo.photos = r[4].photos || {};
    return loadData();
  }).then(function (d) {
    data = d;
    if (PRESENT) startPresent(); else { renderPage(); if (!SAMPLE && cfg.refreshSeconds) setInterval(function () { if (document.visibilityState === "visible") refresh(); }, cfg.refreshSeconds * 1000); }
  }).catch(function () { $("who-summary").textContent = "The map couldn't load right now. Try reloading the page."; });
  window.__ev = { sampleData: sampleData, facts: function () { return facts(data); }, steps: function () { return steps; } };
})();
