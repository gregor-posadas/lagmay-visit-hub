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


  /* ---------- share (same as gregor-posadas.github.io, plus LinkedIn, Facebook and WhatsApp) ----------
     Share to story: a 1080 x 1920 card through the phone's share sheet (Instagram Stories is a target), or a download
     where the browser cannot share files. The link is copied too, for Instagram's Link sticker. */
  (function () {
    var btn = $("share-btn"); if (!btn) return;
    var T = FIL ? { h: "Ibahagi ang pagtitipon", story: "Ibahagi sa Instagram story", dl: "I-download ang story image", link: "Iba pang app", copy: "Kopyahin ang link", copied: "Nakopya ang link.", nocopy: "Hindi makopya. Piliin at kopyahin ang link sa itaas.", close: "Isara", alt: "Story card ng pagtitipon", urlLabel: "Link ng pahinang ito", on: "Ibahagi sa", note: "Kinokopya rin ng Ibahagi sa story ang link, kaya sa Instagram ay maaari kang magdagdag ng Link sticker at i-paste ito.", noteDesk: "Para sa Instagram Stories: i-download ang larawan, i-post ito mula sa iyong telepono, at magdagdag ng Link sticker na may link sa itaas.", toast: "Nakopya ang link. Idagdag ito gamit ang Link sticker sa Instagram.", newtab: " (magbubukas sa bagong tab)", msg: "Libreng talakayan tungkol sa baha sa Pilipinas, kasama si Dr. Mahar Lagmay, Nob 9 sa UC Berkeley:" }
                : { h: "Share the event", story: "Share to Instagram story", dl: "Download story image", link: "Other apps", copy: "Copy link", copied: "Link copied.", nocopy: "Could not copy. Select and copy the link above.", close: "Close", alt: "Story card for the event", urlLabel: "Link to this page", on: "Share on", note: "Share to story also copies the link, so in Instagram you can add a Link sticker and paste it.", noteDesk: "For Instagram Stories: download the image, post it from your phone, and add a Link sticker with the link above.", toast: "Link copied. Add it with a Link sticker in Instagram.", newtab: " (opens in a new tab)", msg: "A free public conversation on flooding in the Philippines with Dr. Mahar Lagmay, Nov 9 at UC Berkeley:" };
    var url = btn.getAttribute("data-url"), card = btn.getAttribute("data-card"), title = btn.getAttribute("data-title"), file = null;
    var nets = [
      ["LinkedIn", "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url)],
      ["Facebook", "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url)],
      ["WhatsApp", "https://wa.me/?text=" + encodeURIComponent(T.msg + " " + url)]
    ];
    function load() {
      if (file || !window.fetch || typeof File === "undefined") return;
      fetch(card).then(function (r) { return r.blob(); }).then(function (b) { file = new File([b], card.split("/").pop(), { type: "image/jpeg" }); }).catch(function () {});
    }
    function canShareFile() { return !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); }
    if (window.matchMedia("(pointer: coarse)").matches) { if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 4000 }); else setTimeout(load, 2500); }
    btn.addEventListener("pointerenter", load); btn.addEventListener("focus", load);
    function copy() { try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(url); } catch (e) {} return Promise.reject(); }
    function toast(msg) { var t = $("toast"); if (!t) return; t.textContent = msg; t.classList.add("is-on"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("is-on"); }, 6000); }
    var dlg = null, status = null;
    function build() {
      dlg = document.createElement("dialog"); dlg.className = "sh"; dlg.setAttribute("aria-labelledby", "sh-h");
      dlg.innerHTML = '<h2 id="sh-h">' + T.h + '</h2><div class="sh__body"><img class="sh__img" alt="' + T.alt + '" width="216" height="384">' +
        '<div><label class="sh__label" for="sh-url">' + T.urlLabel + '</label><input class="sh__url" id="sh-url" type="text" readonly value="' + url + '">' +
        '<div class="actions sh__actions"><button type="button" class="btn btn--solid sh__story">' + T.story + '</button><a class="btn btn--solid sh__dl" download>' + T.dl + '</a>' +
        '<button type="button" class="btn sh__copy">' + T.copy + '</button></div>' +
        '<p class="sh__label sh__on">' + T.on + '</p><div class="actions sh__nets">' + nets.map(function (n) {
          return '<a class="btn" href="' + n[1] + '" target="_blank" rel="noopener">' + n[0] + '<span class="sr">' + T.newtab + '</span></a>';
        }).join("") + '<button type="button" class="btn sh__link">' + T.link + '</button></div>' +
        '<p class="sh__status" aria-live="polite"></p><p class="sh__note"></p><div class="actions sh__end"><button type="button" class="btn btn--quiet sh__close">' + T.close + '</button></div></div></div>';
      document.body.appendChild(dlg);
      status = dlg.querySelector(".sh__status");
      dlg.querySelector(".sh__close").addEventListener("click", function () { dlg.close(); });
      dlg.querySelector(".sh__url").addEventListener("focus", function (e) { e.target.select(); });
      dlg.querySelector(".sh__copy").addEventListener("click", function () { copy().then(function () { status.textContent = T.copied; }, function () { status.textContent = T.nocopy; dlg.querySelector(".sh__url").select(); }); });
      dlg.querySelector(".sh__link").addEventListener("click", function () { navigator.share({ title: title, text: T.msg, url: url }).catch(function () {}); });
      dlg.querySelector(".sh__story").addEventListener("click", function () { copy().then(function () { toast(T.toast); }, function () {}); navigator.share({ files: [file], title: title }).catch(function () {}); });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener("close", function () { btn.focus(); });
    }
    btn.addEventListener("click", function () {
      if (!dlg) build();
      load();
      var fileOK = canShareFile();
      dlg.querySelector(".sh__img").src = card; dlg.querySelector(".sh__dl").href = card;
      dlg.querySelector(".sh__story").hidden = !fileOK; dlg.querySelector(".sh__dl").hidden = fileOK;   // show only what this device can do
      dlg.querySelector(".sh__link").hidden = !navigator.share;
      dlg.querySelector(".sh__note").textContent = fileOK ? T.note : T.noteDesk;
      status.textContent = "";
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      (fileOK ? dlg.querySelector(".sh__story") : dlg.querySelector(".sh__copy")).focus();
    });
  })();

  window.EV_SITE = { theme: theme, tick: tick, tipsInit: tipsInit };
})();
