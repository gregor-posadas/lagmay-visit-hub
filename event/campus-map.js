/*
 * A small street map of the two buildings: Banatao Auditorium (Sutardja Dai Hall) for the panel, and B100 Blum Hall
 * next door for the reception. Leaflet and the OpenStreetMap tiles load only when the map scrolls into view.
 * Building outlines are from OpenStreetMap (ways 24024350 and 24025049). Each place has a number, a shape and a word,
 * so color is never the only cue; the list under the map says the same thing for screen readers and if the map fails.
 */
(function () {
  var els = Array.prototype.slice.call(document.querySelectorAll(".js-campus-map"));
  if (!els.length) return;
  var FIL = document.documentElement.lang === "fil";
  var LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
  var PLACES = [
    { n: "1", shape: "circle", cls: "is-talk", short: "Banatao Auditorium", label: FIL ? "Banatao Auditorium (talakayan, 4 hanggang 5 PM)" : "Banatao Auditorium (the talk, 4 to 5 PM)",
      at: [37.87487, -122.25834],
      outline: [[37.8748364, -122.2587663], [37.8745761, -122.2586695], [37.8747101, -122.2580606], [37.8747683, -122.2580336], [37.8749482, -122.2581003],
        [37.875157, -122.2581919], [37.8752189, -122.2582452], [37.8751803, -122.25835], [37.875155, -122.2584534], [37.8751298, -122.2585168],
        [37.8749088, -122.2584423], [37.8749007, -122.2584783]] },
    { n: "2", shape: "square", cls: "is-reception", short: "B100 Blum Hall", label: FIL ? "B100 Blum Hall (pagkatapos)" : "B100 Blum Hall (reception after)",
      at: [37.87503, -122.25883],
      outline: [[37.8750479, -122.2590597], [37.874938, -122.2590369], [37.8749937, -122.2586047], [37.8751036, -122.2586275]] }
  ];
  var COLORS = { "is-talk": "#385F96", "is-reception": "#CF5921" };

  function dark() {
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  // OpenStreetMap's own tiles (no key needed). In dark mode the tiles are inverted with CSS (.cm-map.is-dark).
  function paintTheme(el) { el.classList.toggle("is-dark", dark()); }

  var loading = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (ok, fail) {
      var css = document.createElement("link"); css.rel = "stylesheet"; css.href = LEAFLET + "leaflet.min.css"; document.head.appendChild(css);
      var js = document.createElement("script"); js.src = LEAFLET + "leaflet.min.js"; js.onload = ok; js.onerror = fail; document.head.appendChild(js);
    });
    return loading;
  }

  function draw(el) {
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, zoomAnimation: !still, fadeAnimation: !still, markerZoomAnimation: !still });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    paintTheme(el);
    var bounds = L.latLngBounds([]);
    PLACES.forEach(function (p) {
      L.polygon(p.outline, { color: COLORS[p.cls], weight: 2, fillColor: COLORS[p.cls], fillOpacity: 0.22 }).addTo(map);
      var icon = L.divIcon({ className: "cm-pin cm-pin--" + p.shape + " " + p.cls, html: "<span>" + p.n + "</span>", iconSize: [30, 30], iconAnchor: [15, 15] });
      // On a narrow map the long labels would run off the sides, so use the short name, above or below the pin.
      var narrow = el.clientWidth < 560, one = p.n === "1";
      var tip = narrow ? { direction: one ? "bottom" : "top", offset: [0, one ? 16 : -16] } : { direction: one ? "right" : "left", offset: [one ? 16 : -16, 0] };
      L.marker(p.at, { icon: icon, title: p.n + ". " + p.label, alt: p.n + ". " + p.label, keyboard: true })
        .bindTooltip(narrow ? p.short : p.label, { permanent: true, direction: tip.direction, offset: tip.offset, className: "cm-label" }).addTo(map);
      p.outline.forEach(function (c) { bounds.extend(c); });
    });
    // The short walk between the two: dashed, from the auditorium to the reception.
    L.polyline([PLACES[0].at, PLACES[1].at], { color: dark() ? "#e8e3d8" : "#1b1a17", weight: 2, dashArray: "4 6", interactive: false }).addTo(map);
    map.fitBounds(bounds.pad(0.35), { maxZoom: 19 });
    // Follow the site's light and dark switch.
    new MutationObserver(function () { paintTheme(el); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    el.classList.add("is-ready");
  }

  function start(el) {
    loadLeaflet().then(function () { draw(el); }).catch(function () { el.classList.add("is-failed"); el.hidden = true; });
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); start(e.target); } });
    }, { rootMargin: "300px" });
    els.forEach(function (el) { io.observe(el); });
  } else els.forEach(start);
})();
