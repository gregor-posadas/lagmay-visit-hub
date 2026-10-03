/* The RSVP page: points its buttons at the Google Form in config.js and embeds the form. */
(function () {
  var cfg = window.EV_CONFIG || {}, url = cfg.rsvpUrl || "", FIL = document.documentElement.lang === "fil";
  var links = Array.prototype.slice.call(document.querySelectorAll(".js-rsvp"));
  var frame = document.getElementById("rv-iframe"), note = document.getElementById("rv-note");
  if (!/^https:\/\//.test(url)) {
    // No form yet: say so instead of linking nowhere.
    links.forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); var t = document.getElementById("toast"); if (t) { t.textContent = FIL ? "Malapit nang buksan ang RSVP form. Bumalik sa loob ng ilang araw." : "The RSVP form opens soon. Check back in a few days."; t.classList.add("is-on"); setTimeout(function () { t.classList.remove("is-on"); }, 3200); } });
    });
    if (note) note.textContent = FIL ? "Malapit nang buksan ang RSVP form. Bumalik sa loob ng ilang araw." : "The RSVP form opens soon. Check back in a few days.";
    return;
  }
  links.forEach(function (a) { a.href = url; a.target = "_blank"; a.rel = "noopener"; });
  // Seats left, from the same anonymous counts the map uses.
  if (cfg.apiUrl && window.EV_SITE && window.EV_SITE.seats) {
    fetch(cfg.apiUrl + (cfg.apiUrl.indexOf("?") > -1 ? "&" : "?") + "action=map", { redirect: "follow" })
      .then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) window.EV_SITE.seats(j.data); }).catch(function () {});
  }
  if (frame) {
    frame.src = url + (url.indexOf("?") < 0 ? "?" : "&") + "embedded=true";
    frame.hidden = false;
  }
})();
