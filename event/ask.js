/* The Ask the speakers page: sends one question to the backend (action "ask"). No name or email. The hidden "website"
   field is for bots; people never see it. Questions land in the hub, where the team picks some for the moderator. */
(function () {
  var cfg = window.EV_CONFIG || {}, FIL = document.documentElement.lang === "fil";
  var form = document.getElementById("ask-form"); if (!form) return;
  var q = document.getElementById("ask-q"), err = document.getElementById("ask-err"), done = document.getElementById("ask-done"),
    send = document.getElementById("ask-send"), hp = document.getElementById("ask-web");
  var T = FIL ? { empty: "Pakisulat muna ang tanong mo.", sending: "Ipinapadala…", send: "Ipadala ang tanong", another: "Magpadala ng isa pa",
      thanks: "Salamat, natanggap na namin ang tanong mo. May iba ka pang tanong? Isulat lang ulit sa itaas.",
      failed: "Hindi ito naipadala. Subukan ulit, o i-email ang tanong sa gregorposadas@berkeley.edu." }
    : { empty: "Please write your question first.", sending: "Sending…", send: "Send question", another: "Send another",
      thanks: "Thank you, your question is in. Have another? Just write it above.",
      failed: "That didn't send. Please try again, or email your question to gregorposadas@berkeley.edu." };
  function showErr(m) { err.textContent = m || ""; err.hidden = !m; if (m) q.setAttribute("aria-invalid", "true"); else q.removeAttribute("aria-invalid"); }
  q.addEventListener("input", function () { if (!err.hidden) showErr(""); done.textContent = ""; });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = q.value.replace(/\s+/g, " ").trim();
    if (text.length < 5) { showErr(T.empty); q.focus(); return; }
    if (!cfg.apiUrl) { showErr(T.failed); return; }
    send.disabled = true; send.textContent = T.sending; showErr("");
    fetch(cfg.apiUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "ask", question: text, website: hp ? hp.value : "", lang: FIL ? "fil" : "en" }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || "");
        q.value = ""; done.textContent = T.thanks; send.textContent = T.another; send.disabled = false;
      })
      .catch(function (e2) { showErr(e2 && e2.message && !/fetch|network|JSON/i.test(e2.message) ? e2.message : T.failed); send.disabled = false; send.textContent = T.send; });
  });
})();
