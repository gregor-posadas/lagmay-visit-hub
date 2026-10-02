/* When the Waters Rise: what every page of the event site shares.
   Theme switch, click sounds, term notes (an underlined term opens a short plain-language note; same as BahaWatch
   and gregor-posadas.github.io), and source notes (hovering or focusing a cited phrase names its source). */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = { get: function (k) { try { return localStorage.getItem("lv." + k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem("lv." + k, v); } catch (e) { /* ignore */ } } };
  var FIL = document.documentElement.lang === "fil";

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

  window.EV_SITE = { theme: theme, tick: tick, tipsInit: tipsInit };
})();
