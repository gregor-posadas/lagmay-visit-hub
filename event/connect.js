/*
 * Connect: cards from people working on (or hoping to work on) Philippine-based projects, so they can find each other
 * through the event. Cards come from the team's Apps Script (action=connect), which only ever returns cards a teammate
 * approved from people who asked to be shown, and never an email. ?sample (or no apiUrl) shows made-up cards, labelled.
 * Every card field is escaped before it touches the page; links must be http(s).
 */
(function () {
  var list = document.getElementById("cn-cards");
  if (!list) return;
  var cfg = window.EV_CONFIG || {};
  var FIL = document.documentElement.lang === "fil";
  var SAMPLE = /[?&#]sample/.test(location.search + location.hash) || !cfg.apiUrl;
  var PAGE = 12;
  var AREAS = ["Floods, disasters and climate resilience", "Water and sanitation", "Environment and conservation", "Cities, housing and infrastructure",
    "Data, mapping and technology", "Policy, governance and history", "Health", "Education and youth", "Agriculture and food",
    "Business and social enterprise", "Arts, culture and media"];
  var T = FIL ? {
    all: "Lahat", allAreas: "Lahat ng larangan", filter: "Ipakita ang mga card tungkol sa", soon: "Malapit nang magbukas ang pag-sign up", looking: "Naghahanap ng", inPerson: "Darating sa Nob 9", online: "Manonood online",
    count: function (n) { return n + " card sa ngayon"; }, of: function (k, n, a) { return k + " sa " + n + " card ang tungkol sa " + a; },
    none: "Wala pang card. Maging isa sa mga unang magdagdag.", noneFor: "Wala pang card tungkol dito.", fail: "Hindi ma-load ang mga card ngayon. Subukan ulit mamaya.",
    more: function (n) { return "Ipakita lahat (" + n + ")"; }, newTab: " (magbubukas sa bagong tab)", sample: "Halimbawa",
    area: { "Floods, disasters and climate resilience": "Baha, sakuna at katatagan sa klima", "Water and sanitation": "Tubig at sanitasyon", "Environment and conservation": "Kapaligiran at konserbasyon",
      "Cities, housing and infrastructure": "Lungsod, pabahay at imprastruktura", "Data, mapping and technology": "Datos, pagmamapa at teknolohiya", "Policy, governance and history": "Patakaran, pamamahala at kasaysayan",
      "Health": "Kalusugan", "Education and youth": "Edukasyon at kabataan", "Agriculture and food": "Agrikultura at pagkain", "Business and social enterprise": "Negosyo at social enterprise", "Arts, culture and media": "Sining, kultura at media" },
    seek: { "Collaborators": "mga katuwang", "A mentor": "mentor", "Someone to mentor": "mamentoran", "Research partners": "katuwang sa pananaliksik", "Partners in the Philippines": "katuwang sa Pilipinas",
      "Funding or funders": "pondo o funder", "Jobs or internships": "trabaho o internship", "Volunteers": "mga boluntaryo", "Just to meet people": "makakilala ng mga tao" },
    base: { "Bay Area": "Bay Area", "Elsewhere in the US": "Ibang bahagi ng US", "Philippines": "Pilipinas", "Somewhere else": "Ibang lugar" }
  } : {
    all: "All", allAreas: "All areas", filter: "Show cards about", soon: "Sign-up opens soon", looking: "Looking for", inPerson: "At the event Nov 9", online: "Watching online",
    count: function (n) { return n === 1 ? "1 card so far" : n + " cards so far"; }, of: function (k, n, a) { return k + " of " + n + " cards are about " + a; },
    none: "No cards yet. Be one of the first to add yours.", noneFor: "No cards about this yet.", fail: "The cards couldn't load right now. Please try again later.",
    more: function (n) { return "Show all " + n; }, newTab: " (opens in a new tab)", sample: "Sample",
    area: {}, seek: {}, base: {}
  };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeLink(u) { return /^https?:\/\/[^\s"'<>]+$/i.test(String(u || "")) ? String(u) : ""; }
  function tr(map, v) { return map[v] || v; }
  function $(id) { return document.getElementById(id); }

  // The sign-up button: the form opens in a new tab once its link is set.
  var add = $("cn-add");
  if (add) {
    if (/^https:\/\//.test(cfg.connectUrl || "")) { add.href = cfg.connectUrl; add.target = "_blank"; add.rel = "noopener"; }
    else { add.removeAttribute("href"); add.setAttribute("aria-disabled", "true"); add.classList.add("is-disabled"); add.textContent = T.soon; }
  }

  function sampleCards() {
    return [
      { id: "s1", name: "Maria Santos", org: "Graduate student, UC Berkeley", base: "Bay Area", areas: ["Floods, disasters and climate resilience", "Data, mapping and technology"], project: "Mapping which barangays in Pampanga lose road access first when the rivers rise, using open flood maps and phone surveys.", seeking: ["Collaborators", "Partners in the Philippines"], link: "", nov9: "in-person" },
      { id: "s2", name: "Jose Dela Cruz", org: "Community health NGO, Tacloban", base: "Philippines", areas: ["Health", "Floods, disasters and climate resilience"], project: "Keeping rural health stations running through typhoon season, with backup power and stocked supplies.", seeking: ["Funding or funders", "Volunteers"], link: "", nov9: "online" },
      { id: "s3", name: "Liza Ramos", org: "Civil engineer", base: "Elsewhere in the US", areas: ["Water and sanitation", "Cities, housing and infrastructure"], project: "Hoping to help small water districts in Luzon plan repairs before the next big storm.", seeking: ["Someone to mentor", "Research partners"], link: "", nov9: "" },
      { id: "s4", name: "Paolo Garcia", org: "Undergraduate, Stanford", base: "Bay Area", areas: ["Education and youth", "Data, mapping and technology"], project: "Teaching high school students in Iloilo to build simple rain gauges and share the readings online.", seeking: ["A mentor", "Collaborators"], link: "", nov9: "in-person" },
      { id: "s5", name: "Ana Villanueva", org: "Social enterprise founder", base: "Philippines", areas: ["Agriculture and food", "Business and social enterprise"], project: "Flood-tolerant rice seed for farmers in Nueva Ecija, sold through farmer cooperatives.", seeking: ["Partners in the Philippines", "Funding or funders"], link: "", nov9: "online" },
      { id: "s6", name: "Carlo Mendoza", org: "Independent", base: "Somewhere else", areas: ["Policy, governance and history", "Arts, culture and media"], project: "A podcast on how Philippine cities have rebuilt after floods, told by the people who live there.", seeking: ["Just to meet people"], link: "", nov9: "" }
    ].map(function (c) { c.sample = true; return c; });
  }

  function load() {
    if (SAMPLE) return Promise.resolve({ cards: sampleCards(), sample: true });
    var u = cfg.apiUrl + (cfg.apiUrl.indexOf("?") > -1 ? "&" : "?") + "action=connect";
    return fetch(u, { redirect: "follow" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error || "error");
      return j.data;
    });
  }

  var cards = [], filter = "", showAll = false;

  function cardHtml(c) {
    var meta = [c.org, tr(T.base, c.base)].filter(Boolean).map(esc).join(" · ");
    var when = c.nov9 === "in-person" ? T.inPerson : c.nov9 === "online" ? T.online : "";
    var link = safeLink(c.link);
    return '<li class="cn-card">' +
      (c.sample ? '<span class="cn-card__sample">' + T.sample + "</span>" : "") +
      "<h3>" + esc(c.name) + "</h3>" +
      (meta ? '<p class="cn-card__meta">' + meta + "</p>" : "") +
      '<p class="cn-card__project">' + esc(c.project) + "</p>" +
      ((c.seeking || []).length ? '<p class="cn-card__seek"><b>' + T.looking + "</b> " + esc(c.seeking.map(function (s) { return tr(T.seek, s); }).join(", ")) + "</p>" : "") +
      ((c.areas || []).length ? '<ul class="cn-tags">' + c.areas.map(function (a) { return "<li>" + esc(tr(T.area, a)) + "</li>"; }).join("") + "</ul>" : "") +
      ((when || link) ? '<p class="cn-card__foot">' + (when ? "<span>" + when + "</span>" : "") +
        (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener nofollow ugc">' + esc(link.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "").slice(0, 40)) + '<span class="sr">' + T.newTab + "</span></a>" : "") + "</p>" : "") +
      "</li>";
  }

  function areasPresent() {
    var seen = {};
    cards.forEach(function (c) { (c.areas || []).forEach(function (a) { seen[a] = (seen[a] || 0) + 1; }); });
    return Object.keys(seen).sort(function (a, b) {
      var ia = AREAS.indexOf(a), ib = AREAS.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1);
    }).map(function (a) { return { key: a, n: seen[a] }; });
  }

  function renderFilter() {
    var box = $("cn-filter"), areas = areasPresent();
    box.hidden = cards.length < 4 || areas.length < 2;
    if (box.hidden) return;
    box.innerHTML = '<label for="cn-area">' + T.filter + '</label><select id="cn-area">' +
      [{ key: "", n: cards.length }].concat(areas).map(function (a) {
        return '<option value="' + esc(a.key) + '"' + (a.key === filter ? " selected" : "") + ">" + esc(a.key ? tr(T.area, a.key) : T.allAreas) + " (" + a.n + ")</option>";
      }).join("") + "</select>";
  }

  function render() {
    var shown = filter ? cards.filter(function (c) { return (c.areas || []).indexOf(filter) > -1; }) : cards;
    $("cn-count").textContent = !cards.length ? T.none : filter ? (shown.length ? T.of(shown.length, cards.length, tr(T.area, filter)) : T.noneFor) : T.count(cards.length);
    var cut = showAll ? shown : shown.slice(0, PAGE);
    list.innerHTML = cut.map(cardHtml).join("");
    var more = $("cn-more-wrap");
    more.hidden = shown.length <= cut.length;
    if (!more.hidden) $("cn-more").textContent = T.more(shown.length);
  }

  document.addEventListener("change", function (ev) {
    if (ev.target.id === "cn-area") { filter = ev.target.value; showAll = false; render(); }
  });
  document.addEventListener("click", function (ev) {
    if (ev.target.id === "cn-more") { showAll = true; render(); }
  });

  load().then(function (d) {
    cards = (d && d.cards) || [];
    $("cn-sample").hidden = !(d && d.sample);
    renderFilter(); render();
  }).catch(function () { $("cn-count").textContent = T.fail; });
})();
