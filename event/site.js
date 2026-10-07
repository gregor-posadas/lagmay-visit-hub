/* When the Waters Rise: what every page of the event site shares.
   Theme switch, click sounds, term notes (an underlined term opens a short plain-language note; same as BahaWatch
   and gregor-posadas.github.io), and source notes (hovering or focusing a cited phrase names its source). */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = { get: function (k) { try { return localStorage.getItem("lv." + k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem("lv." + k, v); } catch (e) { /* ignore */ } } };
  var FIL = document.documentElement.lang === "fil";

  /* ---------- stay on the newest version ----------
     GitHub Pages lets browsers keep a page for up to 10 minutes, so after an update someone could get an old page
     (an old menu, say) next to new ones. version.json is fetched fresh; if it is newer than this page, reload once. */
  (function () {
    var me = document.querySelector('script[src*="site.js"]'), m = me && /[?&]v=(\w+)/.exec(me.src);
    if (!m || m[1] === "0" || !window.fetch) return;
    fetch(me.src.replace(/event\/site\.js.*$/, "version.json") + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.v || j.v === m[1]) return;
        var k = "lv.reloaded." + j.v;
        try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch (e) { return; }
        location.reload();
      }).catch(function () {});
  })();
  /* Icons beside button labels (decorative; the words carry the meaning). Brand marks from Simple Icons (CC0),
     the LinkedIn mark from Font Awesome Free (CC BY 4.0), Google Calendar's from Google's product icons. */
  var ICONS = {
"gmaps": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"#EA4335\" d=\"M12 1.5a7.5 7.5 0 0 0-7.5 7.5c0 5.6 7.5 13.5 7.5 13.5s7.5-7.9 7.5-13.5A7.5 7.5 0 0 0 12 1.5zm0 10.25a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5z\"/></svg>",
"instagram": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"#E1306C\" d=\"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077\"/></svg>",
"facebook": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"#0866FF\" d=\"M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z\"/></svg>",
"whatsapp": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"#25D366\" d=\"M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z\"/></svg>",
"apple": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"currentColor\" d=\"M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701\"/></svg>",
"gcal": "<img class=\"ico\" src=\"https://ssl.gstatic.com/images/branding/product/1x/calendar_2020q4_48dp.png\" alt=\"\" aria-hidden=\"true\" width=\"20\" height=\"20\">",
"linkedin": "<svg class=\"ico\" viewBox=\"0 0 448 512\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"#0A66C2\" d=\"M416 32L31.9 32C14.3 32 0 46.5 0 64.3L0 447.7C0 465.5 14.3 480 31.9 480L416 480c17.6 0 32-14.5 32-32.3l0-383.4C448 46.5 433.6 32 416 32zM135.4 416l-66.4 0 0-213.8 66.5 0 0 213.8-.1 0zM102.2 96a38.5 38.5 0 1 1 0 77 38.5 38.5 0 1 1 0-77zM384.3 416l-66.4 0 0-104c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9l0 105.8-66.4 0 0-213.8 63.7 0 0 29.2 .9 0c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9l0 117.2z\"/></svg>",
"microsoft": "<svg class=\"ico\" viewBox=\"0 0 22 22\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"#F25022\" d=\"M0 0h10v10H0z\"/><path fill=\"#7FBA00\" d=\"M12 0h10v10H12z\"/><path fill=\"#00A4EF\" d=\"M0 12h10v10H0z\"/><path fill=\"#FFB900\" d=\"M12 12h10v10H12z\"/></svg>",
"link": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" d=\"M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L11.6 6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6\"/></svg>",
"share": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M12 15V3M7 8l5-5 5 5M5 12v8h14v-8\"/></svg>",
"calendar": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linejoin=\"round\" d=\"M4 6h16v14H4zM4 10h16M8 3v5M16 3v5\"/></svg>",
"download": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M12 3v12M7 10l5 5 5-5M5 20h14\"/></svg>",
"mail": "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linejoin=\"round\" d=\"M3 5h18v14H3zM3 6l9 7 9-7\"/></svg>"
};
  function icon(k) { return ICONS[k] || ""; }

  /* ---------- theme ---------- */
  function theme() { return document.documentElement.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
  function paintTheme() {
    var b = $("theme-toggle"); if (!b) return;
    var next = theme() === "dark" ? "light" : "dark";
    b.textContent = FIL ? (next === "light" ? "Maliwanag" : "Madilim") : (next === "light" ? "Light mode" : "Dark mode");
    b.setAttribute("aria-label", FIL ? (next === "light" ? "Gawing maliwanag ang pahina" : "Gawing madilim ang pahina") : "Switch to " + next + " mode");
  }
  if ($("theme-toggle")) $("theme-toggle").addEventListener("click", function () { var n = theme() === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", n); store.set("theme", n); paintTheme(); });
  paintTheme();

  /* ---------- click sounds (off by default under reduced motion) ---------- */
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
  function paintSound() {
    if (!soundBtn) return;
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    soundBtn.querySelector(".tool__state").textContent = FIL ? (soundOn ? "May tunog" : "Walang tunog") : (soundOn ? "Sound on" : "Sound off");
  }
  if (soundBtn) soundBtn.addEventListener("click", function () { soundOn = !soundOn; store.set("sound", soundOn ? "on" : "off"); paintSound(); if (soundOn) { tick("down"); setTimeout(function () { tick("up"); }, 70); } });
  paintSound();
  var pressed = null, PRESS = ".btn, .tool, .ev-logos a";
  document.addEventListener("pointerdown", function (e) { if (e.button !== undefined && e.button !== 0) return; var el = e.target.closest && e.target.closest(PRESS); if (el && !el.disabled) { pressed = el; tick("down"); } });
  function release() { if (pressed) { pressed = null; tick("up"); } }
  document.addEventListener("pointerup", release); document.addEventListener("pointercancel", release);

  /* ---------- term notes: <span class="tt"><span class="tt-t">term</span>note</span> ----------
     The term becomes a bold, underlined button; its note fades in below it. Click or tap pins it, hover shows it,
     Escape, a click elsewhere or tabbing away closes it. The note stays inside the window. */
  var ttSeq = 0, TT = null, ttHideT = 0;
  var TT_HOVER = window.matchMedia("(hover: hover) and (pointer: fine)");
  function tipsInit(root) {
    Array.prototype.forEach.call(root.querySelectorAll(".tt:not([data-tt])"), function (el) {
      el.setAttribute("data-tt", "1"); var id = "tt-" + (++ttSeq);
      var term = el.querySelector(".tt-t");
      var b = document.createElement("button"); b.type = "button"; b.className = "tt-b";
      if (term) { while (term.firstChild) b.appendChild(term.firstChild); term.parentNode.removeChild(term); } else b.textContent = el.getAttribute("data-term");
      b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", id);
      var p = document.createElement("span"); p.className = "tt-p"; p.id = id; p.hidden = true;
      while (el.firstChild) p.appendChild(el.firstChild);
      el.appendChild(b); el.appendChild(p);
      // punctuation right after the term stays on its line
      var nx = el.nextSibling, mp = nx && nx.nodeType === 3 && /^[.,;:)”]+/.exec(nx.data);
      if (mp) { nx.data = nx.data.slice(mp[0].length); var w = document.createElement("span"); w.className = "tt-w"; el.parentNode.insertBefore(w, el); w.appendChild(el); w.appendChild(document.createTextNode(mp[0])); }
      b.addEventListener("click", function (e) { e.stopPropagation(); if (TT && TT.el === el && TT.pinned) tipHide(false); else tipShow(el, true); });
      el.addEventListener("mouseenter", function () { clearTimeout(ttHideT); if (TT_HOVER.matches && !(TT && TT.pinned)) tipShow(el, false); });
      el.addEventListener("mouseleave", function () { if (TT && TT.el === el && !TT.pinned) { clearTimeout(ttHideT); ttHideT = setTimeout(function () { tipHide(false); }, 200); } });
      el.addEventListener("focusout", function (e) { if (TT && TT.el === el && !el.contains(e.relatedTarget)) tipHide(false); });
    });
  }
  function tipShow(el, pin) {
    if (TT && TT.el !== el) tipHide(false);
    var b = el.querySelector(".tt-b"), p = el.querySelector(".tt-p");
    TT = { el: el, pinned: pin || !!(TT && TT.pinned) }; b.setAttribute("aria-expanded", "true");
    if (p.hidden) { p.hidden = false; tipPlace(); void p.offsetWidth; p.classList.add("on"); } else tipPlace();
  }
  function tipHide(refocus) {
    if (!TT) return; var el = TT.el; TT = null; clearTimeout(ttHideT);
    var b = el.querySelector(".tt-b"), p = el.querySelector(".tt-p");
    b.setAttribute("aria-expanded", "false"); p.classList.remove("on"); p.hidden = true; if (refocus) b.focus();
  }
  function tipPlace() {
    if (!TT) return; var b = TT.el.querySelector(".tt-b"), p = TT.el.querySelector(".tt-p"), r = b.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    if (r.bottom < 0 || r.top > vh || !r.width) { tipHide(false); return; }
    var w = p.offsetWidth, h = p.offsetHeight, x = Math.max(16, Math.min(r.left, vw - 16 - w));
    var y = r.bottom + 10; if (y + h > vh - 8 && r.top - 10 - h >= 8) y = r.top - 10 - h;
    p.style.left = Math.round(x) + "px"; p.style.top = Math.round(y) + "px";
  }
  document.addEventListener("keydown", function (e) { if (e.key !== "Escape" || !TT) return; e.stopImmediatePropagation(); tipHide(TT.el.contains(document.activeElement)); }, true);
  document.addEventListener("click", function (e) { if (TT && !TT.el.contains(e.target)) tipHide(false); });
  window.addEventListener("scroll", tipPlace, { passive: true, capture: true });
  window.addEventListener("resize", tipPlace);
  tipsInit(document);

  /* ---------- source notes: <a class="src" data-src="…"> ---------- */
  var tip = document.createElement("div"); tip.id = "src-tip"; tip.setAttribute("role", "tooltip"); tip.hidden = true; document.body.appendChild(tip);
  var cur = null;
  function show(a) {
    cur = a; tip.innerHTML = "<b>" + (FIL ? "Pinagmulan" : "Source") + "</b>"; tip.appendChild(document.createTextNode(a.getAttribute("data-src"))); tip.hidden = false;
    var r = a.getBoundingClientRect(), t = tip.getBoundingClientRect(), m = 16;
    var x = Math.min(Math.max(m, r.left), innerWidth - m - t.width), y = r.top - t.height - 8; if (y < m) y = r.bottom + 8;
    tip.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function hide() { cur = null; tip.hidden = true; }
  Array.prototype.forEach.call(document.querySelectorAll("a.src"), function (a) {
    a.addEventListener("mouseenter", function () { show(a); }); a.addEventListener("mouseleave", function () { if (document.activeElement !== a) hide(); });
    a.addEventListener("focus", function () { show(a); }); a.addEventListener("blur", hide);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && cur) hide(); });
  window.addEventListener("scroll", function () { if (cur) { if (document.activeElement === cur || cur.matches(":hover")) show(cur); else hide(); } }, { passive: true });

  /* ---------- outside links open in a new tab, and say so to screen readers ---------- */
  var note = document.createElement("span"); note.id = "ext-note"; note.hidden = true; note.textContent = FIL ? "magbubukas sa bagong tab" : "opens in a new tab"; document.body.appendChild(note);
  Array.prototype.forEach.call(document.querySelectorAll("a[href^='http']"), function (a) {
    if (a.origin === location.origin) return;
    a.target = "_blank"; a.rel = "noopener noreferrer";
    if (!a.querySelector(".sr")) a.setAttribute("aria-describedby", ((a.getAttribute("aria-describedby") || "") + " ext-note").trim());
  });


  /* ---------- share (same as gregor-posadas.github.io, plus LinkedIn, Facebook and WhatsApp) ----------
     Share to story: a 1080 x 1920 card through the phone's share sheet (Instagram Stories is a target), or a download
     where the browser cannot share files. The link is copied too, for Instagram's Link sticker. */
  (function () {
    var btn = $("share-btn"); if (!btn) return;
    var T = FIL ? { h: "Ibahagi ang pagtitipon", story: "Ibahagi sa Instagram story", dl: "I-download ang story image", link: "Iba pang app", copy: "Kopyahin ang link", copied: "Nakopya ang link.", nocopy: "Hindi makopya. Piliin at kopyahin ang link sa itaas.", close: "Isara", alt: "Story card ng pagtitipon", urlLabel: "Link ng pahinang ito", on: "Ibahagi sa", note: "Piliin ang Instagram, saka Story. Nakopya rin ang link, kaya maaari mo itong idagdag gamit ang Link sticker.", noteDesk: "Para sa Instagram Stories: i-download ang larawan, i-post ito mula sa iyong telepono, at magdagdag ng Link sticker na may link sa itaas.", toast: "Nakopya ang link. Idagdag ito gamit ang Link sticker sa Instagram.", newtab: " (magbubukas sa bagong tab)", post: "Mungkahing post", postNote: "Lalabas na ito sa LinkedIn at WhatsApp. Sa Facebook, kinokopya namin ito para i-paste mo.", copyPost: "Kopyahin ang post", postCopied: "Nakopya ang post.", fbToast: "Nakopya ang post. I-paste ito sa Facebook.", preparing: "Inihahanda ang story image…", sharePost: "Ibahagi ang post sa isang app", postNoteMobile: "Piliin ang LinkedIn, Facebook, WhatsApp o anumang app. Kinokopya rin namin ang post, kaya maaari mo itong i-paste kung hindi ito lumabas.", postShared: "Nakopya rin ang post kung sakaling kailangan mo itong i-paste." }
                : { h: "Share the event", story: "Share to Instagram story", dl: "Download story image", link: "Other apps", copy: "Copy link", copied: "Link copied.", nocopy: "Could not copy. Select and copy the link above.", close: "Close", alt: "Story card for the event", urlLabel: "Link to this page", on: "Share on", note: "Pick Instagram, then Story. The link is copied too, so you can add it with a Link sticker.", noteDesk: "For Instagram Stories: download the image, post it from your phone, and add a Link sticker with the link above.", toast: "Link copied. Add it with a Link sticker in Instagram.", newtab: " (opens in a new tab)", post: "Suggested post", postNote: "LinkedIn and WhatsApp open with this already filled in. For Facebook, we copy it so you can paste it.", copyPost: "Copy post text", postCopied: "Post text copied.", fbToast: "Post text copied. Paste it into your Facebook post.", preparing: "Preparing the story image…", sharePost: "Share the post to an app", postNoteMobile: "Pick LinkedIn, Facebook, WhatsApp or any other app. The post text is copied too, so you can paste it if an app leaves it out.", postShared: "The post text is copied too, in case you need to paste it." };
    // Ready-made words for the post, so sharing takes one click. Edit them in the dialog before posting.
    var SUPPORT = /\/support\/?$/.test(btn.getAttribute("data-url") || "");
    var POST = FIL
      ? "Sa Lunes, Nobyembre 9, darating sa UC Berkeley si Dr. Mahar Lagmay, ang siyentipiko sa likod ng pambansang flood hazard maps ng Pilipinas (Project NOAH), para sa isang libreng pampublikong talakayan kasama ang mga historyador na sina Dr. Lisandro Claudio at Dr. Diana Martinez. Bakit paulit-ulit na binabaha ang Pilipinas, sino ang nagbabayad, at ano ang magagawa natin dito sa Bay Area? Sa Banatao Auditorium, at may livestream. Bukas sa lahat. Mag-RSVP dito"
      : SUPPORT
      ? "We're bringing Dr. Mahar Lagmay, who leads the Philippines' national flood mapping program (Project NOAH), to UC Berkeley on November 9 for a free public conversation on why the Philippines keeps flooding, with historians Dr. Lisandro Claudio and Dr. Diana Martinez. The talk is free for everyone. His flight, the room and the reception are covered, and it still needs sponsors for the speakers' honoraria and his rides around the Bay Area. If your organization can help, here is how"
      : "On Monday, November 9, Dr. Mahar Lagmay, the scientist behind the Philippines' national flood hazard maps (Project NOAH), comes to UC Berkeley for a free public conversation with historians Dr. Lisandro Claudio and Dr. Diana Martinez. Why does the Philippines keep flooding, who pays for it, and what can we in the Bay Area do? In Banatao Auditorium and livestreamed. Everyone is welcome. RSVP here";
    var TAGS = "#Philippines #Flooding #ClimateAdaptation #DisasterResilience #UCBerkeley #FilipinoAmerican";
    var url = btn.getAttribute("data-url"), card = btn.getAttribute("data-card"), title = btn.getAttribute("data-title"), file = null;
    btn.insertAdjacentHTML("afterbegin", icon("share"));
    function postText() { var ta = dlg && dlg.querySelector(".sh__post"); return ta ? ta.value : POST + ": " + url; }
    // LinkedIn's composer takes the text (with the link in it); Facebook's sharer only takes the link, so the text is copied for pasting.
    function netUrl(k) {
      var t = postText();
      if (k === "linkedin") return "https://www.linkedin.com/feed/?shareActive=true&text=" + encodeURIComponent(t + "\n\n" + TAGS);
      if (k === "facebook") return "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
      return "https://wa.me/?text=" + encodeURIComponent(t);
    }
    var nets = [["linkedin", "LinkedIn"], ["facebook", "Facebook"], ["whatsapp", "WhatsApp"]];
    var loading = null, MOBILE = window.matchMedia("(pointer: coarse)").matches && !!navigator.share;
    function load() {
      if (file || loading || !window.fetch || typeof File === "undefined") return loading;
      loading = fetch(card).then(function (r) { return r.blob(); }).then(function (b) {
        file = new File([b], card.split("/").pop(), { type: "image/jpeg" });
        if (dlg && dlg.open) paint();   // the dialog was opened before the image arrived
      }).catch(function () { loading = null; });
      return loading;
    }
    function canShareFile() { return !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); }
    // On phones, fetch the story image as soon as the page loads, so it is ready the moment someone taps Share:
    // a phone only opens its share sheet straight from a tap, so there's no time to fetch it then.
    if (MOBILE) load();
    btn.addEventListener("pointerenter", load); btn.addEventListener("focus", load);
    function copy() { try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(url); } catch (e) {} return Promise.reject(); }
    function toast(msg) { var t = $("toast"); if (!t) return; t.textContent = msg; t.classList.add("is-on"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("is-on"); }, 6000); }
    var dlg = null, status = null;
    function build() {
      dlg = document.createElement("dialog"); dlg.className = "sh"; dlg.setAttribute("aria-labelledby", "sh-h");
      dlg.innerHTML = '<h2 id="sh-h">' + T.h + '</h2><div class="sh__body"><img class="sh__img" alt="' + T.alt + '" width="216" height="384">' +
        '<div><label class="sh__label" for="sh-url">' + T.urlLabel + '</label><input class="sh__url" id="sh-url" type="text" readonly value="' + url + '">' +
        '<div class="actions sh__actions"><button type="button" class="btn btn--solid sh__story">' + icon("instagram") + T.story + '</button><a class="btn btn--solid sh__dl" download>' + icon("instagram") + T.dl + '</a>' +
        '<button type="button" class="btn sh__copy">' + icon("link") + T.copy + '</button></div><p class="sh__note sh__ig"></p>' +
        '<label class="sh__label sh__on" for="sh-post">' + T.post + '</label><textarea class="sh__post" id="sh-post" rows="5"></textarea><p class="sh__note">' + (MOBILE ? T.postNoteMobile : T.postNote) + '</p>' +
        (MOBILE ? '<div class="actions sh__nets"><button type="button" class="btn btn--solid sh__sharepost">' + icon("share") + T.sharePost + '</button></div>' : "") +
        '<div class="actions sh__nets">' + nets.map(function (n) {
          return '<a class="btn sh__net" data-net="' + n[0] + '" href="#" target="_blank" rel="noopener">' + icon(n[0]) + n[1] + '<span class="sr">' + T.newtab + '</span></a>';
        }).join("") + '<button type="button" class="btn sh__copypost">' + icon("link") + T.copyPost + '</button><button type="button" class="btn sh__link">' + icon("share") + T.link + '</button></div>' +
        '<p class="sh__status" aria-live="polite"></p><div class="actions sh__end"><button type="button" class="btn btn--quiet sh__close">' + T.close + '</button></div></div></div>';
      document.body.appendChild(dlg);
      status = dlg.querySelector(".sh__status");
      dlg.querySelector(".sh__close").addEventListener("click", function () { dlg.close(); });
      dlg.querySelector(".sh__url").addEventListener("focus", function (e) { e.target.select(); });
      dlg.querySelector(".sh__copy").addEventListener("click", function () { copy().then(function () { status.textContent = T.copied; }, function () { status.textContent = T.nocopy; dlg.querySelector(".sh__url").select(); }); });
      dlg.querySelector(".sh__post").value = POST + ": " + url;
      // Fill each network's link at the moment of the click, so edits to the post are included.
      Array.prototype.forEach.call(dlg.querySelectorAll(".sh__net"), function (a) {
        a.addEventListener("click", function () {
          var k = a.getAttribute("data-net"); a.href = netUrl(k);
          if (k === "facebook") { try { navigator.clipboard.writeText(postText()).then(function () { toast(T.fbToast); }, function () {}); } catch (e) {} }
        });
        a.href = netUrl(a.getAttribute("data-net"));
      });
      dlg.querySelector(".sh__copypost").addEventListener("click", function () {
        try { navigator.clipboard.writeText(postText()).then(function () { status.textContent = T.postCopied; }, function () { dlg.querySelector(".sh__post").select(); }); } catch (e) { dlg.querySelector(".sh__post").select(); }
      });
      dlg.querySelector(".sh__link").addEventListener("click", function () { navigator.share({ title: title, text: postText() }).catch(function () {}); });
      // Phones: the system share sheet is what actually hands the words and link to LinkedIn, Facebook and WhatsApp's apps
      // (their web links only open the app). Share first, while the tap still counts, then copy the post as a backup.
      var sp = dlg.querySelector(".sh__sharepost");
      if (sp) sp.addEventListener("click", function () {
        var t = postText(), body = t.split(url).join("").replace(/\s+$/, "");
        navigator.share({ title: title, text: body, url: url }).catch(function () {});
        try { navigator.clipboard.writeText(t).then(function () { status.textContent = T.postShared; }, function () {}); } catch (e) {}
      });
      dlg.querySelector(".sh__story").addEventListener("click", function () {
        if (!canShareFile()) return;
        navigator.share({ files: [file] }).catch(function () {});   // first, while the tap still counts
        copy().then(function () { toast(T.toast); }, function () {});
      });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener("close", function () { btn.focus(); });
    }
    function paint() {
      var fileOK = canShareFile(), waiting = MOBILE && !file && !!loading, story = dlg.querySelector(".sh__story");
      // Show only what this device can do. On a phone still fetching the image, show the story button as "preparing".
      story.hidden = !(fileOK || waiting); dlg.querySelector(".sh__dl").hidden = fileOK || waiting;
      story.disabled = !fileOK;
      story.lastChild.nodeValue = fileOK ? T.story : T.preparing;
      dlg.querySelector(".sh__link").hidden = !navigator.share || MOBILE;
      Array.prototype.forEach.call(dlg.querySelectorAll(".sh__net"), function (a) { a.hidden = MOBILE; });
      dlg.querySelector(".sh__ig").textContent = (fileOK || waiting) ? T.note : T.noteDesk;
    }
    btn.addEventListener("click", function () {
      if (!dlg) build();
      load();
      var fileOK = canShareFile();
      dlg.querySelector(".sh__img").src = card; dlg.querySelector(".sh__dl").href = card;
      paint();
      status.textContent = "";
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      (fileOK ? dlg.querySelector(".sh__story") : dlg.querySelector(".sh__copy")).focus();
    });
  })();

  Array.prototype.forEach.call(document.querySelectorAll('a.btn[href^="mailto:"]'), function (a) { a.insertAdjacentHTML("afterbegin", icon("mail")); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-icon]"), function (a) { a.insertAdjacentHTML("afterbegin", icon(a.getAttribute("data-icon"))); });
  /* ---------- email links: copy the address and say so, instead of jumping straight into a mail app ----------
     A plain mailto: link opens whatever app the computer is set to (often Outlook). Here a click copies the address,
     shows it in a small box in the middle of the screen, and offers Gmail or the computer's own email app. */
  (function () {
    var box = null, timer = null, lastLink = null;
    var T = FIL ? { copied: "Nakopya ang email address!", nocopy: "Kopyahin ang email address na ito:", gmail: "Sumulat sa Gmail", app: "Buksan ang email app", close: "Isara", newtab: " (magbubukas sa bagong tab)" }
                : { copied: "Email address copied!", nocopy: "Copy this email address:", gmail: "Write in Gmail", app: "Open your email app", close: "Close", newtab: " (opens in a new tab)" };
    function hide() { if (!box) return; box.hidden = true; clearTimeout(timer); }
    function show(href) {
      var m = /^mailto:([^?]+)(?:\?(.*))?$/i.exec(href); if (!m) return false;
      var to = decodeURIComponent(m[1]), q = {};
      (m[2] || "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) q[kv.slice(0, i).toLowerCase()] = decodeURIComponent(kv.slice(i + 1)); });
      var gmail = "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to) + (q.subject ? "&su=" + encodeURIComponent(q.subject) : "");
      if (!box) {
        box = document.createElement("div"); box.className = "mailbox"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); box.hidden = true;
        document.body.appendChild(box);
        box.addEventListener("mouseenter", function () { clearTimeout(timer); });
        box.addEventListener("focusin", function () { clearTimeout(timer); });
        box.addEventListener("click", function (e) { if (e.target.closest(".mailbox__close")) { hide(); if (lastLink) lastLink.focus(); } });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape" && box && !box.hidden) { hide(); if (lastLink) lastLink.focus(); } });
      }
      function paint(ok) {
        box.innerHTML = '<p class="mailbox__msg">' + icon(ok ? "mail" : "link") + "<b>" + (ok ? T.copied : T.nocopy) + '</b></p><p class="mailbox__addr">' + to.replace(/[&<>"]/g, "") + "</p>" +
          '<div class="mailbox__acts"><a class="btn btn--solid" href="' + gmail.replace(/"/g, "&quot;") + '" target="_blank" rel="noopener">' + T.gmail + '<span class="sr">' + T.newtab + "</span></a>" +
          '<a class="btn" href="' + href.replace(/"/g, "&quot;") + '" data-plain-mail="1">' + T.app + '</a><button type="button" class="btn btn--quiet mailbox__close">' + T.close + "</button></div>";
        box.hidden = false; clearTimeout(timer); timer = setTimeout(hide, 7000);
        if (!ok) { var r = document.createRange(); r.selectNodeContents(box.querySelector(".mailbox__addr")); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      }
      try { navigator.clipboard.writeText(to).then(function () { paint(true); }, function () { paint(false); }); } catch (e) { paint(false); }
      return true;
    }
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="mailto:"]');
      if (!a || a.hasAttribute("data-plain-mail") || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (show(a.getAttribute("href"))) { e.preventDefault(); lastLink = a; }
    });
  })();

  /* In-person seats, from the map data: a bar of seats taken (solid) against seats still open (empty paper), the same
     encoding as the funding gauge, with the numbers in words beside it. The sentence turns bold when few are left or none. */
  function seats(d) {
    var el = document.getElementById("ev-seats"); if (!el || !d || !d.seats) return;
    var fil = document.documentElement.lang === "fil", s = d.seats, cap = s.capacity, t = el.querySelector(".ev-seats__t");
    var taken = Math.min(cap, s.taken), left = Math.max(0, s.left), wait = (d.attend && d.attend.waitlist) || 0;
    var full = left <= 0, few = !full && left <= 50, pct = (taken / cap * 100).toFixed(2);
    el.classList.toggle("is-full", full); el.classList.toggle("is-few", few);
    if (full) t.innerHTML = fil ? "<b>Puno na.</b> Kinuha na ang lahat ng " + cap + " na upuan sa Banatao Auditorium. Mag-RSVP pa rin para sa waitlist, o para makuha ang link ng livestream."
                                : "<b>Full.</b> All " + cap + " in-person seats in Banatao Auditorium are taken. RSVP anyway to join the waitlist, or to get the livestream link.";
    else if (few) t.innerHTML = fil ? "<b>" + left + " na upuan na lang</b> ang natitira sa " + cap + ". Ayon sa pagkakasunod ng RSVP ang mga upuan."
                                    : "<b>Only " + left + " of " + cap + " seats left</b> in Banatao Auditorium. Seats go in the order people RSVP.";
    var L = fil ? { left: left === 1 ? "upuang bakante" : "upuang bakante", taken: "nakuha na", of: "sa " + cap + " na upuan", wait: "sa waitlist", kTaken: "Nakuha na", kOpen: "Bakante pa",
                    aria: taken + " sa " + cap + " na upuan ang nakuha na; " + left + " pa ang bakante" + (wait ? "; " + wait + " sa waitlist" : "") + "." }
                  : { left: left === 1 ? "seat left" : "seats left", taken: "taken", of: "of " + cap + " seats", wait: "on the waitlist", kTaken: "Taken", kOpen: "Still open",
                    aria: taken + " of " + cap + " seats taken; " + left + " still open" + (wait ? "; " + wait + " on the waitlist" : "") + "." };
    var g = el.querySelector(".ev-seats__g");
    if (!g) { g = document.createElement("div"); g.className = "gauge ev-seats__g"; el.appendChild(g); }
    g.innerHTML = '<div class="gauge__nums"><span><b>' + left + "</b> " + L.left + "</span><span><b>" + taken + "</b> " + L.taken + "</span><span>" + L.of + "</span>" +
      (wait ? "<span><b>" + wait + "</b> " + L.wait + "</span>" : "") + "</div>" +
      '<div class="gauge__bar" role="img" aria-label="' + L.aria + '"><span class="gauge__seg gauge__seg--secured" style="width:' + pct + '%"></span></div>' +
      '<ul class="gauge__key" aria-hidden="true"><li><i class="k-secured"></i>' + L.kTaken + '</li><li><i class="k-gap"></i>' + L.kOpen + "</li></ul>";
  }

  window.EV_SITE = { theme: theme, tick: tick, tipsInit: tipsInit, icon: icon, seats: seats };
})();
