/* Lagmay Visit Hub: assignments, funding, contacts, meetings and files for the team bringing
   Dr. Mahar Lagmay to Berkeley and Stanford in November 2026.
   Data comes from a Google Apps Script web app (see apps-script/Code.gs),
   or from data/demo.json when no apiUrl is set in assets/config.js. */
(function () {
  "use strict";

  var cfg = window.LV_CONFIG || {};
  var TZ = cfg.timeZone || "America/Los_Angeles";
  var DAY = 86400000;
  var APP = "Lagmay Visit Hub";
  var main = document.getElementById("main");
  var state = { data: null, demo: !cfg.apiUrl, error: "" };

  /* ---------- small helpers ---------- */
  var store = {
    get: function (k) { try { return window.localStorage.getItem("lv." + k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem("lv." + k, v); } catch (e) { /* private mode */ } },
    del: function (k) { try { window.localStorage.removeItem("lv." + k); } catch (e) { /* ignore */ } }
  };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }
  function safeEmail(e) { return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(e || "").trim()) ? String(e).trim() : ""; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; } return null; }
  function member(id) { return byId(state.data.members, id) || { id: id, name: id || "No one yet", color: "#6b6b6b", textColor: "#fff", role: "" }; }
  function project(id) { return byId(state.data.projects, id) || { id: id, name: "No workstream" }; }
  function first(name) { return String(name || "").split(" ")[0]; }
  function initial(name) { return esc(String(name || "?").charAt(0).toUpperCase()); }
  function newId(prefix) { return prefix + "-" + Math.random().toString(36).slice(2, 9); }
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[$,\s]/g, "")); return isFinite(n) ? n : 0; }
  function money(n) { return "$" + Math.round(num(n)).toLocaleString("en-US"); }
  function upsert(list, item) { var i = list.findIndex(function (x) { return x.id === item.id; }); if (i > -1) list[i] = item; else list.push(item); }
  function demoNote(r) { return r && r.demo ? " (demo, not saved)" : ""; }

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("is-on"); }, 3200);
  }

  /* ---------- dates (always shown in the team's time zone) ---------- */
  function parts(date) {
    var f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    var o = {}; f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function dayNumber(date) { var p = parts(date); return Date.UTC(+p.year, +p.month - 1, +p.day) / DAY; }
  function todayStr() { var p = parts(new Date()); return p.year + "-" + p.month + "-" + p.day; }
  function fmtDay(date, withYear) {
    return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: withYear ? "numeric" : undefined }).format(date);
  }
  function fmtTime(date) { return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(date); }
  /* A plain calendar date ("2026-10-06") shown as "Tue, Oct 6", without time-zone drift. */
  function dateOnly(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 20)) : null; }
  function fmtDate(s) { var d = dateOnly(s); return d ? fmtDay(d) : ""; }
  function daysFromToday(s) { var d = dateOnly(s); return d ? dayNumber(d) - dayNumber(new Date()) : null; }
  function due(a) { return a && a.due ? new Date(a.due) : null; }
  function relDue(d, done) {
    if (!d) return "No due date";
    var now = new Date(), diff = dayNumber(d) - dayNumber(now);
    if (done) return "Done";
    if (d < now) {
      var hours = Math.round((now - d) / 3600000);
      if (hours < 24) return hours <= 1 ? "Overdue by 1 hour" : "Overdue by " + hours + " hours";
      var days = Math.max(1, -diff);
      return "Overdue by " + days + (days === 1 ? " day" : " days");
    }
    if (diff === 0) return parts(d).hour >= "18" ? "Due tonight" : "Due today";
    if (diff === 1) return "Due tomorrow";
    if (diff < 7) return "Due in " + diff + " days";
    return "Due in " + Math.round(diff / 7) + (Math.round(diff / 7) === 1 ? " week" : " weeks");
  }
  function relDays(diff) {
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff === -1) return "yesterday";
    if (diff < 0) return -diff + " days ago";
    if (diff < 14) return "in " + diff + " days";
    return "in " + Math.round(diff / 7) + " weeks";
  }
  function tzOffsetMin(ts) {
    var p = parts(new Date(ts));
    var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return Math.round((asUTC - Math.floor(ts / 60000) * 60000) / 60000);
  }
  function zonedIso(dateStr, timeStr) {
    if (!dateStr) return "";
    var d = dateStr.split("-"), t = (timeStr || "23:59").split(":");
    var guess = Date.UTC(+d[0], +d[1] - 1, +d[2], +t[0], +t[1]);
    var off = tzOffsetMin(guess);
    off = tzOffsetMin(guess - off * 60000);
    var sign = off < 0 ? "-" : "+", abs = Math.abs(off);
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return dateStr + "T" + pad(+t[0]) + ":" + pad(+t[1]) + ":00" + sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }
  function localParts(iso, defTime) {
    if (!iso) return { date: "", time: defTime || "23:59" };
    var p = parts(new Date(iso));
    return { date: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
  }

  /* ---------- status: always a shape plus a word ---------- */
  var LABEL = { todo: "To do", doing: "In progress", done: "Done", late: "Overdue", soon: "Due soon" };
  function statusKey(a) {
    if (a.status === "done") return "done";
    var d = due(a);
    if (d && d < new Date()) return "late";
    return a.status === "doing" ? "doing" : "todo";
  }
  function shape(key) {
    var s = '<svg class="st__shape" viewBox="0 0 18 18" aria-hidden="true" focusable="false">';
    if (key === "done") s += '<circle cx="9" cy="9" r="8.5" fill="var(--st-done)"/><path d="M5 9.4l2.6 2.6L13 6.6" fill="none" stroke="var(--paper)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (key === "late") s += '<path d="M9 1.2L17.2 16.4H0.8Z" fill="var(--st-late)"/><path d="M9 6.5v4.6" stroke="var(--paper)" stroke-width="2.2" stroke-linecap="round"/><circle cx="9" cy="13.6" r="1.2" fill="var(--paper)"/>';
    else if (key === "doing") s += '<circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--st-doing)" stroke-width="2.5"/><path d="M9 1.5a7.5 7.5 0 0 1 0 15z" fill="var(--st-doing)"/>';
    else if (key === "soon") s += '<circle cx="9" cy="9" r="8" fill="var(--st-soon)" stroke="var(--st-soon-edge)" stroke-width="1"/><path d="M9 4.2V9l3.2 2" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (key === "move") s += '<circle cx="9" cy="9" r="8" fill="var(--st-soon)" stroke="var(--st-soon-edge)" stroke-width="1"/><path d="M4.8 9h7.4M9.2 5.6L12.6 9l-3.4 3.4" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (key === "no") s += '<circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--ink-2)" stroke-width="2.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="var(--ink-2)" stroke-width="2.2" stroke-linecap="round"/>';
    else s += '<circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--st-todo)" stroke-width="2.5"/>';
    return s + "</svg>";
  }
  function st(key, word) { return '<span class="st">' + shape(key) + esc(word) + "</span>"; }
  function badge(a) { var k = statusKey(a); return st(k, LABEL[k]); }

  /* Workstreams */
  function pKey(p) {
    if (p.status === "done") return "done";
    var d = due(p);
    return d && d < new Date() ? "late" : "todo";
  }
  var PLABEL = { done: "Done", late: "Past due", todo: "Open" };
  function pBadge(p) { var k = pKey(p); return st(k, PLABEL[k]); }
  function pRel(p) { var d = due(p); if (p.status === "done") return "Done"; if (!d) return ""; return relDue(d, false).replace("Overdue by", "Past due by"); }

  /* Which campus something belongs to: Berkeley is a filled tag, Stanford outlined, both a grey tag. Text carries the meaning. */
  var CAMPUS = { berkeley: "Berkeley", stanford: "Stanford", both: "Both campuses" };
  function campusTag(c, small) {
    if (!CAMPUS[c]) return "";
    return '<span class="for for--' + esc(c) + (small ? " for--sm" : "") + '">' + CAMPUS[c] + "</span>";
  }
  function bullet(m, size) {
    return '<span class="bullet' + (size ? " bullet--" + size : "") + '" style="--c:' + esc(m.color) + ";--t:" + esc(m.textColor || "#fff") + '" aria-hidden="true">' + initial(m.name) + "</span>";
  }

  /* Contacts: whose move is it? */
  var CSTAT = [["ours", "Our move"], ["theirs", "Waiting on them"], ["new", "Not contacted yet"], ["settled", "Settled"]];
  var CLABEL = {}; CSTAT.forEach(function (o) { CLABEL[o[0]] = o[1]; });
  var CSHAPE = { ours: "move", theirs: "doing", "new": "todo", settled: "done" };
  function cStatus(c) { return CLABEL[c.status] ? c.status : "new"; }
  function cLate(c) { var s = cStatus(c), d = daysFromToday(c.followUp); return (s === "ours" || s === "theirs") && d !== null && d < 0; }
  function cBadge(c) {
    if (cLate(c)) return st("late", cStatus(c) === "theirs" ? "Time to nudge" : "Follow-up overdue");
    return st(CSHAPE[cStatus(c)], CLABEL[cStatus(c)]);
  }
  function cWhen(c) {
    var d = daysFromToday(c.followUp);
    if (cStatus(c) === "settled") return c.lastContact ? "Last contact " + fmtDate(c.lastContact) : "";
    if (d === null) return "No follow-up date";
    if (d < 0) return "Follow-up was due " + relDays(d);
    return "Follow up " + relDays(d);
  }

  /* Funding: where each source stands. Only Secured and Waiting on decision count toward the gauge. */
  var FSTAT = [["secured", "Secured"], ["pending", "Waiting on decision"], ["working", "Working on it"], ["lead", "Not started"], ["declined", "Declined"]];
  var FLABEL = {}; FSTAT.forEach(function (o) { FLABEL[o[0]] = o[1]; });
  var FSHAPE = { secured: "done", pending: "soon", working: "doing", lead: "todo", declined: "no" };
  function fStatus(f) { return FLABEL[f.status] ? f.status : "lead"; }
  function fBadge(f) {
    var s = fStatus(f), dl = due(f);
    if ((s === "working" || s === "lead") && dl && dl < new Date()) return st("late", "Deadline passed");
    return st(FSHAPE[s], FLABEL[s]);
  }

  /* ---------- Google product icons on links (Google's own hosted icons; hidden if they fail to load) ---------- */
  var GICON_BASE = "https://ssl.gstatic.com/images/branding/product/1x/";
  var GICONS = { doc: "docs_2020q4_48dp.png", sheet: "sheets_2020q4_48dp.png", slides: "slides_2020q4_48dp.png", form: "forms_2020q4_48dp.png",
    drive: "drive_2020q4_48dp.png", meet: "meet_2020q4_48dp.png", calendar: "calendar_2020q4_48dp.png", gmail: "gmail_2020q4_48dp.png" };
  function gKind(url) {
    url = String(url || "");
    if (/docs\.google\.com\/document/.test(url)) return "doc";
    if (/docs\.google\.com\/spreadsheets/.test(url)) return "sheet";
    if (/docs\.google\.com\/presentation/.test(url)) return "slides";
    if (/docs\.google\.com\/forms|forms\.gle/.test(url)) return "form";
    if (/drive\.google\.com/.test(url)) return "drive";
    if (/meet\.google\.com/.test(url)) return "meet";
    if (/calendar\.google\.com/.test(url)) return "calendar";
    if (/mail\.google\.com/.test(url)) return "gmail";
    return "";
  }
  var TYPE_KIND = { "Google Doc": "doc", "Google Sheet": "sheet", "Google Slides": "slides", "Google Form": "form" };
  function gIcon(kind, small) {
    return GICONS[kind] ? '<img class="gicon' + (small ? " gicon--sm" : "") + '" src="' + GICON_BASE + GICONS[kind] + '" alt="" aria-hidden="true" width="20" height="20" onerror="this.remove()">' : "";
  }
  function iconFor(url, small) { return gIcon(gKind(url), small); }
  function extLink(url, label, cls) {
    var u = safeUrl(url); if (!u) return "";
    return '<a class="' + (cls || "btn") + '" href="' + esc(u) + '" target="_blank" rel="noopener">' + iconFor(u) + esc(label) + '<span class="sr"> (opens in a new tab)</span></a>';
  }

  /* ---------- data ---------- */
  var busyCount = 0;
  function busy(on, msg) {
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    var bar = document.getElementById("busy"), txt = document.getElementById("busy-text");
    document.documentElement.classList.toggle("is-busy", busyCount > 0);
    main.setAttribute("aria-busy", busyCount > 0 ? "true" : "false");
    if (bar) bar.hidden = busyCount === 0;
    if (txt) txt.textContent = busyCount > 0 ? (msg || "Saving") : "";
  }
  function tracked(promise, msg) {
    busy(true, msg);
    return promise.then(function (v) { busy(false); return v; }, function (e) { busy(false); throw e; });
  }
  function skeleton(msg) {
    var card = '<div class="skel skel--card"><span class="skel__dot"></span><span class="skel__lines"><i></i><i></i><i></i></span></div>';
    return '<div class="wrap"><div class="head"><p class="loading-msg" role="status">' + esc(msg || "Getting the latest from the team Sheet") + '</p><div class="skel skel--h1"></div><div class="skel skel--line"></div></div>' +
      '<div class="skel skel--bar"></div><div class="signs">' + card + card + card + card + "</div></div>";
  }
  function apiGet() {
    var url = cfg.apiUrl + (cfg.apiUrl.indexOf("?") > -1 ? "&" : "?") + "action=data&code=" + encodeURIComponent(store.get("code") || "");
    return tracked(fetch(url, { method: "GET", redirect: "follow" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) { var e = new Error(j.error || "The server said no."); e.code = j.code; throw e; }
      return j.data;
    }), "Loading");
  }
  function apiPost(body) {
    if (state.demo) return Promise.resolve({ ok: true, demo: true });
    body.code = store.get("code") || "";
    body.pmCode = store.get("pmCode") || "";
    body.who = store.get("me") || "";
    return tracked(fetch(cfg.apiUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) { var e = new Error(j.error || "The change wasn't saved."); e.code = j.code; throw e; } return j; }), "Saving");
  }
  function load() {
    var p = state.demo ? tracked(fetch("data/demo.json").then(function (r) { return r.json(); }), "Loading") : apiGet();
    return p.then(function (d) {
      ["members", "projects", "assignments", "milestones", "meetings", "contacts", "funding", "budget", "rules", "rsvps", "files", "notes"].forEach(function (k) { d[k] = d[k] || []; });
      state.data = d; state.error = "";
      showNotice();
    });
  }
  function showNotice() {
    var n = document.getElementById("notice");
    if (state.demo) {
      n.innerHTML = "<p><b>Demo mode.</b> This is sample data, and changes are not saved. Connect the Google Sheet backend to go live (see README).</p>";
      n.hidden = false;
    } else { n.hidden = true; }
    document.getElementById("foot-status").textContent = state.demo ? "Showing demo data." : "Synced with the team Google Sheet at " + fmtTime(new Date()) + ".";
  }

  /* ---------- shared bits ---------- */
  function counts(list) {
    var now = new Date(), week = new Date(now.getTime() + 7 * DAY), soon = new Date(now.getTime() + 2 * DAY), c = { late: 0, soon: 0, week: 0, doing: 0, done: 0, open: 0 };
    list.forEach(function (a) {
      var k = statusKey(a), d = due(a);
      if (k === "done") { c.done++; return; }
      c.open++;
      if (k === "late") c.late++;
      else if (d && d <= week) { c.week++; if (d <= soon) c.soon++; }
      if (a.status === "doing") c.doing++;
    });
    return c;
  }
  function sortByDue(a, b) {
    var da = due(a), db = due(b);
    if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
    return da - db;
  }
  function byFollowUp(a, b) { var x = a.followUp || "9999", y = b.followUp || "9999"; return x < y ? -1 : x > y ? 1 : String(a.name).localeCompare(String(b.name)); }
  function mine(id) { return state.data.assignments.filter(function (a) { return a.memberId === id; }).sort(sortByDue); }
  function contactsNeedingUs(list) { return list.filter(function (c) { return cStatus(c) === "ours" || cLate(c); }); }

  /* Money: what the visit costs, what is secured, and what is waiting on a decision. */
  function money_() {
    var lines = state.data.budget.filter(function (b) { return b.status !== "notneeded"; });
    var total = lines.reduce(function (s, b) { return s + num(b.amount); }, 0);
    var secured = 0, pending = 0;
    state.data.funding.forEach(function (f) {
      if (fStatus(f) === "secured") secured += num(f.amount);
      else if (fStatus(f) === "pending") pending += num(f.amount);
    });
    var unfunded = lines.filter(function (b) { var f = byId(state.data.funding, b.fundingId); return !f || ["secured", "pending"].indexOf(fStatus(f)) < 0; });
    return { total: total, secured: secured, pending: pending, gap: Math.max(0, total - secured - pending), unfunded: unfunded };
  }
  function lineCover(b) {
    if (b.status === "notneeded") return { key: "todo", word: "Not needed" };
    var f = byId(state.data.funding, b.fundingId);
    if (!f) return { key: "late", word: "No funder yet" };
    var s = fStatus(f);
    if (s === "secured") return { key: "done", word: "Covered" };
    if (s === "pending") return { key: "soon", word: "Waiting on decision" };
    if (s === "working") return { key: "doing", word: "Working on it" };
    return { key: "late", word: s === "declined" ? "Funder declined" : "No funder yet" };
  }

  /* Planning clock next to work done and money secured, so the team can see whether we are keeping pace. */
  function progressHtml() {
    var s = new Date(zonedIso(cfg.planningStart || "2026-09-02", "00:00")), e = new Date(zonedIso(cfg.eventDate || "2026-11-09", "09:00")), now = new Date();
    var pct = Math.max(0, Math.min(100, Math.round(100 * (now - s) / (e - s))));
    var left = Math.max(0, dayNumber(e) - dayNumber(now));
    var all = state.data.assignments, done = all.filter(function (a) { return a.status === "done"; }).length;
    var wpct = all.length ? Math.round(100 * done / all.length) : 0;
    var m = money_(), mpct = m.total ? Math.min(100, Math.round(100 * m.secured / m.total)) : 0;
    function meter(id, label, value, meta, cls) {
      return '<div class="meter ' + cls + '"><p class="meter__label" id="' + id + '"><b>' + value + "%</b> " + label + "</p>" +
        '<div class="meter__bar" role="progressbar" aria-labelledby="' + id + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + value + '"><i style="width:' + value + '%"></i></div>' +
        '<p class="meter__meta">' + meta + "</p></div>";
    }
    return '<section class="semester" aria-labelledby="prog-h"><h2 id="prog-h" class="semester__h">Are we on pace?</h2><div class="semester__grid semester__grid--3">' +
      meter("prog-time", "of the planning time has gone by", pct, now > e ? "The visit has started." : left + (left === 1 ? " day" : " days") + " until " + esc(cfg.eventLabel || fmtDay(e)) + ".", "meter--time") +
      meter("prog-work", "of assignments are done", wpct, done + " of " + all.length + " done", "meter--work") +
      meter("prog-money", "of the budget is secured", mpct, '<a href="#/funding">' + money(m.secured) + " of about " + money(m.total) + "</a>", "meter--money") +
      "</div></section>";
  }

  function milestonesHtml(list, heading) {
    var now = new Date();
    var ms = list.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    if (!ms.length) return "";
    var nextIdx = -1;
    ms.forEach(function (m, i) { if (nextIdx < 0 && new Date(m.date) >= now) nextIdx = i; });
    return '<section class="route" aria-labelledby="route-h"><h2 id="route-h">' + esc(heading || "Milestones") + "</h2><ol>" + ms.map(function (m, i) {
      var d = new Date(m.date), cls = d < now ? "is-past" : (i === nextIdx ? "is-next" : "");
      var text = '<span class="when">' + esc(m.dateLabel || fmtDay(d)) + '</span><span class="what">' + esc(m.label) + (i === nextIdx ? '<span class="sr"> (next)</span>' : "") + "</span>";
      var target = m.projectId && byId(state.data.projects, m.projectId);
      return '<li class="' + cls + '"><span class="stop" aria-hidden="true"></span>' + (target ? '<a href="#/p/' + esc(m.projectId) + '">' + text + "</a>" : "<span>" + text + "</span>") + "</li>";
    }).join("") + "</ol></section>";
  }

  /* ---------- home ---------- */
  function viewHome() {
    var me = store.get("me");
    var e = new Date(zonedIso(cfg.eventDate || "2026-11-09", "09:00")), left = dayNumber(e) - dayNumber(new Date());
    var countdown = left > 0 ? "<b>" + left + "</b> " + (left === 1 ? "day" : "days") + " until " + esc(cfg.eventLabel || fmtDay(e)) + "." : left === 0 ? "<b>Today is the day.</b>" : "The visit has happened.";
    var waiting = contactsNeedingUs(state.data.contacts);
    var nudge = waiting.length ? '<section class="next-meet" aria-label="Follow-ups"><p><span class="next-meet__label">Follow-ups</span> <b>' + waiting.length + (waiting.length === 1 ? " contact is" : " contacts are") + "</b> waiting on a move from us.</p>" +
      '<div class="actions" style="margin-top:0"><a class="btn" href="#/contacts">See who</a></div></section>' : "";

    var signs = state.data.members.map(function (m) {
      var list = mine(m.id), c = counts(list);
      var mineC = contactsNeedingUs(state.data.contacts.filter(function (x) { return x.ownerId === m.id; }));
      var next = list.filter(function (a) { return a.status !== "done"; })[0];
      var countHtml = "";
      if (c.late) countHtml += '<span class="count">' + shape("late") + "<span><b>" + c.late + "</b> overdue</span></span>";
      countHtml += '<span class="count">' + shape("todo") + "<span><b>" + c.week + "</b> due in 7 days</span></span>";
      if (mineC.length) countHtml += '<span class="count">' + shape("move") + "<span><b>" + mineC.length + "</b> to follow up</span></span>";
      countHtml += '<span class="count">' + shape("done") + "<span><b>" + c.done + "</b> done</span></span>";
      var nextHtml = next
        ? '<p class="sign__next">Next up<b>' + esc(next.title) + "</b>" + esc(next.due ? fmtDay(due(next)) + ", " + fmtTime(due(next)) : "No due date") + "</p>"
        : '<p class="sign__next">Nothing open right now.</p>';
      return '<a class="sign' + (me === m.id ? " is-me" : "") + '" href="#/m/' + esc(m.id) + '">' + bullet(m, "lg") +
        '<span><span class="sign__name">' + esc(m.name) + '</span> ' + campusTag(m.campus, true) + '<br><span class="sign__role">' + esc(m.role) + (me === m.id ? " (you)" : "") + "</span>" +
        '<span class="sign__counts">' + countHtml + "</span>" + nextHtml + "</span></a>";
    }).join("");

    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Bringing Dr. Lagmay to the Bay</h1><p>' + countdown + " Pick your name to see what you need to do, who you need to follow up with, and when.</p></div>" +
      nextMeetingStrip() + nudge + progressHtml() + milestonesHtml(state.data.milestones, "Milestones") +
      '<section aria-labelledby="signs-h"><h2 id="signs-h" class="sr">Team members</h2><div class="signs">' + signs + "</div></section></div>";
  }

  /* ---------- rows ---------- */
  function rowHtml(a, showWho, hideProject) {
    var d = due(a), k = statusKey(a), m = member(a.memberId), p = project(a.projectId);
    return '<li class="row' + (k === "done" ? " is-done" : "") + '"><a href="#/a/' + esc(a.id) + '">' +
      '<span class="row__main"><span class="row__title">' + esc(a.title) + "</span>" +
      '<span class="row__meta">' + badge(a) + (hideProject ? "" : "<span>" + esc(p.name) + "</span>") + (showWho ? "<span>" + esc(m.name) + "</span>" : "") + "</span></span>" +
      '<span class="row__due"><span class="row__day">' + (d ? esc(fmtDay(d)) + ", " + esc(fmtTime(d)) : "No due date") + '</span><span class="row__rel">' + esc(relDue(d, k === "done")) + "</span></span>" +
      "</a></li>";
  }
  function projectRowHtml(p) {
    var d = due(p), k = pKey(p), n = state.data.assignments.filter(function (a) { return a.projectId === p.id && a.status !== "done"; }).length;
    var lead = p.leadId ? member(p.leadId) : null;
    return '<li class="row row--team' + (k === "done" ? " is-done" : "") + '"><a href="#/p/' + esc(p.id) + '">' +
      '<span class="row__main"><span class="row__title">' + esc(p.name) + "</span>" +
      '<span class="row__meta">' + pBadge(p) + campusTag(p.campus, true) + (lead ? "<span>Led by " + esc(first(lead.name)) + "</span>" : "") + "<span>" + n + " open " + (n === 1 ? "assignment" : "assignments") + "</span></span></span>" +
      '<span class="row__due"><span class="row__day">' + (d ? esc(fmtDay(d)) : "No date") + '</span><span class="row__rel">' + esc(pRel(p)) + "</span></span></a></li>";
  }
  function contactRowHtml(c, hideOwner) {
    var o = member(c.ownerId), p = c.projectId ? project(c.projectId) : null;
    return '<li class="row' + (cStatus(c) === "settled" ? " is-done" : "") + '"><a href="#/c/' + esc(c.id) + '">' +
      '<span class="row__main"><span class="row__title">' + esc(c.name) + (c.org ? ", " + esc(c.org) : "") + "</span>" +
      '<span class="row__meta">' + cBadge(c) + (hideOwner || !c.ownerId ? "" : "<span>" + esc(first(o.name)) + "</span>") + (p ? "<span>" + esc(p.name) + "</span>" : "") + campusTag(c.campus, true) + "</span>" +
      (c.nextStep && cStatus(c) !== "settled" ? '<span class="row__next"><b>Next:</b> ' + esc(c.nextStep) + "</span>" : "") + "</span>" +
      '<span class="row__due"><span class="row__day">' + esc(c.followUp && cStatus(c) !== "settled" ? fmtDate(c.followUp) : "") + '</span><span class="row__rel">' + esc(cWhen(c)) + "</span></span></a></li>";
  }
  function fundingRowHtml(f) {
    var o = f.ownerId ? member(f.ownerId) : null, d = due(f);
    var when = d ? (fStatus(f) === "pending" ? "Decision " : "Deadline ") + fmtDay(d) : "";
    return '<li class="row' + (fStatus(f) === "declined" ? " is-done" : "") + '"><a href="#/f/' + esc(f.id) + '">' +
      '<span class="row__main"><span class="row__title">' + esc(f.source) + "</span>" +
      '<span class="row__meta">' + fBadge(f) + (o ? "<span>" + esc(first(o.name)) + "</span>" : "") + (f.covers ? "<span>For " + esc(f.covers) + "</span>" : "") + campusTag(f.campus, true) + "</span>" +
      (f.nextStep && ["secured", "declined"].indexOf(fStatus(f)) < 0 ? '<span class="row__next"><b>Next:</b> ' + esc(f.nextStep) + "</span>" : "") + "</span>" +
      '<span class="row__due"><span class="row__day money">' + (num(f.amount) ? (fStatus(f) === "secured" ? "" : "Up to ") + money(f.amount) : "Amount open") + '</span><span class="row__rel">' + esc(when) + "</span></span></a></li>";
  }

  /* ---------- member ---------- */
  function viewMember(id) {
    var m = byId(state.data.members, id);
    if (!m) return notFound("We couldn't find that team member.");
    store.set("me", id);
    var list = mine(id), week = new Date(Date.now() + 7 * DAY);
    var groups = { late: [], week: [], later: [], none: [], done: [] };
    list.forEach(function (a) {
      var k = statusKey(a), d = due(a);
      if (k === "done") groups.done.push(a);
      else if (k === "late") groups.late.push(a);
      else if (!d) groups.none.push(a);
      else if (d <= week) groups.week.push(a);
      else groups.later.push(a);
    });
    function sec(key, title, empty) {
      var items = groups[key];
      if (!items.length && !empty) return "";
      return '<section class="section" aria-labelledby="g-' + key + '"><h2 id="g-' + key + '">' + title + "</h2>" +
        (items.length ? '<ul class="rows">' + items.map(function (a) { return rowHtml(a); }).join("") + "</ul>" : '<p class="empty">' + empty + "</p>") + "</section>";
    }
    var myContacts = state.data.contacts.filter(function (c) { return c.ownerId === id && cStatus(c) !== "settled"; }).sort(byFollowUp);
    var contactsHtml = '<section class="section" aria-labelledby="g-contacts"><h2 id="g-contacts">People ' + esc(first(m.name)) + " is in touch with</h2>" +
      '<p class="section__note">Contacts ' + esc(first(m.name)) + " owns that aren't settled yet. Open one to log what happened and set the next follow-up.</p>" +
      (myContacts.length ? '<ul class="rows">' + myContacts.map(function (c) { return contactRowHtml(c, true); }).join("") + "</ul>" : '<p class="empty">No open contacts.</p>') + "</section>";
    var myMoney = state.data.funding.filter(function (f) { return f.ownerId === id && ["secured", "declined"].indexOf(fStatus(f)) < 0; }).sort(sortByDue);
    var moneyHtml = myMoney.length ? '<section class="section" aria-labelledby="g-money"><h2 id="g-money">Funding ' + esc(first(m.name)) + " is chasing</h2><ul class=\"rows\">" + myMoney.map(fundingRowHtml).join("") + "</ul></section>" : "";
    var doneHtml = groups.done.length
      ? '<section class="section"><details class="done-list"><summary>Done (' + groups.done.length + ')</summary><ul class="rows">' + groups.done.map(function (a) { return rowHtml(a); }).join("") + "</ul></details></section>"
      : "";
    return '<div class="wrap"><div class="head"><a class="crumb" href="#/">Team</a>' +
      '<div class="detail__who">' + bullet(m, "lg") + '<div><h1 tabindex="-1">' + esc(m.name) + "</h1><p>" + esc(m.role) + " " + campusTag(m.campus, true) + "</p></div></div></div>" +
      sec("late", "Overdue") + sec("week", "Due in the next 7 days", "Nothing due in the next 7 days.") + sec("later", "Later") + sec("none", "No due date") +
      contactsHtml + moneyHtml + doneHtml + "</div>";
  }

  /* ---------- rich text from the Sheet ----------
     Supports [label](https://...) links, bare https:// links, "- " bullet lines, "1. " numbered lines and "### " subheadings. */
  var LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;
  function shortUrl(u) { var t = u.replace(/^https?:\/\/(www\.)?/i, ""); return t.length > 44 ? t.slice(0, 42) + "…" : t; }
  function inline(text) {
    var out = "", last = 0, m;
    text = String(text || "");
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text))) {
      out += esc(text.slice(last, m.index));
      var url = m[2] || m[3], label = m[1] || shortUrl(url);
      out += '<a class="ilink" href="' + esc(url) + '" target="_blank" rel="noopener">' + iconFor(url, true) + esc(label) + '<span class="sr"> (opens in a new tab)</span></a>';
      last = LINK_RE.lastIndex;
    }
    return out + esc(text.slice(last));
  }
  function richText(text, emptyMsg) {
    var lines = String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return emptyMsg ? '<p class="empty">' + esc(emptyMsg) + "</p>" : "";
    var BUL = /^[-*•]\s+/, NUM = /^\d+[.)]\s+/;
    if (lines.length > 1 && lines.every(function (l) { return BUL.test(l) || NUM.test(l); })) {
      return '<ol class="steps">' + lines.map(function (l) { return "<li>" + inline(l.replace(BUL, "").replace(NUM, "")) + "</li>"; }).join("") + "</ol>";
    }
    var html = "", open = "";
    lines.forEach(function (l) {
      var kind = BUL.test(l) ? "ul" : NUM.test(l) ? "ol" : "";
      if (open && kind !== open) { html += "</" + open + ">"; open = ""; }
      if (kind && !open) { html += "<" + kind + ' class="list">'; open = kind; }
      if (kind) html += "<li>" + inline(l.replace(BUL, "").replace(NUM, "")) + "</li>";
      else if (/^#{2,3}\s+/.test(l)) html += '<h3 class="rt-h">' + inline(l.replace(/^#+\s+/, "")) + "</h3>";
      else html += '<p class="rt-p">' + inline(l) + "</p>";
    });
    return html + (open ? "</" + open + ">" : "");
  }
  function plain(text) { return String(text || "").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)"); }
  function calendarUrl(title, d, details, hubPath) {
    if (!d) return "";
    var f = function (x) { return x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var start = new Date(d.getTime() - 30 * 60000);
    var hub = location.href.split("#")[0] + "#/" + hubPath;
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) +
      "&dates=" + f(start) + "/" + f(d) + "&details=" + encodeURIComponent(plain(details) + "\n\n" + APP + ": " + hub);
  }
  function calBtn(title, d, details, hubPath) {
    return d ? '<a class="btn" href="' + esc(calendarUrl(title, d, details, hubPath)) + '" target="_blank" rel="noopener">' + gIcon("calendar") + 'Add to Google Calendar<span class="sr"> (opens in a new tab)</span></a>' : "";
  }
  function dueBlock(label, d, rel, statusHtml) {
    return '<div class="due-block"><div class="due-block__when"><p class="due-block__label">' + esc(label) + '</p><p class="due-block__date">' + (d ? esc(fmtDay(d)) + "<br>" + esc(fmtTime(d)) : "No date") + '</p><p class="due-block__rel">' + esc(rel) + '</p></div><div class="due-block__status">' + statusHtml + "</div></div>";
  }
  function updatedNote(x) {
    return x.updatedAt ? '<p class="section__note">Last changed ' + esc(fmtDay(new Date(x.updatedAt))) + ", " + esc(fmtTime(new Date(x.updatedAt))) + (x.updatedBy && byId(state.data.members, x.updatedBy) ? " by " + esc(first(member(x.updatedBy).name)) : "") + ".</p>" : "";
  }

  /* ---------- assignment ---------- */
  function viewAssignment(id) {
    var a = byId(state.data.assignments, id);
    if (!a) return notFound("This assignment was removed or the link is wrong.");
    var m = member(a.memberId), p = project(a.projectId), d = due(a), k = statusKey(a);
    var others = state.data.assignments.filter(function (x) { return x.projectId === a.projectId && x.id !== a.id && x.status !== "done"; }).sort(sortByDue);
    var link = safeUrl(a.link);
    var opts = [["todo", "To do"], ["doing", "In progress"], ["done", "Done"]].map(function (o) {
      return '<label><input type="radio" name="status" value="' + o[0] + '"' + (a.status === o[0] || (!a.status && o[0] === "todo") ? " checked" : "") + "><span>" + o[1] + "</span></label>";
    }).join("");
    return '<div class="wrap"><div class="detail"><div class="head" style="padding-bottom:0"><a class="crumb" href="#/m/' + esc(m.id) + '">' + esc(first(m.name)) + "'s assignments</a>" +
      '<div class="detail__who">' + bullet(m) + "<span>" + esc(m.name) + "</span></div>" +
      '<h1 tabindex="-1">' + esc(a.title) + '</h1><p class="detail__project">' + (byId(state.data.projects, a.projectId) ? '<a href="#/p/' + esc(p.id) + '">' + esc(p.name) + "</a>" : esc(p.name)) + "</p></div>" +
      dueBlock("Due", d, relDue(d, k === "done"), badge(a)) +
      "<h2>What to do</h2>" + richText(a.instructions, "No instructions yet.") +
      '<div class="actions">' + (link ? extLink(link, a.linkLabel || "Open the document", "btn btn--solid") : "") +
      calBtn("Due: " + a.title, d, a.instructions + (link ? "\n\n" + link : ""), "a/" + a.id) + "</div>" +
      '<fieldset class="picker"><legend>Your progress</legend><div class="picker__opts" data-status-for="' + esc(a.id) + '">' + opts + "</div></fieldset>" + updatedNote(a) +
      (others.length ? "<h2>Others in " + esc(p.name) + '</h2><ul class="teammates">' + others.map(function (o) {
        var om = member(o.memberId);
        return "<li>" + bullet(om, "sm") + '<a href="#/a/' + esc(o.id) + '">' + esc(first(om.name)) + ": " + esc(o.title) + "</a>" + badge(o) + "</li>";
      }).join("") + "</ul>" : "") +
      '<div class="actions"><button type="button" class="btn btn--quiet" data-act="edit-assignment" data-id="' + esc(a.id) + '">Edit assignment</button></div>' +
      "</div></div>";
  }

  /* ---------- workstream ---------- */
  function viewProject(id) {
    var p = byId(state.data.projects, id);
    if (!p) return notFound("This workstream was removed or the link is wrong.");
    var d = due(p), k = pKey(p), lead = p.leadId ? member(p.leadId) : null;
    var list = state.data.assignments.filter(function (a) { return a.projectId === p.id; }).sort(sortByDue);
    var open = list.filter(function (a) { return a.status !== "done"; }), done = list.filter(function (a) { return a.status === "done"; });
    var contacts = state.data.contacts.filter(function (c) { return c.projectId === p.id; }).sort(byFollowUp);
    var openC = contacts.filter(function (c) { return cStatus(c) !== "settled"; }), settledC = contacts.filter(function (c) { return cStatus(c) === "settled"; });
    var ms = state.data.milestones.filter(function (m) { return m.projectId === p.id; });
    return '<div class="wrap"><div class="detail"><div class="head" style="padding-bottom:0"><a class="crumb" href="#/pm">Project view</a>' +
      '<h1 tabindex="-1">' + esc(p.name) + '</h1><p class="detail__project">' + campusTag(p.campus) + (lead ? " Led by " + esc(lead.name) : "") + "</p></div>" +
      dueBlock("Done by", d, pRel(p), pBadge(p)) +
      "<h2>What this covers</h2>" + richText(p.description, "No description yet.") +
      '<div class="actions">' + extLink(p.link, gKind(p.link) === "sheet" ? "Open the sheet" : "Open the main doc", "btn btn--solid") +
      calBtn("Lagmay visit: " + p.name, d, p.description, "p/" + p.id) + "</div>" +
      (ms.length ? milestonesHtml(ms, "Milestones in this workstream") : "") +
      "<h2>Who is doing what</h2>" + (open.length ? '<ul class="rows">' + open.map(function (a) { return rowHtml(a, true, true); }).join("") + "</ul>" : '<p class="empty">Nothing open. Gregor can add an assignment below.</p>') +
      (done.length ? '<details class="done-list"><summary>Done (' + done.length + ')</summary><ul class="rows">' + done.map(function (a) { return rowHtml(a, true, true); }).join("") + "</ul></details>" : "") +
      "<h2>People involved</h2>" + (openC.length ? '<ul class="rows">' + openC.map(function (c) { return contactRowHtml(c); }).join("") + "</ul>" : '<p class="empty">No open contacts in this workstream.</p>') +
      (settledC.length ? '<details class="done-list"><summary>Settled (' + settledC.length + ')</summary><ul class="rows">' + settledC.map(function (c) { return contactRowHtml(c); }).join("") + "</ul></details>" : "") +
      '<div class="submit-bar"><p>' + (k === "done" ? "Marked done. If that was a mistake, undo it." : "When everything in this workstream is handled, mark it done so it drops off everyone's list.") + '</p><button type="button" class="btn" data-act="project-status" data-id="' + esc(p.id) + '">' + (k === "done" ? "Undo done" : "Mark as done") + "</button></div>" +
      '<div class="actions"><button type="button" class="btn" data-act="new-assignment" data-project="' + esc(p.id) + '">Add an assignment</button><button type="button" class="btn" data-act="new-contact" data-project="' + esc(p.id) + '">Add a contact</button><button type="button" class="btn btn--quiet" data-act="edit-project" data-id="' + esc(p.id) + '">Edit workstream</button></div>' +
      "</div></div>";
  }

  /* ---------- funding ---------- */
  function gaugeHtml() {
    var m = money_(), scale = Math.max(m.total, m.secured + m.pending, 1);
    var w = function (n) { return (100 * n / scale).toFixed(2) + "%"; };
    var label = money(m.secured) + " secured and " + money(m.pending) + " waiting on a decision, out of about " + money(m.total) + ". Gap: " + money(m.gap) + ".";
    var unf = m.unfunded.map(function (b) { return esc(b.item) + " (" + money(b.amount) + ")"; });
    return '<section class="gauge" aria-labelledby="gauge-h"><h2 id="gauge-h" class="gauge__h">Where the money stands</h2>' +
      '<div class="gauge__nums"><span><b class="money">' + money(m.secured) + '</b> secured</span><span><b class="money">' + money(m.pending) + '</b> waiting on a decision</span><span><b class="money">' + money(m.gap) + "</b> gap</span><span>of about <b class=\"money\">" + money(m.total) + "</b></span></div>" +
      '<div class="gauge__bar" role="img" aria-label="' + esc(label) + '"><span class="gauge__seg gauge__seg--secured" style="width:' + w(m.secured) + '"></span><span class="gauge__seg gauge__seg--pending" style="width:' + w(m.pending) + '"></span></div>' +
      '<ul class="gauge__key" aria-hidden="true"><li><i class="k-secured"></i>Secured</li><li><i class="k-pending"></i>Waiting on a decision</li><li><i class="k-gap"></i>Gap, nobody has offered yet</li></ul>' +
      (unf.length ? '<p class="gauge__note"><b>Still needs a funder:</b> ' + unf.join(", ") + ". Point every new funding conversation at these.</p>" : '<p class="gauge__note"><b>Every line in the budget has a funder</b> that has said yes or is deciding.</p>') +
      "</section>";
  }
  function budgetTableHtml() {
    var lines = state.data.budget.slice().sort(function (a, b) { return num(b.amount) - num(a.amount); });
    var total = 0;
    var rows = lines.map(function (b) {
      var c = lineCover(b), f = byId(state.data.funding, b.fundingId);
      if (b.status !== "notneeded") total += num(b.amount);
      return '<tr><td class="t">' + esc(b.item) + (b.notes ? "<br><small>" + esc(b.notes) + "</small>" : "") + "</td>" +
        '<td class="money">' + (b.status === "notneeded" ? "$0" : money(b.amount)) + (b.basis === "quote" ? "" : b.status === "notneeded" ? "" : "<br><small>estimate</small>") + "</td>" +
        "<td>" + (f ? '<a href="#/f/' + esc(f.id) + '">' + esc(f.source) + "</a>" : (b.status === "notneeded" ? "" : "<small>Nobody yet</small>")) + "</td>" +
        "<td>" + st(c.key, c.word) + "</td>" +
        '<td class="act"><button type="button" class="btn btn--quiet" data-act="edit-line" data-id="' + esc(b.id) + '">Edit<span class="sr"> ' + esc(b.item) + "</span></button></td></tr>";
    }).join("");
    return '<section class="section" aria-labelledby="budget-h"><h2 id="budget-h">What the visit costs</h2>' +
      '<p class="section__note">One line per cost. Covered means the funder linked to it has said yes. Amounts marked estimate have no quote yet.</p>' +
      '<div class="table-scroll"><table class="pm-table pm-table--budget"><thead><tr><th scope="col">Cost</th><th scope="col" class="money">Amount</th><th scope="col">Who covers it</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>' +
      rows + '</tbody><tfoot><tr><td>Total</td><td class="money">' + money(total) + "</td><td></td><td></td><td></td></tr></tfoot></table></div>" +
      '<div class="actions"><button type="button" class="btn" data-act="new-line">Add a cost</button></div></section>';
  }
  function viewFunding() {
    var groups = FSTAT.map(function (o) {
      var list = state.data.funding.filter(function (f) { return fStatus(f) === o[0]; }).sort(sortByDue);
      if (!list.length) return "";
      var inner = '<ul class="rows">' + list.map(fundingRowHtml).join("") + "</ul>";
      if (o[0] === "declined") return '<details class="done-list"><summary>Declined (' + list.length + ")</summary>" + inner + "</details>";
      return '<section class="deliv-group"><h3>' + esc(o[1]) + " (" + list.length + ")</h3>" + inner + "</section>";
    }).join("");
    var rl = state.data.rules.map(function (r) { return r.text; }).filter(Boolean);
    var rules = '<section class="section" aria-labelledby="rules-h"><h2 id="rules-h">Ground rules</h2><p class="section__note">What we will and won\'t take money for, and from whom. Kept in the Rules tab of the team Sheet.</p>' +
      (rl.length ? '<ul class="list">' + rl.map(function (r) { return "<li>" + inline(r) + "</li>"; }).join("") + "</ul>" : '<p class="empty">No rules written down yet.</p>') + "</section>";
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Funding</h1><p>Every funding source we have tried or could try, and what the visit costs. Anyone on the team can update a source. Changing the budget needs the project manager code.</p></div>' +
      gaugeHtml() +
      '<section class="section" aria-labelledby="src-h"><h2 id="src-h">Funding sources</h2>' + (groups || '<p class="empty">No funding sources yet.</p>') +
      '<div class="actions"><button type="button" class="btn btn--solid" data-act="new-funding">Add a funding source</button></div></section>' +
      budgetTableHtml() + rules + "</div>";
  }
  function viewFundingSource(id) {
    var f = byId(state.data.funding, id);
    if (!f) return notFound("This funding source was removed or the link is wrong.");
    var o = f.ownerId ? member(f.ownerId) : null, d = due(f), s = fStatus(f);
    var lines = state.data.budget.filter(function (b) { return b.fundingId === f.id; });
    var opts = FSTAT.map(function (x) { return '<label><input type="radio" name="fstatus" value="' + x[0] + '"' + (s === x[0] ? " checked" : "") + "><span>" + esc(x[1]) + "</span></label>"; }).join("");
    var contact = f.contactId ? byId(state.data.contacts, f.contactId) : null;
    return '<div class="wrap"><div class="detail"><div class="head" style="padding-bottom:0"><a class="crumb" href="#/funding">Funding</a>' +
      '<h1 tabindex="-1">' + esc(f.source) + '</h1><p class="detail__project">' + campusTag(f.campus) + (f.covers ? " For " + esc(f.covers) : "") + "</p></div>" +
      '<div class="facts"><div class="fact"><span>Amount</span><b class="money">' + (num(f.amount) ? (s === "secured" ? "" : "Up to ") + money(f.amount) : "Open") + "</b></div>" +
      '<div class="fact"><span>Status</span><b>' + fBadge(f) + "</b></div>" +
      '<div class="fact"><span>' + (s === "pending" ? "Decision expected" : "Deadline") + "</span><b>" + (d ? esc(fmtDay(d)) + ", " + esc(fmtTime(d)) : "None set") + "</b></div>" +
      '<div class="fact"><span>Owner</span><b>' + (o ? bullet(o, "sm") + " " + esc(first(o.name)) : "No one yet") + "</b></div></div>" +
      (f.nextStep && ["secured", "declined"].indexOf(s) < 0 ? '<p class="next-step"><b>Next step:</b> ' + inline(f.nextStep) + "</p>" : "") +
      "<h2>Notes</h2>" + richText(f.notes, "No notes yet.") +
      (lines.length ? "<h2>Budget lines it pays for</h2><ul class=\"list\">" + lines.map(function (b) { return "<li>" + esc(b.item) + ", " + money(b.amount) + "</li>"; }).join("") + "</ul>" : "") +
      (contact ? '<h2>Who we talk to</h2><ul class="rows">' + contactRowHtml(contact) + "</ul>" : "") +
      '<div class="actions">' + extLink(f.link, "Open the application or info page", "btn btn--solid") +
      ((s === "working" || s === "lead" || s === "pending") && d ? calBtn((s === "pending" ? "Decision: " : "Deadline: ") + f.source, d, f.notes, "f/" + f.id) : "") + "</div>" +
      '<fieldset class="picker picker--five"><legend>Where it stands</legend><div class="picker__opts" data-fstatus-for="' + esc(f.id) + '">' + opts + "</div></fieldset>" + updatedNote(f) +
      '<div class="actions"><button type="button" class="btn btn--quiet" data-act="edit-funding" data-id="' + esc(f.id) + '">Edit funding source</button></div>' +
      "</div></div>";
  }

  /* ---------- contacts ---------- */
  function viewContacts() {
    var f = { proj: store.get("c.proj") || "", who: store.get("c.who") || "", campus: store.get("c.campus") || "" };
    var list = state.data.contacts.filter(function (c) {
      return (!f.proj || c.projectId === f.proj) && (!f.who || c.ownerId === f.who) && (!f.campus || c.campus === f.campus);
    });
    function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"; }
    var filters = '<form class="filters" id="contact-filter" aria-label="Filter contacts">' +
      '<div class="field"><label for="cf-proj">Workstream</label><select id="cf-proj" name="proj">' + opt("", "All workstreams", f.proj) + state.data.projects.map(function (p) { return opt(p.id, p.name, f.proj); }).join("") + "</select></div>" +
      '<div class="field"><label for="cf-who">Owner</label><select id="cf-who" name="who">' + opt("", "Everyone", f.who) + state.data.members.map(function (m) { return opt(m.id, m.name, f.who); }).join("") + "</select></div>" +
      '<div class="field"><label for="cf-campus">Campus</label><select id="cf-campus" name="campus">' + opt("", "Any campus", f.campus) + Object.keys(CAMPUS).map(function (k) { return opt(k, CAMPUS[k], f.campus); }).join("") + "</select></div></form>";
    var late = list.filter(cLate).sort(byFollowUp);
    function group(key, title, note) {
      var items = list.filter(function (c) { return cStatus(c) === key && !cLate(c); }).sort(byFollowUp);
      if (!items.length) return "";
      var inner = '<ul class="rows">' + items.map(function (c) { return contactRowHtml(c); }).join("") + "</ul>";
      if (key === "settled") return '<section class="section"><details class="done-list"><summary>Settled (' + items.length + ")</summary>" + inner + "</details></section>";
      return '<section class="section" aria-labelledby="cg-' + key + '"><h2 id="cg-' + key + '">' + title + " (" + items.length + ")</h2>" + (note ? '<p class="section__note">' + note + "</p>" : "") + inner + "</section>";
    }
    var lateHtml = late.length ? '<section class="section" aria-labelledby="cg-late"><h2 id="cg-late">Follow-up overdue (' + late.length + ')</h2><p class="section__note">The follow-up date has passed. Send the nudge, then log it so the date moves.</p><ul class="rows">' + late.map(function (c) { return contactRowHtml(c); }).join("") + "</ul></section>" : "";
    var body = list.length ? lateHtml + group("ours", "Our move", "They are waiting on us: a reply, a document or a decision.") + group("theirs", "Waiting on them", "We asked. Nudge them on the follow-up date if there's no answer.") + group("new", "Not contacted yet") + group("settled", "Settled")
      : '<p class="empty">No contacts match these filters.</p>';
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Contacts</h1><p>Everyone we are talking to about the visit, sorted by whose move it is. Each person has one owner on our team, so nobody gets two emails and nobody falls through the cracks.</p></div>' +
      filters + '<div class="actions" style="margin:8px 0 8px"><button type="button" class="btn btn--solid" data-act="new-contact">Add a contact</button></div>' + body + "</div>";
  }
  function viewContact(id) {
    var c = byId(state.data.contacts, id);
    if (!c) return notFound("This contact was removed or the link is wrong.");
    var o = c.ownerId ? member(c.ownerId) : null, p = c.projectId ? byId(state.data.projects, c.projectId) : null, s = cStatus(c);
    var email = safeEmail(c.email);
    var opts = CSTAT.map(function (x) { return '<label><input type="radio" name="cstatus" value="' + x[0] + '"' + (s === x[0] ? " checked" : "") + "><span>" + esc(x[1]) + "</span></label>"; }).join("");
    var funds = state.data.funding.filter(function (f) { return f.contactId === c.id; });
    return '<div class="wrap"><div class="detail"><div class="head" style="padding-bottom:0"><a class="crumb" href="#/contacts">Contacts</a>' +
      '<h1 tabindex="-1">' + esc(c.name) + '</h1><p class="detail__project">' + esc([c.role, c.org].filter(Boolean).join(", ")) + " " + campusTag(c.campus, true) + "</p></div>" +
      '<div class="facts"><div class="fact"><span>Status</span><b>' + cBadge(c) + "</b></div>" +
      '<div class="fact"><span>Owner</span><b>' + (o ? bullet(o, "sm") + " " + esc(first(o.name)) : "No one yet") + "</b></div>" +
      '<div class="fact"><span>Last contact</span><b>' + (c.lastContact ? esc(fmtDate(c.lastContact)) : "Never") + "</b></div>" +
      '<div class="fact"><span>Follow up</span><b>' + (c.followUp && s !== "settled" ? esc(fmtDate(c.followUp)) + "<br><small>" + esc(cWhen(c)) + "</small>" : "No date") + "</b></div></div>" +
      (c.nextStep && s !== "settled" ? '<p class="next-step"><b>Next step:</b> ' + inline(c.nextStep) + "</p>" : "") +
      '<div class="actions"><button type="button" class="btn btn--solid" data-act="log-touch" data-id="' + esc(c.id) + '">Log what happened</button>' +
      (email ? '<a class="btn" href="mailto:' + esc(email) + '">Email ' + esc(c.name) + "</a>" : "") + extLink(c.link, "Open the thread or page") + "</div>" +
      "<h2>History and notes</h2>" + richText(c.notes, "Nothing logged yet.") +
      (p ? '<p class="section__note">Workstream: <a href="#/p/' + esc(p.id) + '">' + esc(p.name) + "</a></p>" : "") +
      (funds.length ? '<h2>Funding through ' + esc(c.name) + '</h2><ul class="rows">' + funds.map(fundingRowHtml).join("") + "</ul>" : "") +
      '<fieldset class="picker picker--four"><legend>Whose move is it?</legend><div class="picker__opts" data-cstatus-for="' + esc(c.id) + '">' + opts + "</div></fieldset>" + updatedNote(c) +
      '<div class="actions"><button type="button" class="btn btn--quiet" data-act="edit-contact" data-id="' + esc(c.id) + '">Edit contact</button></div>' +
      "</div></div>";
  }

  /* ---------- PM view ---------- */
  function viewPM(sub) {
    var timeline = sub !== "list";
    var f = { who: store.get("f.who") || "", proj: store.get("f.proj") || "", st: store.get("f.st") || "" };
    var all = state.data.assignments, c = counts(all);
    var list = all.filter(function (a) {
      return (!f.who || a.memberId === f.who) && (!f.proj || a.projectId === f.proj) && (!f.st || statusKey(a) === f.st);
    }).sort(sortByDue);
    function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"; }
    var toolbar = '<form class="toolbar" id="pm-filter" aria-label="Filter assignments">' +
      '<div class="field"><label for="f-who">Person</label><select id="f-who" name="who">' + opt("", "Everyone", f.who) + state.data.members.map(function (m) { return opt(m.id, m.name, f.who); }).join("") + "</select></div>" +
      '<div class="field"><label for="f-proj">Workstream</label><select id="f-proj" name="proj">' + opt("", "All workstreams", f.proj) + state.data.projects.map(function (p) { return opt(p.id, p.name, f.proj); }).join("") + "</select></div>" +
      '<div class="field"><label for="f-st">Status</label><select id="f-st" name="st">' + opt("", "Any status", f.st) + ["late", "todo", "doing", "done"].map(function (k) { return opt(k, LABEL[k], f.st); }).join("") + "</select></div>" +
      '<button type="button" class="btn btn--solid" data-act="new-assignment">New assignment</button></form>';
    var tables = state.data.projects.map(function (p) {
      var rows = list.filter(function (a) { return a.projectId === p.id; });
      if (!rows.length) return "";
      var allP = all.filter(function (a) { return a.projectId === p.id; }), doneP = allP.filter(function (a) { return a.status === "done"; }).length;
      var pct = allP.length ? Math.round(100 * doneP / allP.length) : 0;
      return '<div class="table-scroll"><table class="pm-table"><caption><a href="#/p/' + esc(p.id) + '">' + esc(p.name) + "</a> " + campusTag(p.campus, true) +
        '<br><span class="progress"><span class="progress__bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span><small>' + doneP + " of " + allP.length + " done</small></span></caption>" +
        '<thead><tr><th scope="col">Who</th><th scope="col">Assignment</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col"><span class="sr">Actions</span></th></tr></thead><tbody>' +
        rows.map(function (a) {
          var m = member(a.memberId), d = due(a);
          return '<tr><td class="who">' + bullet(m, "sm") + ' <span class="sr">' + esc(m.name) + '</span></td><td class="t"><a href="#/a/' + esc(a.id) + '">' + esc(a.title) + "</a><br><small>" + esc(m.name) + "</small></td>" +
            "<td>" + (d ? esc(fmtDay(d)) + ", " + esc(fmtTime(d)) : "None") + "<br><small>" + esc(relDue(d, a.status === "done")) + "</small></td><td>" + badge(a) + "</td>" +
            '<td class="act"><button type="button" class="btn btn--quiet" data-act="edit-assignment" data-id="' + esc(a.id) + '">Edit<span class="sr"> ' + esc(a.title) + "</span></button></td></tr>";
        }).join("") + "</tbody></table></div>";
    }).join("");
    var orphan = list.filter(function (a) { return !byId(state.data.projects, a.projectId); });
    if (orphan.length) tables += '<h2>No workstream</h2><ul class="rows">' + orphan.map(function (a) { return rowHtml(a, true, true); }).join("") + "</ul>";

    var projects = '<section class="section" aria-labelledby="proj-h"><h2 id="proj-h">Workstreams</h2><p class="section__note">Every task and contact belongs to one. Open a workstream to edit it, add assignments, or mark it done.</p><ul class="rows">' +
      state.data.projects.slice().sort(sortByDue).map(projectRowHtml).join("") + '</ul><div class="actions"><button type="button" class="btn" data-act="new-project">New workstream</button></div></section>';
    var needUs = contactsNeedingUs(state.data.contacts).length;
    var reminders = '<section class="section" aria-labelledby="rem-h"><h2 id="rem-h">Your summary and calendar</h2>' +
      '<p style="margin-top:12px;max-width:var(--read)">The hub never emails the team. Only you get an email: a summary at 8 AM on days with something in it (funding changes and deadlines, overdue work, follow-ups past their date, what\'s due this week). Your own open assignments, plus the workstream and funding deadlines you lead (or nobody leads), are on your Lagmay visit deadlines calendar. Teammates\' work stays in the hub, and anything marked done comes off the calendar. Nobody is invited to those events.</p>' +
      '<div class="actions"><button type="button" class="btn" data-act="send-reminders"' + (state.demo ? " disabled" : "") + ">Email me the summary now</button>" +
      (store.get("pmCode") ? '<button type="button" class="btn btn--quiet" data-act="forget-pm">Forget the project manager code on this device</button>' : "") + "</div></section>";
    var tabs = '<nav class="seg" aria-label="Project view as"><a href="#/pm"' + (timeline ? ' aria-current="page"' : "") + '>Timeline</a><a href="#/pm/list"' + (timeline ? "" : ' aria-current="page"') + ">List</a></nav>";
    var headHtml = '<div class="wrap"><div class="head"><h1 tabindex="-1">Project view</h1><p>Everything the team owes, by workstream, and what waits on what. Anyone can look. Adding or changing assignments, workstreams and links needs the project manager code.</p>' + tabs + "</div>";
    if (timeline) return headHtml + viewTimeline() + projects + reminders + "</div>";
    return headHtml +
      '<div class="stats stats--5">' +
      '<div class="stat"><b>' + c.late + "</b><span>" + shape("late") + "Overdue</span></div>" +
      '<div class="stat"><b>' + c.week + "</b><span>" + shape("todo") + "Due in 7 days</span></div>" +
      '<div class="stat"><b>' + c.doing + "</b><span>" + shape("doing") + "In progress</span></div>" +
      '<div class="stat"><b><a href="#/contacts">' + needUs + "</a></b><span>" + shape("move") + "Contacts waiting on us</span></div>" +
      '<div class="stat"><b>' + c.done + " of " + all.length + "</b><span>" + shape("done") + "Done</span></div></div>" +
      toolbar + (tables || '<p class="empty">No assignments match these filters.</p>') + projects + reminders + "</div>";
  }

  /* ---------- timeline: a Gantt chart of what waits on what, and the critical path ----------
     Each assignment (copies given to several people show as one row) runs from when it starts (its start date, or
     when it was assigned) to its due date. Milestones are diamonds. An arrow means "waits on". Dates are deadlines,
     so the maths is deadline maths: an item's buffer is how long after its due date it could finish before something
     that waits on it would miss its own date (or start date). Negative buffer is a conflict to fix. The critical path
     is the chain of open work, ending at a milestone, whose tightest step has the least buffer: if any step on it
     slips, the milestone slips. */
  var TL = { sel: "" };
  function depList(s) { return String(s || "").split(/[,\s]+/).filter(Boolean); }
  function tlModel() {
    var now = new Date(), nodes = [], byKey = {}, alias = {};
    state.data.assignments.forEach(function (a) {
      var key = (a.projectId || "") + "|" + a.title + "|" + (a.due || "");
      var n = byKey[key];
      if (!n) {
        n = byKey[key] = { id: a.id, kind: "a", ids: [], raw: [], members: [], dep: [], title: a.title, projectId: a.projectId || "", due: due(a),
          start: a.start ? new Date(a.start) : a.assignedAt ? new Date(a.assignedAt) : null, explicitStart: a.start ? new Date(a.start) : null };
        nodes.push(n);
      }
      n.ids.push(a.id); n.raw.push(a);
      if (n.members.indexOf(a.memberId) < 0) n.members.push(a.memberId);
      depList(a.dependsOn).forEach(function (d) { if (n.dep.indexOf(d) < 0) n.dep.push(d); });
      alias[a.id] = n;
    });
    nodes.forEach(function (n) {
      var ks = n.raw.map(statusKey);
      n.status = ks.every(function (k) { return k === "done"; }) ? "done" : ks.indexOf("late") > -1 ? "late" : ks.indexOf("doing") > -1 ? "doing" : "todo";
      n.done = n.status === "done";
    });
    state.data.milestones.forEach(function (m) {
      var d = m.date ? new Date(m.date) : null, past = !!(d && d < now);
      var n = { id: m.id, kind: "m", ids: [m.id], raw: [m], members: [], dep: depList(m.dependsOn), title: m.label, projectId: m.projectId || "", due: d, start: d, done: past, status: past ? "done" : "todo" };
      nodes.push(n); alias[m.id] = n;
    });
    nodes.forEach(function (n) { n.preds = []; n.succs = []; });
    nodes.forEach(function (n) {
      n.dep.forEach(function (id) { var p = alias[id]; if (p && p !== n && n.preds.indexOf(p) < 0) { n.preds.push(p); p.succs.push(n); } });
    });
    // topological order; anything caught in a loop is left out of the maths and flagged
    var indeg = {}, order = [], queue = [];
    nodes.forEach(function (n) { indeg[n.id] = n.preds.length; if (!n.preds.length) queue.push(n); });
    while (queue.length) { var x = queue.shift(); order.push(x); x.succs.forEach(function (s) { if (--indeg[s.id] === 0) queue.push(s); }); }
    nodes.forEach(function (n) { n.loop = order.indexOf(n) < 0; });
    // required finish, latest first
    for (var i = order.length - 1; i >= 0; i--) {
      var n = order[i], rf = n.due ? n.due.getTime() : Infinity, by = null;
      n.succs.forEach(function (s) {
        if (s.loop) return;
        var need = s.explicitStart ? Math.min(s.explicitStart.getTime(), s.rf) : s.rf;
        if (need < rf) { rf = need; by = s; }
      });
      n.rf = rf; n.needBy = by;
      n.buffer = n.due && isFinite(rf) ? (rf - n.due.getTime()) / DAY : null;
      n.conflict = !n.done && n.buffer !== null && n.buffer < -0.01;
    }
    // the critical path: for each open item, the chain to a milestone whose tightest step is tightest
    order.slice().reverse().forEach(function (n) {
      n.best = null;
      if (n.done) return;
      var own = n.buffer === null ? Infinity : n.buffer;
      if (n.kind === "m" && !n.succs.length) { n.best = { buf: own, path: [n] }; return; }
      n.succs.forEach(function (s) {
        if (!s.best) return;
        var c = { buf: Math.min(own, s.best.buf), path: [n].concat(s.best.path) };
        if (!n.best || c.buf < n.best.buf - 1e-6 || (Math.abs(c.buf - n.best.buf) < 1e-6 && c.path.length > n.best.path.length)) n.best = c;
      });
    });
    var crit = null;
    nodes.forEach(function (n) {
      if (!n.best || n.best.path.length < 2 || n.preds.some(function (p) { return !p.done; })) return;
      if (!crit || n.best.buf < crit.buf - 1e-6 || (Math.abs(n.best.buf - crit.buf) < 1e-6 && n.best.path.length > crit.path.length)) crit = n.best;
    });
    nodes.forEach(function (n) { n.crit = !!(crit && crit.path.indexOf(n) > -1); });
    return { nodes: nodes, alias: alias, crit: crit ? crit.path : [], critBuf: crit ? crit.buf : null };
  }
  function tlWho(n) { return n.members.map(function (id) { return first(member(id).name); }).join(" and "); }
  function tlBuf(b) {
    if (b === null || !isFinite(b)) return "";
    var d = Math.round(b);
    if (b < -0.01) return (d === 0 ? "Less than a day" : -d + (d === -1 ? " day" : " days")) + " late for what waits on it";
    if (d === 0) return "No buffer";
    return d + (d === 1 ? " day" : " days") + " of buffer";
  }
  function tlRelatives(n, dir, seen) {
    seen = seen || [];
    (dir === "up" ? n.preds : n.succs).forEach(function (x) { if (seen.indexOf(x) < 0) { seen.push(x); tlRelatives(x, dir, seen); } });
    return seen;
  }
  function tlStatusWord(n) { return n.kind === "m" ? (n.done ? "Passed" : "Milestone") : LABEL[n.status]; }

  function viewTimeline() {
    var M = tlModel(), showDone = store.get("tl.done") === "1", onlyCrit = store.get("tl.crit") === "1", allLinks = store.get("tl.links") === "1";
    var now = new Date(), today = dayNumber(now);
    var visible = M.nodes.filter(function (n) {
      if (!n.due) return false;
      if (onlyCrit) return n.crit;
      return showDone || !n.done || n.crit || (n.kind === "m" && dayNumber(n.due) >= today - 3);
    });
    var undated = M.nodes.filter(function (n) { return !n.due && !n.done; });
    // the date range: a few days before today (or the earliest open start) to just after the last date
    var day0 = today - 4, last = today + 14;
    visible.forEach(function (n) {
      var s = n.start ? dayNumber(n.start) : dayNumber(n.due), e = dayNumber(n.due);
      if (!n.done) day0 = Math.min(day0, s);
      last = Math.max(last, e + 2);
    });
    if (showDone) visible.forEach(function (n) { day0 = Math.min(day0, n.start ? dayNumber(n.start) : dayNumber(n.due)); });
    var days = last - day0 + 1, DW = 26, RH = 48, GH = 40, AH = 52;
    function x(date) { var p = parts(date); return (dayNumber(date) - day0 + (+p.hour + p.minute / 60) / 24) * DW; }
    // rows grouped by workstream, in workstream order, each sorted by due date
    var groups = state.data.projects.map(function (p) { return { p: p, rows: visible.filter(function (n) { return n.projectId === p.id; }) }; });
    var loose = visible.filter(function (n) { return !byId(state.data.projects, n.projectId); });
    if (loose.length) groups.push({ p: { id: "", name: "No workstream" }, rows: loose });
    groups = groups.filter(function (g) { return g.rows.length; });
    groups.forEach(function (g) { g.rows.sort(function (a, b) { return a.due - b.due || (a.kind === "m" ? 1 : -1); }); });
    var y = 0, pos = {}, rowsHtml = "";
    groups.forEach(function (g) {
      rowsHtml += '<div class="tl__group" style="height:' + GH + 'px"><div class="tl__label tl__label--group">' + (g.p.id ? '<a href="#/p/' + esc(g.p.id) + '">' + esc(g.p.name) + "</a>" : esc(g.p.name)) + "</div></div>";
      y += GH;
      g.rows.forEach(function (n) {
        var e = x(n.due), s = n.kind === "m" ? e : Math.min(e - DW * 0.6, x(n.start || n.due));
        var waitEnd = 0; n.preds.forEach(function (p) { if (p.due) waitEnd = Math.max(waitEnd, x(p.due)); });
        if (n.kind === "a" && waitEnd > s && waitEnd < e - DW * 0.6) s = waitEnd;   // work starts once what it waits on is done
        s = Math.max(0, s);
        pos[n.id] = { s: s, e: e, y: y + RH / 2 };
        var cls = "tl__bar tl__bar--" + (n.kind === "m" ? "ms" : n.status) + (n.crit ? " is-crit" : "") + (n.conflict ? " is-conflict" : "");
        var label = n.title + (n.members.length ? ", " + tlWho(n) : "") + ". " + tlStatusWord(n) + ", due " + fmtDay(n.due) + "." + (n.crit ? " On the critical path." : "") + (n.conflict ? " Conflict." : "") +
          (n.preds.length ? " Waits on " + n.preds.length + "." : "");
        var inner = n.kind === "m" ? "" : n.members.map(function (id) { return bullet(member(id), "xs"); }).join("");
        rowsHtml += '<div class="tl__row' + (n.done ? " is-done" : "") + '" data-node="' + esc(n.id) + '" style="height:' + RH + 'px">' +
          '<div class="tl__label"><button type="button" class="tl__name" data-act="tl-pick" data-id="' + esc(n.id) + '">' +
          (n.kind === "m" ? '<i class="tl__dia" aria-hidden="true"></i>' : shape(n.status)) + '<span>' + esc(n.title) + "</span></button>" +
          '<small>' + (n.kind === "m" ? fmtDay(n.due) : esc(tlWho(n)) + ", due " + fmtDay(n.due)) + (n.conflict ? ' · <b class="tl__warn">conflict</b>' : n.crit ? " · <b>critical</b>" : "") + "</small></div>" +
          '<div class="tl__track"><button type="button" class="' + cls + '" data-act="tl-pick" data-id="' + esc(n.id) + '" style="left:' + s.toFixed(1) + "px;width:" + Math.max(n.kind === "m" ? 0 : DW * 0.6, e - s).toFixed(1) + 'px" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + inner + "</button></div></div>";
        y += RH;
      });
    });
    var H = y;
    // the axis: a tick each day, a label each Monday (and the day0 day)
    var axis = "";
    for (var d = 0; d < days; d++) {
      var date = new Date((day0 + d) * DAY + 12 * 3600000), dow = date.getUTCDay();
      var lab = (dow === 1 || d === 0) ? '<span class="tl__mon">' + esc(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(date)) + "</span>" : "";
      axis += '<div class="tl__day' + (dow === 0 || dow === 6 ? " is-wkend" : "") + (dow === 1 ? " is-mon" : "") + '" style="left:' + (d * DW) + "px;width:" + DW + 'px">' + lab + '<span class="tl__dnum">' + date.getUTCDate() + "</span></div>";
    }
    // arrows: from the end of what it waits on to the start of the item
    var links = "";
    visible.forEach(function (n) {
      n.preds.forEach(function (p) {
        var a = pos[p.id], b = pos[n.id]; if (!a || !b) return;
        var crit = n.crit && p.crit, bad = p.conflict && p.needBy === n || (p.due && n.due && p.due > (n.explicitStart || n.due));
        var x1 = a.e + (p.kind === "m" ? 8 : 2), y1 = a.y, x2 = b.s - (n.kind === "m" ? 10 : 3), y2 = b.y, mid;
        var d;
        if (x2 - x1 > 14) { mid = x1 + 8; d = "M" + x1 + " " + y1 + "H" + mid + "V" + y2 + "H" + x2; }
        else { var yy = y2 > y1 ? y2 - RH / 2 + 2 : y2 + RH / 2 - 2; d = "M" + x1 + " " + y1 + "H" + (x1 + 8) + "V" + yy + "H" + (x2 - 8) + "V" + y2 + "H" + x2; }
        links += '<path class="tl__link' + (crit ? " is-crit" : "") + (bad ? " is-bad" : "") + '" data-from="' + esc(p.id) + '" data-to="' + esc(n.id) + '" d="' + d + '" marker-end="url(#tl-arrow' + (bad ? "-bad" : crit ? "-crit" : "") + ')"/>';
      });
    });
    var W = days * DW;
    var todayX = x(now), evX = cfg.eventDate ? x(new Date(cfg.eventDate + "T12:00:00-08:00")) : null;
    var svg = '<svg class="tl__links" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true" focusable="false"><defs>' +
      ["", "-crit", "-bad"].map(function (k) { return '<marker id="tl-arrow' + k + '" class="tl__arrow' + k + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8Z"/></marker>'; }).join("") +
      "</defs>" + links + "</svg>";
    var lines = '<div class="tl__now" style="left:' + todayX.toFixed(1) + 'px"><span>Today</span></div>' +
      (evX !== null && evX < W ? '<div class="tl__event" style="left:' + evX.toFixed(1) + 'px"><span>Nov 9</span></div>' : "");
    var chart = '<div class="tl__scroll" id="tl-scroll" tabindex="0" aria-label="Timeline chart, scrolls sideways"><div class="tl__grid" style="--dw:' + DW + "px;width:calc(var(--tl-label) + " + W + 'px)">' +
      '<div class="tl__head" style="height:' + AH + 'px"><div class="tl__label tl__label--corner">Workstream and step</div><div class="tl__axis" style="width:' + W + 'px">' + axis + "</div></div>" +
      '<div class="tl__body"><div class="tl__lanes" style="width:' + W + "px;height:" + H + 'px">' + svg + lines + "</div>" + rowsHtml + "</div></div></div>";

    // the critical path, spelled out
    var critHtml = M.crit.length ? '<section class="tl-crit" aria-labelledby="tl-crit-h"><h2 id="tl-crit-h">Critical path</h2><p class="section__note">' +
      (M.critBuf < -0.01 ? "This chain is already behind: at least one step is due after the next step needs it. Fix that day0." : "The chain of open work with the least room to slip. If any step slips more than its buffer, " + esc(M.crit[M.crit.length - 1].title) + " slips with it.") +
      '</p><ol class="tl-crit__steps">' + M.crit.map(function (n) {
        return '<li class="' + (n.conflict ? "is-conflict" : "") + '"><button type="button" data-act="tl-pick" data-id="' + esc(n.id) + '"><span class="tl-crit__t">' + (n.kind === "m" ? '<i class="tl__dia" aria-hidden="true"></i>' : shape(n.status)) + esc(n.title) + "</span>" +
          '<span class="tl-crit__m">' + (n.members.length ? esc(tlWho(n)) + ", " : "") + esc(fmtDay(n.due)) + (n.kind === "a" ? " · " + esc(tlBuf(n.buffer)) : "") + "</span></button></li>";
      }).join("") + "</ol></section>" : '<section class="tl-crit"><h2>Critical path</h2><p class="section__note">No chain yet. Link steps to what they wait on (pick a step, then Change what it waits on) and the critical path appears here.</p></section>';
    var conflicts = M.nodes.filter(function (n) { return n.conflict; });
    var fixHtml = conflicts.length ? '<section class="tl-fix" aria-labelledby="tl-fix-h"><h2 id="tl-fix-h">' + st("late", "Needs a fix") + "</h2><ul>" + conflicts.map(function (n) {
      return "<li><b>" + esc(n.title) + "</b> is due " + esc(fmtDay(n.due)) + ", but <b>" + esc(n.needBy.title) + "</b> waits on it and is " + (n.needBy.explicitStart ? "set to start " + esc(fmtDay(n.needBy.explicitStart)) : "due " + esc(fmtDay(n.needBy.due))) +
        '. <button type="button" class="btn btn--quiet btn--sm" data-act="tl-pick" data-id="' + esc(n.id) + '">Show it</button></li>';
    }).join("") + '</ul><p class="section__note">Move a due date, or change what waits on what.</p></section>' : "";
    var picked = TL.sel && byIdNode(M, TL.sel);
    var detail = '<div class="tl-detail" id="tl-detail" aria-live="polite">' + (picked ? tlDetail(M, picked) : '<p class="section__note">Pick any step to see what it waits on and what waits on it.</p>') + "</div>";
    var tools = '<div class="tl-tools"><label class="check"><input type="checkbox" id="tl-done"' + (showDone ? " checked" : "") + "> Show finished work</label>" +
      '<label class="check"><input type="checkbox" id="tl-only"' + (onlyCrit ? " checked" : "") + "> Only the critical path</label>" +
      '<label class="check"><input type="checkbox" id="tl-links"' + (allLinks ? " checked" : "") + "> Show every arrow</label></div>";
    var legend = '<ul class="tl-key" aria-label="What the chart shows">' +
      '<li><i class="tl-key__bar"></i>To do</li><li><i class="tl-key__bar tl-key__bar--doing"></i>In progress</li><li><i class="tl-key__bar tl-key__bar--done"></i>Done</li>' +
      '<li><i class="tl-key__bar tl-key__bar--late"></i>Overdue</li><li><i class="tl-key__bar tl-key__bar--crit"></i>Critical path (thick outline)</li>' +
      '<li><i class="tl__dia" aria-hidden="true"></i>Milestone</li><li><svg width="34" height="12" aria-hidden="true"><path d="M1 6H26" class="tl__link"/><path d="M26 2L33 6L26 10Z" class="tl__arrowhead"/></svg>Waits on (arrow points to the step that waits)</li>' +
      '<li><svg width="34" height="12" aria-hidden="true"><path d="M1 6H26" class="tl__link is-bad"/><path d="M26 2L33 6L26 10Z" class="tl__arrowhead is-bad"/></svg>Conflict (dashed)</li><li><i class="tl-key__now"></i>Today</li></ul>';
    var listRows = M.nodes.filter(function (n) { return n.due || !n.done; }).sort(function (a, b) { return (a.due || Infinity) - (b.due || Infinity); }).map(function (n) {
      return "<tr><td>" + esc(n.title) + (n.crit ? " <b>(critical)</b>" : "") + "</td><td>" + esc(n.kind === "m" ? "Milestone" : tlWho(n)) + "</td><td>" + esc(project(n.projectId).name) + "</td><td>" + (n.due ? esc(fmtDay(n.due)) : "No date") + "</td><td>" + esc(tlStatusWord(n)) +
        "</td><td>" + (n.preds.length ? n.preds.map(function (p) { return esc(p.title); }).join("; ") : "Nothing") + "</td><td>" + esc(n.done ? "" : tlBuf(n.buffer)) + "</td></tr>";
    }).join("");
    var list = '<details class="done-list"><summary>The timeline as a list</summary><div class="table-scroll"><table class="pm-table"><thead><tr><th scope="col">Step</th><th scope="col">Who</th><th scope="col">Workstream</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col">Waits on</th><th scope="col">Buffer</th></tr></thead><tbody>' + listRows + "</tbody></table></div></details>";
    var undatedHtml = undated.length ? '<p class="section__note">Not on the chart because they have no due date: ' + undated.map(function (n) { return '<a href="#/a/' + esc(n.id) + '">' + esc(n.title) + "</a>"; }).join(", ") + ".</p>" : "";
    return critHtml + fixHtml + tools + '<p class="section__note tl-hint">Arrows show the critical path and conflicts. Pick a step to see everything it waits on and everything waiting on it.</p><div class="tl' + (allLinks ? " show-all" : "") + '" id="tl">' + chart + "</div>" + legend + detail + undatedHtml + list;
  }
  function byIdNode(M, id) { return M.alias[id] || null; }
  function tlDetail(M, n) {
    function names(list) { return list.length ? list.map(function (x) { return '<button type="button" class="tl-chip" data-act="tl-pick" data-id="' + esc(x.id) + '">' + (x.kind === "m" ? '<i class="tl__dia" aria-hidden="true"></i>' : shape(x.status)) + esc(x.title) + (x.members.length ? " (" + esc(tlWho(x)) + ")" : "") + "</button>"; }).join("") : "<span>Nothing</span>"; }
    var link = n.kind === "a" ? '<a class="btn" href="#/a/' + esc(n.id) + '">Open the assignment</a>' : (n.projectId ? '<a class="btn" href="#/p/' + esc(n.projectId) + '">Open the workstream</a>' : "");
    return '<h2 class="tl-detail__h">' + (n.kind === "m" ? '<i class="tl__dia" aria-hidden="true"></i>' : shape(n.status)) + esc(n.title) + "</h2>" +
      '<p class="tl-detail__m">' + (n.members.length ? esc(tlWho(n)) + " · " : "") + (n.kind === "a" && n.start ? "Starts " + esc(fmtDay(n.start)) + " · " : "") + "Due " + esc(fmtDay(n.due)) +
      (n.done ? "" : " · " + esc(tlBuf(n.buffer) || "Nothing waits on it")) + (n.crit ? " · <b>On the critical path</b>" : "") + "</p>" +
      (n.conflict ? '<p class="tl-detail__warn">' + st("late", "Conflict") + " " + esc(n.needBy.title) + " waits on this but is due " + esc(fmtDay(n.needBy.explicitStart || n.needBy.due)) + ".</p>" : "") +
      '<dl class="tl-detail__dl"><div><dt>Waits on</dt><dd>' + names(n.preds) + "</dd></div><div><dt>Then these can go ahead</dt><dd>" + names(n.succs) + "</dd></div></dl>" +
      '<div class="actions">' + link + '<button type="button" class="btn" data-act="tl-links" data-id="' + esc(n.id) + '">Change what it waits on</button><button type="button" class="btn btn--quiet" data-act="tl-clear">Clear</button></div>';
  }
  function tlHighlight() {
    var root = document.getElementById("tl"); if (!root) return;
    var M = tlModel(), n = TL.sel && M.alias[TL.sel], keep = {};
    if (n) { keep[n.id] = 1; tlRelatives(n, "up").concat(tlRelatives(n, "down")).forEach(function (x) { keep[x.id] = 1; }); }
    root.classList.toggle("has-sel", !!n);
    root.querySelectorAll(".tl__row").forEach(function (r) { var id = r.getAttribute("data-node"); r.classList.toggle("is-on", !!keep[id]); r.classList.toggle("is-sel", !!(n && id === n.id)); });
    root.querySelectorAll(".tl__link").forEach(function (l) { l.classList.toggle("is-on", !!(keep[l.getAttribute("data-from")] && keep[l.getAttribute("data-to")])); });
    var det = document.getElementById("tl-detail");
    if (det) det.innerHTML = n ? tlDetail(M, n) : '<p class="section__note">Pick any step to see what it waits on and what waits on it.</p>';
  }
  function tlScrollToday() {
    var sc = document.getElementById("tl-scroll"), now = document.querySelector(".tl__now"); if (!sc || !now) return;
    sc.scrollLeft = Math.max(0, parseFloat(now.style.left) - 3 * 26);
  }
  /* Project manager: what an item waits on (and, for an assignment, when it starts) */
  function tlLinksForm(M, n) {
    var below = tlRelatives(n, "down"), cur = n.preds.map(function (p) { return p.id; });
    var groups = state.data.projects.map(function (p) { return { p: p, items: M.nodes.filter(function (x) { return x.projectId === p.id; }) }; });
    var loose = M.nodes.filter(function (x) { return !byId(state.data.projects, x.projectId); });
    if (loose.length) groups.push({ p: { name: "No workstream" }, items: loose });
    var checks = groups.map(function (g) {
      var items = g.items.filter(function (x) { return x !== n; }).sort(function (a, b) { return (a.due || Infinity) - (b.due || Infinity); });
      if (!items.length) return "";
      return '<fieldset class="checks tl-checks"><legend>' + esc(g.p.name) + "</legend>" + items.map(function (x) {
        var blocked = below.indexOf(x) > -1;
        return '<label class="check' + (blocked ? " is-off" : "") + '"><input type="checkbox" name="dep" value="' + esc(x.id) + '"' + (cur.indexOf(x.id) > -1 ? " checked" : "") + (blocked ? " disabled" : "") + "> " +
          (x.kind === "m" ? '<i class="tl__dia" aria-hidden="true"></i>' : shape(x.status)) + " " + esc(x.title) + ' <small>' + (x.members.length ? esc(tlWho(x)) + ", " : "") + (x.due ? esc(fmtDay(x.due)) : "no date") + (blocked ? ", waits on this already" : "") + "</small></label>";
      }).join("") + "</fieldset>";
    }).join("");
    var startF = n.kind === "a" ? textField("tl-start", "start", "Starts (optional)", n.explicitStart ? localParts(n.explicitStart.toISOString()).date : "", { type: "date", note: "Leave empty to count from when it was assigned. A start date means everything it waits on must be done by then." }) : "";
    return dlgShell("What does this wait on?", '<p><b>' + esc(n.title) + "</b>" + (n.members.length ? " (" + esc(tlWho(n)) + ")" : "") + "</p>" + startF +
      '<p class="section__note">Tick every step that has to be done first. Steps that already wait on this one are greyed out, so there are no loops.</p>' + checks + pmCodeField("Needed once per device to change the timeline."),
      '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">Save</button>');
  }
  function tlSaveLinks(n, v) {
    var deps = [].concat(v.dep || []), start = n.kind === "a" ? (v.start ? zonedIso(v.start, "09:00") : "") : undefined;
    return apiPost({ action: "setLinks", kind: n.kind, ids: n.ids, dependsOn: deps, start: start }).then(function (r) {
      n.ids.forEach(function (id) {
        var row = byId(n.kind === "m" ? state.data.milestones : state.data.assignments, id); if (!row) return;
        row.dependsOn = deps.join(","); if (start !== undefined) row.start = start;
      });
      route(); toast("Saved" + demoNote(r));
    });
  }

  /* ---------- files ---------- */
  function viewFiles() {
    var files = state.data.files || [], folder = safeUrl(cfg.driveFolderUrl), body;
    if (!files.length) {
      body = '<p class="empty">' + (state.demo ? "The file list appears once the Google Sheet backend is connected." : "No files found in the folder.") + "</p>";
    } else {
      var groups = {};
      files.forEach(function (f) { (groups[f.folder || "Top level"] = groups[f.folder || "Top level"] || []).push(f); });
      body = '<div class="field" style="max-width:28rem;margin-bottom:16px"><label for="file-q">Search files</label><input id="file-q" type="search" autocomplete="off"></div>' +
        Object.keys(groups).sort(function (a, b) { return a === "Top level" ? -1 : b === "Top level" ? 1 : a.localeCompare(b); }).map(function (g) {
          return '<section class="section file-group"><h2>' + esc(g) + '</h2><ul class="files">' + groups[g].map(function (fl) {
            return '<li data-name="' + esc(String(fl.name).toLowerCase()) + '"><a href="' + esc(safeUrl(fl.url)) + '" target="_blank" rel="noopener"><span class="files__name">' + gIcon(TYPE_KIND[fl.type] || gKind(fl.url), true) + esc(fl.name) +
              '</span><span class="files__meta">' + esc(fl.type || "") + (fl.modified ? ", edited " + esc(fmtDay(new Date(fl.modified))) : "") + "</span></a></li>";
          }).join("") + "</ul></section>";
        }).join("");
    }
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Team files</h1><p>Everything in the Dr. Lagmay Visit folder in Google Drive: letters, budgets, applications and meeting notes.</p>' +
      (folder ? '<div class="actions">' + extLink(folder, "Open the folder in Drive", "btn btn--solid").replace(iconFor(folder), gIcon("drive")) + "</div>" : "") + "</div>" + body + "</div>";
  }

  /* ---------- meetings ---------- */
  function meetings() { return state.data.meetings.slice().sort(function (a, b) { return new Date(a.start) - new Date(b.start); }); }
  function nextMeeting() { var now = new Date(); return meetings().filter(function (m) { return new Date(m.end || m.start) > now; })[0] || null; }
  function meetTime(m) { return fmtTime(new Date(m.start)) + (m.end ? " to " + fmtTime(new Date(m.end)) : ""); }
  function meetRel(m) {
    var s = new Date(m.start), e = new Date(m.end || m.start), now = new Date();
    if (s <= now && now < e) return "Happening now";
    if (e <= now) { var ago = dayNumber(now) - dayNumber(s); return ago === 0 ? "Earlier today" : ago === 1 ? "Yesterday" : ago + " days ago"; }
    var diff = dayNumber(s) - dayNumber(now);
    return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : "In " + diff + " days";
  }
  function joinLabel(u) { return /zoom\.us/.test(u) ? "Join on Zoom" : /meet\.google/.test(u) ? "Join Google Meet" : /discord/.test(u) ? "Open Discord" : "Join the call"; }
  function meetingCard(m, heading) {
    var s = new Date(m.start), link = safeUrl(m.link), doc = safeUrl(m.docUrl), past = new Date(m.end || m.start) < new Date();
    return '<section class="meet" aria-labelledby="meet-h-' + esc(m.id) + '"><div class="meet__when">' +
      '<p class="due-block__label" id="meet-h-' + esc(m.id) + '">' + esc(heading) + "</p>" +
      '<p class="meet__date">' + esc(fmtDay(s)) + '</p><p class="meet__time">' + esc(meetTime(m)) + '</p><p class="meet__rel">' + esc(meetRel(m)) + "</p></div>" +
      '<div class="meet__side"><p class="meet__title"><b>' + esc(m.title || "Team meeting") + "</b>" + (m.where ? "<br>" + esc(m.where) : "") + "</p>" +
      (m.attendees ? '<p class="section__note" style="margin-top:4px">With ' + esc(m.attendees) + "</p>" : "") +
      '<div class="actions">' +
      (link && !past ? extLink(link, joinLabel(link), "btn btn--solid") : "") +
      (doc ? extLink(doc, past ? "Open the notes" : "Open the agenda and notes", link && !past ? "btn" : "btn btn--solid") : "") +
      '<a class="btn btn--quiet" href="#/mt/' + esc(m.id) + '">Details</a></div></div></section>';
  }
  function meetingRow(m) {
    var s = new Date(m.start), past = new Date(m.end || m.start) < new Date();
    return '<li class="row' + (past ? " is-done" : "") + '"><a href="#/mt/' + esc(m.id) + '"><span class="row__main"><span class="row__title">' + esc(m.title || "Team meeting") + "</span>" +
      '<span class="row__meta"><span>' + esc(fmtDay(s)) + "</span>" + (m.attendees ? "<span>With " + esc(m.attendees) + "</span>" : "") + (m.link && !past ? "<span>" + esc(joinLabel(m.link).replace(/^(Join|Open) (on |the )?/, "")) + " link</span>" : "") + (m.docUrl ? "<span>Doc ready</span>" : "") + "</span></span>" +
      '<span class="row__due"><span class="row__day">' + esc(meetTime(m)) + '</span><span class="row__rel">' + esc(meetRel(m)) + "</span></span></a></li>";
  }
  function pastNotes() {
    var today = todayStr(), seen = {}, list = [];
    function docId(u) { var m = /\/d\/([\w-]+)/.exec(u || ""); return m ? m[1] : u; }
    (state.data.notes || []).forEach(function (n) { seen[docId(n.url)] = true; list.push(n); });
    meetings().forEach(function (m) {
      var day = localParts(m.start).date;
      if (!m.docUrl || day > today || seen[docId(m.docUrl)]) return;
      list.push({ id: m.id, date: day, title: m.title || "Team meeting", takeaway: m.takeaway || "", url: m.docUrl });
    });
    return list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function notesSection(notes) {
    var items = notes.map(function (n) {
      var hay = (n.title + " " + n.takeaway + " " + fmtDate(n.date) + " " + n.date).toLowerCase();
      return '<li class="note" data-hay="' + esc(hay) + '"><a href="' + esc(safeUrl(n.url)) + '" target="_blank" rel="noopener">' +
        '<span class="note__when">' + esc(fmtDate(n.date)) + '</span><span class="note__main"><span class="note__title">' + iconFor(n.url, true) + esc(n.title) + "</span>" +
        (n.takeaway ? '<span class="note__take"><b>Key takeaway:</b> ' + esc(n.takeaway) + "</span>" : '<span class="note__take note__take--none">No key takeaway written yet</span>') +
        '</span><span class="note__go">Open the notes<span class="sr"> (opens in a new tab)</span></span></a></li>';
    }).join("");
    return '<section class="section" id="notes" aria-labelledby="notes-h"><h2 id="notes-h">Past meeting notes</h2>' +
      '<p class="section__note">Newest first. Each one opens the Google Doc. Any doc in the Meetings folder shows up here; a Key takeaway or Decisions heading in the doc becomes the summary line.</p>' +
      (notes.length > 2 ? '<div class="field notes-search"><label for="notes-q">Search past notes</label><input id="notes-q" type="search" autocomplete="off" placeholder="For example: Stanford, flight, Oct 1"></div>' : "") +
      (notes.length ? '<ul class="notes">' + items + '</ul><p class="empty" id="notes-none" hidden>No notes match that search.</p>'
        : '<p class="empty">' + (state.demo ? "Notes from past meetings show up here once the Google Sheet backend is connected." : "No meeting notes yet.") + "</p>") +
      (safeUrl(cfg.meetingsFolderUrl) ? '<div class="actions"><a class="btn" href="' + esc(cfg.meetingsFolderUrl) + '" target="_blank" rel="noopener">' + gIcon("drive") + 'Open the Meetings folder<span class="sr"> (opens in a new tab)</span></a></div>' : "") + "</section>";
  }
  function viewMeetings() {
    var all = meetings(), next = nextMeeting(), now = new Date();
    var upcoming = all.filter(function (m) { return new Date(m.end || m.start) > now && m !== next; });
    var notes = pastNotes();
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">Meetings</h1><p>Team check-ins, calls with Dr. Lagmay and funders, and the notes from each. Anyone on the team can add a meeting.</p>' +
      '<nav class="jump" aria-label="On this page"><a href="#/meetings/next">Next meeting</a>' + (upcoming.length ? '<a href="#/meetings/upcoming">Coming up</a>' : "") + '<a href="#/meetings/notes">Past meeting notes (' + notes.length + ")</a></nav></div>" +
      '<div id="next">' + (next ? meetingCard(next, "Next meeting") : '<p class="empty">No meetings scheduled.</p>') + "</div>" +
      '<div class="actions" style="margin-top:0"><button type="button" class="btn btn--solid" data-act="new-meeting">Add a meeting</button></div>' +
      (upcoming.length ? '<section class="section" id="upcoming" aria-labelledby="up-h"><h2 id="up-h">Coming up</h2><ul class="rows">' + upcoming.map(meetingRow).join("") + "</ul></section>" : "") +
      notesSection(notes) + "</div>";
  }
  function viewMeeting(id) {
    var m = byId(state.data.meetings, id);
    if (!m) return notFound("That meeting was removed or the link is wrong.");
    var past = new Date(m.end || m.start) < new Date();
    return '<div class="wrap"><div class="head" style="padding-bottom:8px"><a class="crumb" href="#/meetings">Meetings</a><h1 tabindex="-1">' + esc(m.title || "Team meeting") + "</h1></div>" +
      meetingCard(m, past ? "Past meeting" : "Meeting") +
      '<div class="detail"><h2>' + (past ? "Key takeaway" : "What it's for") + "</h2>" + richText(m.takeaway, past ? "No takeaway written yet. Add one with Edit meeting." : "No agenda notes yet.") +
      '<div class="actions">' + (past ? "" : calBtn(m.title || "Lagmay visit meeting", new Date(m.end || m.start), (m.takeaway || "") + (m.link ? "\n\n" + m.link : ""), "mt/" + m.id)) +
      '<button type="button" class="btn btn--quiet" data-act="edit-meeting" data-id="' + esc(m.id) + '">Edit meeting</button></div></div></div>';
  }
  function nextMeetingStrip() {
    var m = nextMeeting(); if (!m) return "";
    var link = safeUrl(m.link), s = new Date(m.start);
    return '<section class="next-meet" aria-label="Next meeting"><p><span class="next-meet__label">Next meeting</span> <a href="#/mt/' + esc(m.id) + '"><b>' + esc(m.title || "Team meeting") + ", " + esc(fmtDay(s)) + ", " + esc(fmtTime(s)) + '</b></a> <span class="next-meet__rel">' + esc(meetRel(m)) + "</span></p>" +
      '<div class="actions" style="margin-top:0">' + (link ? extLink(link, joinLabel(link), "btn btn--solid") : "") + '<a class="btn btn--quiet" href="#/meetings">All meetings</a></div></section>';
  }

  /* ---------- RSVPs: review stories and questions before the event ---------- */
  var TIE_WORD = { born: "Born there", parents: "Parents from there", roots: "Grandparents or earlier", lived: "Lived, worked or studied there", other: "Another connection", none: "No connection" };
  function eventUrl(extra) { return location.href.split("#")[0].replace(/[^/]*$/, "") + "event/" + (extra || ""); }
  function approvalBox(r, field, label, disabled, note) {
    var on = field === "story" ? r.storyOk : r.questionOk;
    return '<label class="check rsvp-ok"><input type="checkbox" data-approve="' + esc(r.id) + '" data-field="' + field + '"' + (on ? " checked" : "") + (disabled ? " disabled" : "") + "> " + esc(label) + "</label>" + (note ? '<small class="rsvp-note">' + esc(note) + "</small>" : "");
  }
  function viewRsvps() {
    var list = state.data.rsvps.slice().sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    var form = safeUrl(state.data.rsvpFormUrl);
    // Seats go in RSVP order (the backend works this out); Banatao holds 149.
    var inPerson = list.filter(function (r) { return r.seat ? r.seat === "seat" : /^In.person (at Banatao|panel)/.test(r.attend); }).length;
    var waiting = list.filter(function (r) { return r.seat === "waitlist"; }).length;
    var joinCell = function (r) { return r.seat === "waitlist" ? "<b>Waitlist #" + esc(String(r.waitPlace || "")) + "</b><br><small>" + esc(r.attend.replace(/ \(.*$/, "")) + "</small>" : esc(r.attend); };
    var stories = list.filter(function (r) { return r.story; }), questions = list.filter(function (r) { return r.question; }), needs = list.filter(function (r) { return r.access; }), food = list.filter(function (r) { return r.diet; });
    var shownStories = stories.filter(function (r) { return r.storyOk; }).length, picked = questions.filter(function (r) { return r.questionOk; }).length;
    var place = function (r) { return [r.prov1, r.prov2].filter(function (p) { return p && p !== "Not sure" && p !== "Prefer not to say"; }).join(" and "); };
    var storyRows = stories.map(function (r) {
      return '<li class="rsvp-item"><blockquote>' + esc(r.story) + "</blockquote><p class=\"row__meta\">" + (place(r) ? "<span>Family in " + esc(place(r)) + "</span>" : "") + "<span>" + esc(first(r.name)) + "</span>" + (r.consent ? "" : '<span class="st">' + shape("no") + "Asked to keep it private</span>") + "</p>" +
        approvalBox(r, "story", "Show at the event, without their name", !r.consent, r.consent ? "" : "They said no, so it can't be shown.") + "</li>";
    }).join("");
    var questionRows = questions.map(function (r) {
      return '<li class="rsvp-item"><blockquote>' + esc(r.question) + '</blockquote><p class="row__meta"><span>' + esc(first(r.name)) + "</span>" + (r.role ? "<span>" + esc(r.role) + "</span>" : "") + "</p>" + approvalBox(r, "question", "Picked for the moderator") + "</li>";
    }).join("");
    var all = list.map(function (r) {
      return "<tr><td class=\"t\">" + esc(r.name) + "<br><small>" + esc(r.role || "") + "</small></td><td>" + joinCell(r) + "</td><td>" + esc(r.county) + "</td><td>" + esc(TIE_WORD[r.tie] || "") + (place(r) ? "<br><small>" + esc(place(r)) + "</small>" : "") + "</td></tr>";
    }).join("");
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">RSVPs</h1><p>' + (list.length ? list.length + (list.length === 1 ? " person has" : " people have") + " RSVPed, " + inPerson + " of 149 panel seats taken" + (waiting ? ", " + waiting + " on the waitlist" : "") + ". " : "No RSVPs yet. ") +
      "Stories appear on the event page and in the opening only after someone here ticks them, and only if the person said yes to sharing.</p>" +
      '<div class="actions">' + (form ? extLink(form, "Open the RSVP form", "btn btn--solid") : "") +
      '<a class="btn" href="' + esc(eventUrl()) + '" target="_blank" rel="noopener">Event page<span class="sr"> (opens in a new tab)</span></a>' +
      '<a class="btn" href="' + esc(eventUrl("?present")) + '" target="_blank" rel="noopener">Opening for Nov 9<span class="sr"> (opens in a new tab)</span></a>' +
      '<a class="btn btn--quiet" href="' + esc(eventUrl("?sample&present")) + '" target="_blank" rel="noopener">Rehearse with sample people<span class="sr"> (opens in a new tab)</span></a></div>' +
      (form ? "" : '<p class="next-step"><b>The form isn\'t made yet.</b> In Apps Script, run <code>createRsvpForm</code> once. It logs the link to share.</p>') + "</div>" +
      '<div class="stats stats--5"><div class="stat"><b>' + list.length + '</b><span>RSVPs</span></div><div class="stat"><b>' + inPerson + '</b><span>In person</span></div><div class="stat"><b>' + shownStories + " of " + stories.length + '</b><span>Stories ticked to show</span></div><div class="stat"><b>' + picked + " of " + questions.length + '</b><span>Questions picked</span></div><div class="stat"><b>' + needs.length + "</b><span>Access requests</span></div></div>" +
      '<section class="section" aria-labelledby="st-h"><h2 id="st-h">Flood stories</h2><p class="section__note">Read each one before ticking it. Tick only stories that are safe to read aloud to a full room.</p>' + (storyRows ? '<ul class="rsvp-list">' + storyRows + "</ul>" : '<p class="empty">No stories yet.</p>') + "</section>" +
      '<section class="section" aria-labelledby="q-h"><h2 id="q-h">Questions for the speakers</h2><p class="section__note">Tick the ones the moderator should have. They are never shown publicly.</p>' + (questionRows ? '<ul class="rsvp-list">' + questionRows + "</ul>" : '<p class="empty">No questions yet.</p>') + "</section>" +
      '<section class="section" aria-labelledby="ac-h"><h2 id="ac-h">Access requests</h2><p class="section__note">Only the four of us see these. Captions need booking with CITRIS ahead of time.</p>' +
      (needs.length ? '<ul class="list">' + needs.map(function (r) { return "<li><b>" + esc(r.name) + ":</b> " + esc(r.access) + "</li>"; }).join("") + "</ul>" : '<p class="empty">None so far.</p>') + "</section>" +
      '<section class="section" aria-labelledby="fd-h"><h2 id="fd-h">Food allergies and restrictions</h2><p class="section__note">For the caterer. Only the four of us see these; share counts with the caterer, not names.</p>' +
      (food.length ? '<ul class="list">' + food.map(function (r) { return "<li><b>" + esc(r.name) + ":</b> " + esc(r.diet) + "</li>"; }).join("") + "</ul>" : '<p class="empty">None so far.</p>') + "</section>" +
      '<section class="section" aria-labelledby="all-h"><h2 id="all-h">Everyone</h2>' + (all ? '<div class="table-scroll"><table class="pm-table pm-table--rsvp"><thead><tr><th scope="col">Name</th><th scope="col">Joining</th><th scope="col">Lives in</th><th scope="col">Connection</th></tr></thead><tbody>' + all + "</tbody></table></div>" : '<p class="empty">No RSVPs yet.</p>') +
      '<p class="section__note">Emails are only in the Sheet\'s RSVP responses tab.</p></section></div>';
  }
  function setApproval(id, field, value) {
    var r = byId(state.data.rsvps, id); if (!r) return;
    var key = field === "story" ? "storyOk" : "questionOk", prev = r[key];
    r[key] = value; route();
    apiPost({ action: "setApproval", id: id, field: field, value: value }).then(function (res) {
      toast((field === "story" ? (value ? "Story will be shown" : "Story hidden") : (value ? "Question picked" : "Question unpicked")) + demoNote(res));
    }).catch(function (e) { r[key] = prev; route(); toast("Not saved: " + e.message); });
  }

  /* ---------- about ---------- */
  function viewAbout() {
    var pm = first(member(cfg.pmMemberId || "gregor").name);
    function role(title, steps) { return '<section class="about-role"><h3>' + title + '</h3><ol class="steps">' + steps.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol></section>"; }
    function faq(q, a) { return '<details class="faq"><summary>' + q + '</summary><div class="faq__a">' + a + "</div></details>"; }
    var legend = [["todo", "To do", "An assignment nobody has started."], ["doing", "In progress", "Someone is working on it. For a contact: we asked and are waiting on them."], ["done", "Done", "Finished. For a contact: settled. For money: secured."],
      ["late", "Overdue", "A due date or follow-up date has passed."], ["move", "Our move", "A contact is waiting on us for a reply, a document or a decision."], ["soon", "Waiting on decision", "We applied for money and they haven't decided yet."], ["no", "Declined", "A funder said no."]].map(function (x) {
      return "<li>" + st(x[0], x[1]) + "<span>" + x[2] + "</span></li>";
    }).join("");
    return '<div class="wrap"><div class="head"><h1 tabindex="-1">About this hub</h1><p>One place for the work of bringing Dr. Mahar Lagmay to Berkeley on November 9 and Stanford on November 10: who is doing what, who we are talking to, and where the money stands. It reads and saves everything in a Google Sheet in Gregor\'s Drive.</p></div>' +
      '<section class="section" aria-labelledby="how-h"><h2 id="how-h">How to use it</h2><div class="about-roles">' +
      role("Everyone", ["On <a href=\"#/\">Team</a>, tap your name. You'll see your assignments, the contacts you own, and any funding you're chasing.", "Open an assignment for the steps and a button to the right doc. Set it to <b>In progress</b> when you start and <b>Done</b> when you finish.", "After any email or call with someone outside the team, open them on <a href=\"#/contacts\">Contacts</a> and click <b>Log what happened</b>. Say whose move it is and when to follow up.", "When a funder answers, open them on <a href=\"#/funding\">Funding</a> and change where it stands. The money gauge updates for everyone."]) +
      role("Rapha, on the Stanford side", ["Stanford contacts and funding carry an outlined " + campusTag("stanford", true) + " tag; Berkeley's are filled " + campusTag("berkeley", true) + ". Filter Contacts by campus to see just yours.", "Add Stanford people and funding leads yourself with <b>Add a contact</b> and <b>Add a funding source</b>. No special code needed.", "The Stanford day has its own workstream with its own milestones."]) +
      role(esc(pm), ["Use <a href=\"#/pm\">Project view</a> to see everything by workstream and filter by person or status.", "Add assignments there or from a workstream's page. One assignment can go to several people, each with their own copy.", "Your code is only needed for assignments, workstreams, the budget, and deleting things. Every morning you get a summary email."]) +
      "</div></section>" +
      '<section class="section" aria-labelledby="sym-h"><h2 id="sym-h">What the symbols mean</h2><p class="section__note">Each status has its own shape and word, so colour is never the only clue.</p><ul class="legend">' + legend + "</ul></section>" +
      '<section class="section" aria-labelledby="faq-h"><h2 id="faq-h">Questions</h2>' +
      faq("What's the difference between a contact and an assignment?", "<p>An assignment is a task one of us owes, with a due date. A contact is a person outside the team, like a funder, a speaker or a room scheduler, with an owner on our team and a follow-up date. If following up turns into real work, Gregor can make it an assignment too.</p>") +
      faq("Who should own a contact?", "<p>Whoever already has the relationship or the email thread. One owner per person outside the team, so they never get two emails from us saying different things.</p>") +
      faq("How is the money gauge worked out?", "<p>The total is the sum of the budget lines, minus anything marked not needed. Solid is money a funder has said yes to. Hatched is money we applied for and are waiting on. The gap is everything else. A budget line counts as covered only when the funder linked to it has said yes.</p>") +
      faq("My assignment is wrong, or something is missing.", "<p>Tell " + esc(pm) + ". Only the project manager can add, change or delete assignments, so one person is responsible for the list.</p>") +
      faq("Will the hub email me?", "<p>No. The hub never emails the team and never adds anything to your Google Calendar. Check <a href=\"#/\">Team</a> and your own page when you want to see what's on your plate. If you want a deadline on your own calendar, open it here and click <b>Add to Google Calendar</b>.</p>") +
      faq("Where are the notes from past meetings?", "<p>On <a href=\"#/meetings/notes\">Meetings</a>, under Past meeting notes. Any Google Doc in the Meetings folder of the shared Drive folder shows up there, newest first.</p>") +
      faq("What is the team code, and what if I lose it?", "<p>It keeps the team's details private. You enter it once on each device. If you lose it, ask " + esc(pm) + ". Please don't share it outside the four of us.</p>") +
      faq("It says my change wasn't saved.", "<p>Usually a dropped connection. Reload the page and try again. If it keeps happening, tell " + esc(pm) + ".</p>") +
      faq("Does it work on my phone, with a screen reader, or in dark mode?", "<p>Yes. It fits small screens, follows your device's dark mode (or pick one in the header), and works with a keyboard and screen readers. The click sounds can be turned off in the header too.</p>") +
      "</section></div>";
  }

  function viewGate(msg) {
    return '<div class="wrap"><form class="gate" id="gate"><h1 tabindex="-1">Enter the team code</h1><p>Gregor shared this code with the team. You only need to enter it once on this device.</p>' +
      '<div class="field"><label for="code">Team code</label><input id="code" type="password" autocomplete="current-password" required></div>' +
      (msg ? '<p class="error" role="alert">' + esc(msg) + "</p>" : "") + '<div><button class="btn btn--solid" type="submit">Continue</button></div></form></div>';
  }
  function notFound(msg) {
    return '<div class="wrap"><div class="head"><a class="crumb" href="#/">Team</a><h1 tabindex="-1">Not found</h1><p>' + esc(msg) + "</p></div></div>";
  }

  /* ---------- router ---------- */
  var NAV_FOR = { m: "home", a: "home", p: "pm", f: "funding", c: "contacts", mt: "meetings" };
  function route() {
    var h = location.hash.replace(/^#\/?/, "").split("/");
    var view = h[0] || "home";
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      if (a.getAttribute("data-nav") === (NAV_FOR[view] || view)) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!state.data) return;
    var html, title = "", x;
    if (view === "m") { html = viewMember(h[1]); title = member(h[1]).name; }
    else if (view === "a") { x = byId(state.data.assignments, h[1]); html = viewAssignment(h[1]); if (x) title = x.title; }
    else if (view === "p") { x = byId(state.data.projects, h[1]); html = viewProject(h[1]); if (x) title = x.name; }
    else if (view === "f") { x = byId(state.data.funding, h[1]); html = viewFundingSource(h[1]); if (x) title = x.source; }
    else if (view === "c") { x = byId(state.data.contacts, h[1]); html = viewContact(h[1]); if (x) title = x.name; }
    else if (view === "pm") { html = viewPM(h[1]); title = h[1] === "list" ? "Project view" : "Timeline"; }
    else if (view === "funding") { html = viewFunding(); title = "Funding"; }
    else if (view === "contacts") { html = viewContacts(); title = "Contacts"; }
    else if (view === "files") { html = viewFiles(); title = "Team files"; }
    else if (view === "rsvps") { html = viewRsvps(); title = "RSVPs"; }
    else if (view === "meetings") { html = viewMeetings(); title = "Meetings"; }
    else if (view === "mt") { x = byId(state.data.meetings, h[1]); html = viewMeeting(h[1]); if (x) title = x.title || "Meeting"; }
    else if (view === "about") { html = viewAbout(); title = "About"; }
    else { html = viewHome(); }
    main.innerHTML = html;
    document.title = title ? title + " | " + APP : APP;
    var h1 = main.querySelector("h1");
    if (route._moved && h1) h1.focus({ preventScroll: true });
    route._moved = true;
    window.scrollTo(0, 0);
    if (view === "pm" && h[1] !== "list") { tlScrollToday(); if (TL.sel) tlHighlight(); }
    if (view === "meetings" && h[1]) { var sec = document.getElementById(h[1]); if (sec) { sec.scrollIntoView(); var hd = sec.querySelector("h2"); if (hd) { hd.setAttribute("tabindex", "-1"); hd.focus({ preventScroll: true }); } } }
  }

  /* ---------- writes ---------- */
  function stamp(x) { x.updatedAt = new Date().toISOString(); x.updatedBy = store.get("me") || ""; }
  function setStatus(id, status) {
    var a = byId(state.data.assignments, id); if (!a) return;
    var prev = Object.assign({}, a);
    a.status = status; stamp(a); route();
    apiPost({ action: "setStatus", id: id, status: status }).then(function (r) {
      toast("Marked " + LABEL[status].toLowerCase() + demoNote(r));
    }).catch(function (e) { Object.assign(a, prev); route(); toast("Not saved: " + e.message); });
  }
  function setProjectStatus(id) {
    var p = byId(state.data.projects, id); if (!p) return;
    var prev = p.status, next = p.status === "done" ? "" : "done";
    p.status = next; route();
    apiPost({ action: "setProjectStatus", id: id, status: next }).then(function (r) {
      toast((next ? "Marked done" : "Marked open") + demoNote(r));
    }).catch(function (e) { p.status = prev; route(); toast("Not saved: " + e.message); });
  }
  function setContactStatus(id, status) {
    var c = byId(state.data.contacts, id); if (!c) return;
    var prev = Object.assign({}, c);
    c.status = status; stamp(c); route();
    apiPost({ action: "saveContact", contact: c }).then(function (r) {
      if (r.contact) Object.assign(c, r.contact);
      toast(CLABEL[status] + demoNote(r));
    }).catch(function (e) { Object.assign(c, prev); route(); toast("Not saved: " + e.message); });
  }
  function setFundingStatus(id, status) {
    var f = byId(state.data.funding, id); if (!f) return;
    var prev = Object.assign({}, f);
    f.status = status; stamp(f); route();
    apiPost({ action: "saveFunding", funding: f }).then(function (r) {
      if (r.funding) Object.assign(f, r.funding);
      toast(f.source + ": " + FLABEL[status].toLowerCase() + demoNote(r));
    }).catch(function (e) { Object.assign(f, prev); route(); toast("Not saved: " + e.message); });
  }

  function needPmCode() { return !state.demo && !store.get("pmCode"); }
  function pmCodeField(why) {
    return needPmCode() ? '<div class="field"><label for="pm-code">Project manager code</label><input id="pm-code" name="pmCode" type="password" autocomplete="off" required><small>' + esc(why || "Needed once per device to add or change assignments.") + "</small></div>" : "";
  }
  function openDialog(html, onSubmit) {
    var dlg = document.createElement("dialog");
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    var close = function () { dlg.close(); dlg.remove(); };
    dlg.addEventListener("close", function () { if (dlg.parentNode) dlg.remove(); });
    dlg.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", close); });
    var form = dlg.querySelector("form");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(form), vals = {};
      fd.forEach(function (v, k) { if (vals[k] !== undefined) { vals[k] = [].concat(vals[k], v); } else { vals[k] = v; } });
      if (vals.pmCode) store.set("pmCode", vals.pmCode);
      var btn = form.querySelector('[type="submit"]'), btnText = btn ? btn.textContent : "";
      var reset = function () { if (btn) { btn.disabled = false; btn.classList.remove("is-working"); btn.textContent = btnText; } };
      if (btn) { btn.disabled = true; btn.classList.add("is-working"); btn.textContent = state.demo ? btnText : "Working on it"; }
      Promise.resolve().then(function () { return onSubmit(vals, dlg); }).then(function (ok) { if (ok !== false) close(); else reset(); })
        .catch(function (e) {
          reset();
          if (e && e.code === "pm") store.del("pmCode");
          var err = form.querySelector(".error") || document.createElement("p");
          err.className = "error"; err.setAttribute("role", "alert"); err.textContent = "Not saved: " + (e && e.message ? e.message : "try again.");
          form.querySelector(".dlg__body").appendChild(err);
        });
    });
    dlg.showModal();
    var firstInput = dlg.querySelector("input, select, textarea");
    if (firstInput) firstInput.focus();
    return dlg;
  }
  function dlgShell(title, body, foot) {
    return '<form method="dialog"><div class="dlg__head"><h2>' + esc(title) + '</h2><button type="button" data-close aria-label="Close">×</button></div><div class="dlg__body">' + body + '</div><div class="dlg__foot">' + foot + "</div></form>";
  }
  function selectField(id, name, label, options, cur, note) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '" name="' + name + '">' +
      options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(cur || "") === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" + (note ? "<small>" + esc(note) + "</small>" : "") + "</div>";
  }
  function textField(id, name, label, val, opts) {
    opts = opts || {};
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" name="' + name + '" type="' + (opts.type || "text") + '"' + (opts.required ? " required" : "") + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") + (opts.extra || "") + ' value="' + esc(val) + '">' + (opts.note ? "<small>" + esc(opts.note) + "</small>" : "") + "</div>";
  }
  function areaField(id, name, label, val, note, tall) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><textarea id="' + id + '" name="' + name + '"' + (tall ? ' style="min-height:160px"' : "") + ">" + esc(val) + "</textarea>" + (note ? "<small>" + esc(note) + "</small>" : "") + "</div>";
  }
  function memberOpts(none) { return (none ? [["", none]] : []).concat(state.data.members.map(function (m) { return [m.id, m.name]; })); }
  function projectOpts(none) { return (none ? [["", none]] : []).concat(state.data.projects.map(function (p) { return [p.id, p.name]; })); }
  var CAMPUS_OPTS = [["berkeley", "Berkeley"], ["stanford", "Stanford"], ["both", "Both campuses"]];
  function footBtns(editing, createLabel, delAct, delId, delLabel) {
    return (editing && delAct ? '<button type="button" class="btn btn--danger" data-act="' + delAct + '" data-id="' + esc(delId) + '">' + esc(delLabel) + "</button>" : "") +
      '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">' + (editing ? "Save changes" : esc(createLabel)) + "</button>";
  }

  /* Assignments (project manager) */
  function assignmentForm(a, projectId) {
    var editing = !!a;
    a = a || { projectId: projectId || store.get("f.proj") || (state.data.projects[0] || {}).id, due: "", title: "", instructions: "", link: "", linkLabel: "" };
    var lp = localParts(a.due, "17:00");
    var fileOpts = (state.data.files || []).map(function (f) { return '<option value="' + esc(f.url) + '">' + esc(f.name) + "</option>"; }).join("");
    var who = editing
      ? selectField("as-who", "memberId", "Assigned to", memberOpts(), a.memberId)
      : '<fieldset class="checks"><legend>Assign to (one copy each)</legend>' + state.data.members.map(function (m) { return '<label class="check"><input type="checkbox" name="memberIds" value="' + esc(m.id) + '"> ' + bullet(m, "sm") + " " + esc(m.name) + "</label>"; }).join("") + "</fieldset>";
    return dlgShell(editing ? "Edit assignment" : "New assignment",
      selectField("as-proj", "projectId", "Workstream", projectOpts(), a.projectId) + who +
      textField("as-title", "title", "Title", a.title, { required: true, note: 'Start with a verb, for example "Send Rapha an airfare estimate".' }) +
      areaField("as-ins", "instructions", "What to do", a.instructions, "One step per line. Start lines with a dash to make a numbered list.") +
      '<div class="two">' + textField("as-date", "date", "Due date", lp.date, { type: "date" }) + textField("as-time", "time", "Due time", lp.time, { type: "time" }) + "</div>" +
      (fileOpts ? '<div class="field"><label for="as-file">Link a file from the team folder</label><select id="as-file" name="file"><option value="">None</option>' + fileOpts + "</select></div>" : "") +
      textField("as-link", "link", "Or paste a link", a.link, { type: "url", placeholder: "https://" }) +
      textField("as-label", "linkLabel", "Button text for the link", a.linkLabel, { placeholder: "Open the document" }) + pmCodeField(),
      footBtns(editing, "Create assignment", "delete-assignment", a.id, "Delete assignment"));
  }
  function saveAssignment(existing, v) {
    var base = { projectId: v.projectId, title: String(v.title || "").trim(), instructions: v.instructions || "", due: zonedIso(v.date, v.time), link: v.file || v.link || "", linkLabel: v.linkLabel || "" };
    var list;
    if (existing) list = [Object.assign({}, existing, base, { memberId: v.memberId })];
    else {
      var ids = [].concat(v.memberIds || []);
      if (!ids.length) return Promise.reject(new Error("Pick at least one person."));
      list = ids.map(function (mid) { return Object.assign({ id: newId("a"), memberId: mid, status: "todo" }, base); });
    }
    return apiPost({ action: "saveAssignments", assignments: list }).then(function (r) {
      (r.assignments || list).forEach(function (s) { upsert(state.data.assignments, s); });
      route();
      toast((existing ? "Saved" : "Created " + list.length + (list.length === 1 ? " assignment" : " assignments")) + demoNote(r));
    });
  }

  /* Workstreams (project manager) */
  function projectForm(p) {
    var editing = !!p; p = p || { name: "", due: "", link: "", description: "", status: "", campus: "both", leadId: "" };
    var lp = localParts(p.due, "17:00");
    return dlgShell(editing ? "Edit workstream" : "New workstream",
      textField("pj-name", "name", "Name", p.name, { required: true }) +
      areaField("pj-desc", "description", "What it covers", p.description, "Start lines with a dash for a list. Links: paste the address, or write [link text](https://...).", true) +
      '<div class="two">' + selectField("pj-campus", "campus", "Campus", CAMPUS_OPTS, p.campus) + selectField("pj-lead", "leadId", "Lead", memberOpts("No lead"), p.leadId) + "</div>" +
      '<div class="two">' + textField("pj-date", "date", "Done by", lp.date, { type: "date" }) + textField("pj-time", "time", "Time", lp.time, { type: "time" }) + "</div>" +
      textField("pj-link", "link", "Main document link", p.link, { type: "url", placeholder: "https://" }) + pmCodeField("Needed once per device to change workstreams."),
      footBtns(editing, "Create workstream"));
  }
  function saveProject(existing, v) {
    var p = Object.assign({}, existing || { id: newId("p"), status: "" }, { name: String(v.name || "").trim(), description: v.description || "", due: zonedIso(v.date, v.time), link: v.link || "", campus: v.campus || "", leadId: v.leadId || "" });
    return apiPost({ action: "saveProject", project: p }).then(function (r) {
      upsert(state.data.projects, r.project || p);
      route(); toast((existing ? "Workstream saved" : "Workstream created") + demoNote(r));
    });
  }

  /* Contacts (anyone on the team) */
  function contactForm(c, projectId) {
    var editing = !!c;
    c = c || { name: "", org: "", role: "", email: "", link: "", campus: "berkeley", projectId: projectId || store.get("c.proj") || "", ownerId: store.get("me") || "", status: "new", followUp: "", nextStep: "", notes: "", lastContact: "" };
    return dlgShell(editing ? "Edit contact" : "New contact",
      textField("ct-name", "name", "Name", c.name, { required: true }) +
      '<div class="two">' + textField("ct-org", "org", "Organization", c.org) + textField("ct-role", "role", "Role", c.role, { placeholder: "For example: Program manager" }) + "</div>" +
      '<div class="two">' + selectField("ct-owner", "ownerId", "Owner on our team", memberOpts("No one yet"), c.ownerId) + selectField("ct-proj", "projectId", "Workstream", projectOpts("None"), c.projectId) + "</div>" +
      '<div class="two">' + selectField("ct-status", "status", "Whose move is it?", CSTAT, cStatus(c)) + textField("ct-follow", "followUp", "Follow up on", c.followUp, { type: "date" }) + "</div>" +
      textField("ct-next", "nextStep", "Next step", c.nextStep, { placeholder: "For example: Send the program and the airfare estimate" }) +
      '<div class="two">' + textField("ct-email", "email", "Email", c.email, { type: "email" }) + selectField("ct-campus", "campus", "Campus", CAMPUS_OPTS, c.campus) + "</div>" +
      textField("ct-link", "link", "Link to the thread or their page", c.link, { type: "url", placeholder: "https://" }) +
      textField("ct-last", "lastContact", "Last contact", c.lastContact, { type: "date" }) +
      areaField("ct-notes", "notes", "History and notes", c.notes, "Newest first. Log what happened adds a dated line here for you.", true),
      footBtns(editing, "Add contact", "delete-contact", c.id, "Delete contact"));
  }
  function saveContactFrom(existing, v) {
    var c = Object.assign({}, existing || { id: newId("c") }, {
      name: String(v.name || "").trim(), org: v.org || "", role: v.role || "", ownerId: v.ownerId || "", projectId: v.projectId || "", status: v.status || "new",
      followUp: v.followUp || "", nextStep: v.nextStep || "", email: v.email || "", campus: v.campus || "", link: v.link || "", lastContact: v.lastContact || "", notes: v.notes || ""
    });
    stamp(c);
    return apiPost({ action: "saveContact", contact: c }).then(function (r) {
      upsert(state.data.contacts, r.contact || c);
      if (!existing) location.hash = "#/c/" + c.id; else route();
      toast((existing ? "Contact saved" : "Contact added") + demoNote(r));
    });
  }
  function touchForm(c) {
    var meId = store.get("me") || c.ownerId || "";
    return dlgShell("Log what happened: " + c.name,
      areaField("tc-what", "what", "What happened", "", "For example: Emailed the program and asked about the flight. One or two sentences.") +
      selectField("tc-who", "who", "Logged by", memberOpts("Pick your name"), meId) +
      '<div class="two">' + selectField("tc-status", "status", "Whose move is it now?", CSTAT, cStatus(c)) + textField("tc-follow", "followUp", "Follow up on", "", { type: "date", note: "Leave empty for a week from today." }) + "</div>" +
      textField("tc-next", "nextStep", "Next step", c.nextStep),
      '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">Save to the log</button>');
  }
  function saveTouch(c, v) {
    var what = String(v.what || "").replace(/\s+/g, " ").trim();
    if (!what) return Promise.reject(new Error("Write what happened first."));
    if (v.who) store.set("me", v.who);
    var today = todayStr(), who = v.who ? first(member(v.who).name) : "";
    var follow = v.followUp;
    if (!follow && v.status !== "settled") { var d = new Date(Date.now() + 7 * DAY), p = parts(d); follow = p.year + "-" + p.month + "-" + p.day; }
    var next = Object.assign({}, c, { status: v.status || c.status, followUp: v.status === "settled" ? "" : follow, nextStep: v.nextStep || "", lastContact: today,
      notes: "- " + fmtDate(today) + (who ? " (" + who + ")" : "") + ": " + what + (c.notes ? "\n" + c.notes : "") });
    stamp(next);
    return apiPost({ action: "saveContact", contact: next }).then(function (r) {
      upsert(state.data.contacts, r.contact || next);
      route(); toast("Logged" + demoNote(r));
    });
  }

  /* Funding sources (anyone on the team) */
  function fundingForm(f) {
    var editing = !!f;
    f = f || { source: "", amount: "", status: "lead", covers: "", ownerId: store.get("me") || "", due: "", campus: "berkeley", link: "", notes: "", nextStep: "", contactId: "" };
    var lp = localParts(f.due, "23:59");
    var contactOpts = [["", "None"]].concat(state.data.contacts.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }).map(function (c) { return [c.id, c.name + (c.org ? ", " + c.org : "")]; }));
    return dlgShell(editing ? "Edit funding source" : "New funding source",
      textField("fd-src", "source", "Source", f.source, { required: true, placeholder: "For example: GA Independent Organizer Grant" }) +
      '<div class="two">' + textField("fd-amt", "amount", "Amount (up to)", f.amount, { type: "number", extra: ' min="0" step="1" inputmode="numeric"' }) + selectField("fd-status", "status", "Where it stands", FSTAT, fStatus(f)) + "</div>" +
      textField("fd-covers", "covers", "What it would pay for", f.covers, { placeholder: "For example: the flight" }) +
      '<div class="two">' + selectField("fd-owner", "ownerId", "Owner on our team", memberOpts("No one yet"), f.ownerId) + selectField("fd-campus", "campus", "Campus", CAMPUS_OPTS, f.campus) + "</div>" +
      '<div class="two">' + textField("fd-date", "date", "Deadline or decision date", lp.date, { type: "date" }) + textField("fd-time", "time", "Time", lp.time, { type: "time" }) + "</div>" +
      textField("fd-next", "nextStep", "Next step", f.nextStep) +
      selectField("fd-contact", "contactId", "Who we talk to there", contactOpts, f.contactId) +
      textField("fd-link", "link", "Application or info page", f.link, { type: "url", placeholder: "https://" }) +
      areaField("fd-notes", "notes", "Notes", f.notes, "Rules, what they asked for, what we sent.", true),
      footBtns(editing, "Add funding source", "delete-funding", f.id, "Delete source"));
  }
  function saveFundingFrom(existing, v) {
    var f = Object.assign({}, existing || { id: newId("f") }, {
      source: String(v.source || "").trim(), amount: v.amount === "" ? "" : String(num(v.amount)), status: v.status || "lead", covers: v.covers || "", ownerId: v.ownerId || "",
      campus: v.campus || "", due: zonedIso(v.date, v.time), nextStep: v.nextStep || "", contactId: v.contactId || "", link: v.link || "", notes: v.notes || ""
    });
    stamp(f);
    return apiPost({ action: "saveFunding", funding: f }).then(function (r) {
      upsert(state.data.funding, r.funding || f);
      if (!existing) location.hash = "#/f/" + f.id; else route();
      toast((existing ? "Funding source saved" : "Funding source added") + demoNote(r));
    });
  }

  /* Budget lines (project manager) */
  function lineForm(b) {
    var editing = !!b;
    b = b || { item: "", amount: "", basis: "estimate", fundingId: "", status: "", campus: "berkeley", notes: "" };
    var fOpts = [["", "Nobody yet"]].concat(state.data.funding.map(function (f) { return [f.id, f.source + " (" + FLABEL[fStatus(f)].toLowerCase() + ")"]; }));
    return dlgShell(editing ? "Edit cost" : "New cost",
      textField("bl-item", "item", "Cost", b.item, { required: true, placeholder: "For example: Catering for the public dialogue" }) +
      '<div class="two">' + textField("bl-amt", "amount", "Amount", b.amount, { type: "number", extra: ' min="0" step="1" inputmode="numeric"' }) +
      selectField("bl-basis", "basis", "Based on", [["estimate", "An estimate"], ["quote", "A quote or a fixed price"]], b.basis || "estimate") + "</div>" +
      selectField("bl-fund", "fundingId", "Who covers it", fOpts, b.fundingId, "Covered shows only when this funder has said yes.") +
      '<div class="two">' + selectField("bl-campus", "campus", "Campus", CAMPUS_OPTS, b.campus) + selectField("bl-status", "status", "Needed?", [["", "Yes"], ["notneeded", "Not needed"]], b.status) + "</div>" +
      textField("bl-notes", "notes", "Note", b.notes) + pmCodeField("Needed once per device to change the budget."),
      footBtns(editing, "Add cost", "delete-line", b.id, "Delete cost"));
  }
  function saveLine(existing, v) {
    var b = Object.assign({}, existing || { id: newId("b") }, { item: String(v.item || "").trim(), amount: String(num(v.amount)), basis: v.basis || "estimate", fundingId: v.fundingId || "", campus: v.campus || "", status: v.status || "", notes: v.notes || "" });
    return apiPost({ action: "saveBudget", line: b }).then(function (r) {
      upsert(state.data.budget, r.line || b);
      route(); toast((existing ? "Cost saved" : "Cost added") + demoNote(r));
    });
  }

  /* Meetings (anyone on the team) */
  function meetingForm(m) {
    var editing = !!m;
    m = m || { title: "", start: "", end: "", where: "", link: "", docUrl: "", attendees: "", takeaway: "" };
    var s = localParts(m.start, "18:00"), e = localParts(m.end, "19:00");
    return dlgShell(editing ? "Edit meeting" : "New meeting",
      textField("mt-title", "title", "What", m.title, { required: true, placeholder: "For example: Call with PhilDev about the flight" }) +
      '<div class="two">' + textField("mt-date", "date", "Date", s.date, { type: "date", required: true }) + textField("mt-attend", "attendees", "With", m.attendees, { placeholder: "For example: Chinky (PhilDev)" }) + "</div>" +
      '<div class="two">' + textField("mt-start", "startTime", "Starts", s.time, { type: "time" }) + textField("mt-end", "endTime", "Ends", e.time, { type: "time" }) + "</div>" +
      textField("mt-where", "where", "Where", m.where, { placeholder: "For example: Zoom, or 410 Davis Hall" }) +
      textField("mt-link", "link", "Google Meet or Zoom link", m.link, { type: "url", placeholder: "https://meet.google.com/abc-defg-hij", note: "Copy it from the calendar invite. The hub then shows a Join button on Team, Meetings and the meeting's page." }) +
      textField("mt-doc", "docUrl", "Agenda or notes doc", m.docUrl, { type: "url", placeholder: "https://docs.google.com/..." }) +
      areaField("mt-take", "takeaway", "Agenda, or the key takeaway afterwards", m.takeaway, "One or two sentences, or a short list."),
      footBtns(editing, "Add meeting", "delete-meeting", m.id, "Delete meeting"));
  }
  function saveMeetingFrom(existing, v) {
    if (!v.date) return Promise.reject(new Error("Pick a date."));
    var m = Object.assign({}, existing || { id: newId("mt") }, { title: String(v.title || "").trim(), start: zonedIso(v.date, v.startTime || "09:00"), end: zonedIso(v.date, v.endTime || v.startTime || "10:00"),
      where: v.where || "", link: v.link || "", docUrl: v.docUrl || "", attendees: v.attendees || "", takeaway: v.takeaway || "" });
    return apiPost({ action: "saveMeeting", meeting: m }).then(function (r) {
      upsert(state.data.meetings, r.meeting || m);
      route(); toast((existing ? "Meeting saved" : "Meeting added") + demoNote(r));
    });
  }

  /* Deletes always need the project manager code */
  var DELETES = {
    "delete-assignment": { list: "assignments", action: "deleteAssignment", name: function (x) { return x.title; }, what: "assignment", after: "" },
    "delete-contact": { list: "contacts", action: "deleteContact", name: function (x) { return x.name; }, what: "contact", after: "#/contacts" },
    "delete-funding": { list: "funding", action: "deleteFunding", name: function (x) { return x.source; }, what: "funding source", after: "#/funding" },
    "delete-line": { list: "budget", action: "deleteBudget", name: function (x) { return x.item; }, what: "cost", after: "" },
    "delete-meeting": { list: "meetings", action: "deleteMeeting", name: function (x) { return x.title; }, what: "meeting", after: "#/meetings" }
  };
  function confirmDelete(act, id) {
    var d = DELETES[act], x = byId(state.data[d.list], id); if (!x) return;
    openDialog(dlgShell("Delete this " + d.what + "?", "<p><b>" + esc(d.name(x)) + "</b> will be removed for everyone. This can't be undone.</p>" + pmCodeField("Deleting anything needs the project manager code."),
      '<button type="button" class="btn" data-close>Keep it</button><button type="submit" class="btn btn--solid">Delete ' + esc(d.what) + "</button>"), function () {
      return apiPost({ action: d.action, id: id }).then(function (r) {
        state.data[d.list] = state.data[d.list].filter(function (y) { return y.id !== id; });
        if (d.after) location.hash = d.after; else route();
        toast("Deleted" + demoNote(r));
      });
    });
  }

  /* ---------- events ---------- */
  document.addEventListener("change", function (ev) {
    if (ev.target.id === "tl-done" || ev.target.id === "tl-only" || ev.target.id === "tl-links") { store.set({ "tl-done": "tl.done", "tl-only": "tl.crit", "tl-links": "tl.links" }[ev.target.id], ev.target.checked ? "1" : "0"); var wy = window.scrollY; route(); window.scrollTo(0, wy); return; }
    var t = ev.target;
    if (t.hasAttribute && t.hasAttribute("data-approve")) setApproval(t.getAttribute("data-approve"), t.getAttribute("data-field"), t.checked);
    if (t.name === "status" && t.closest("[data-status-for]")) setStatus(t.closest("[data-status-for]").getAttribute("data-status-for"), t.value);
    if (t.name === "cstatus" && t.closest("[data-cstatus-for]")) setContactStatus(t.closest("[data-cstatus-for]").getAttribute("data-cstatus-for"), t.value);
    if (t.name === "fstatus" && t.closest("[data-fstatus-for]")) setFundingStatus(t.closest("[data-fstatus-for]").getAttribute("data-fstatus-for"), t.value);
    if (t.closest && t.closest("#pm-filter")) {
      store.set("f.who", document.getElementById("f-who").value);
      store.set("f.proj", document.getElementById("f-proj").value);
      store.set("f.st", document.getElementById("f-st").value);
      route(); var again = document.getElementById(t.id); if (again) again.focus();
    }
    if (t.closest && t.closest("#contact-filter")) {
      store.set("c.proj", document.getElementById("cf-proj").value);
      store.set("c.who", document.getElementById("cf-who").value);
      store.set("c.campus", document.getElementById("cf-campus").value);
      route(); var again2 = document.getElementById(t.id); if (again2) again2.focus();
    }
  });
  document.addEventListener("input", function (ev) {
    if (ev.target.id === "notes-q") {
      var nq = ev.target.value.trim().toLowerCase(), shown = 0;
      document.querySelectorAll(".notes .note").forEach(function (li) { var hit = !nq || li.getAttribute("data-hay").indexOf(nq) > -1; li.hidden = !hit; if (hit) shown++; });
      var none = document.getElementById("notes-none"); if (none) none.hidden = shown > 0;
      return;
    }
    if (ev.target.id !== "file-q") return;
    var q = ev.target.value.trim().toLowerCase();
    document.querySelectorAll(".files li").forEach(function (li) { li.hidden = q && li.getAttribute("data-name").indexOf(q) === -1; });
    document.querySelectorAll(".file-group").forEach(function (g) { g.hidden = !g.querySelector("li:not([hidden])"); });
  });
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id"), x;
    if (DELETES[act]) { ev.preventDefault(); var d = b.closest("dialog"); if (d) d.close(); confirmDelete(act, id); return; }
    if (act === "tl-pick") { TL.sel = TL.sel === id && !b.closest(".tl-detail") ? "" : id; tlHighlight(); var row = document.querySelector('.tl__row[data-node="' + id + '"]'); if (row && TL.sel && b.closest(".tl-crit, .tl-fix, .tl-detail")) row.scrollIntoView({ block: "nearest" }); return; }
    if (act === "tl-clear") { TL.sel = ""; tlHighlight(); return; }
    if (act === "tl-links") { x = tlModel(); var nn = x.alias[id]; if (nn) openDialog(tlLinksForm(x, nn), function (v) { return tlSaveLinks(nn, v); }); return; }
    if (act === "new-assignment") openDialog(assignmentForm(null, b.getAttribute("data-project")), function (v) { return saveAssignment(null, v); });
    if (act === "edit-assignment") { x = byId(state.data.assignments, id); openDialog(assignmentForm(x), function (v) { return saveAssignment(x, v); }); }
    if (act === "project-status") setProjectStatus(id);
    if (act === "new-project") openDialog(projectForm(null), function (v) { return saveProject(null, v); });
    if (act === "edit-project") { x = byId(state.data.projects, id); openDialog(projectForm(x), function (v) { return saveProject(x, v); }); }
    if (act === "new-contact") openDialog(contactForm(null, b.getAttribute("data-project")), function (v) { return saveContactFrom(null, v); });
    if (act === "edit-contact") { x = byId(state.data.contacts, id); openDialog(contactForm(x), function (v) { return saveContactFrom(x, v); }); }
    if (act === "log-touch") { x = byId(state.data.contacts, id); openDialog(touchForm(x), function (v) { return saveTouch(x, v); }); }
    if (act === "new-funding") openDialog(fundingForm(null), function (v) { return saveFundingFrom(null, v); });
    if (act === "edit-funding") { x = byId(state.data.funding, id); openDialog(fundingForm(x), function (v) { return saveFundingFrom(x, v); }); }
    if (act === "new-line") openDialog(lineForm(null), function (v) { return saveLine(null, v); });
    if (act === "edit-line") { x = byId(state.data.budget, id); openDialog(lineForm(x), function (v) { return saveLine(x, v); }); }
    if (act === "new-meeting") openDialog(meetingForm(null), function (v) { return saveMeetingFrom(null, v); });
    if (act === "edit-meeting") { x = byId(state.data.meetings, id); openDialog(meetingForm(x), function (v) { return saveMeetingFrom(x, v); }); }
    if (act === "forget-pm") { store.del("pmCode"); route(); toast("Project manager code removed from this device"); }
    if (act === "send-reminders") {
      var send = function () { return apiPost({ action: "sendReminders" }).then(function (r) { toast(r.sent ? "Summary sent to you" : "Nothing to report today, so no email"); }); };
      if (needPmCode()) openDialog(dlgShell("Email me the summary now", "<p>Sends today\'s summary to you only. Nobody else gets an email.</p>" + pmCodeField(), '<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn--solid">Email me the summary</button>'), send);
      else { b.disabled = true; send().catch(function (e) { toast("Not sent: " + e.message); }).then(function () { b.disabled = false; }); }
    }
  });
  document.addEventListener("submit", function (ev) {
    if (ev.target.id !== "gate") return;
    ev.preventDefault();
    store.set("code", document.getElementById("code").value.trim());
    start();
  });
  window.addEventListener("hashchange", route);

  /* ---------- light and dark mode ---------- */
  function effectiveTheme() {
    var set = document.documentElement.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function paintToggle() {
    var b = document.getElementById("theme-toggle"); if (!b) return;
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    b.textContent = next === "light" ? "Light mode" : "Dark mode";
    b.setAttribute("aria-label", "Switch to " + next + " mode");
  }
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    store.set("theme", next); paintToggle();
  });
  if (window.matchMedia) { try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintToggle); } catch (e) { /* old browsers */ } }
  paintToggle();

  /* ---------- click sounds (same keyswitch synth as gregor-posadas.github.io) ----------
     A short synthesized tick, no audio files: one click on press, one on release, for anything that looks like a button.
     Off by default for people who asked their device for reduced motion. */
  var soundBtn = document.getElementById("sound-toggle");
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var savedSound = store.get("sound");
  var soundOn = savedSound === null ? !reducedMotion : savedSound === "on";
  var actx = null;
  function tick(kind) {
    if (!soundOn) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      if (actx.state === "suspended") { actx.resume().then(function () { play(kind); }, function () {}); return; }
      play(kind);
    } catch (e) { /* no audio */ }
  }
  function play(kind) {
    try {
      var up = kind === "up", t = actx.currentTime;
      var out = actx.createGain(); out.gain.value = up ? 0.22 : 0.35; out.connect(actx.destination);
      var dur = up ? 0.006 : 0.009, len = Math.max(1, Math.floor(actx.sampleRate * dur));
      var buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      var src = actx.createBufferSource(); src.buffer = buf;
      var hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = up ? 4500 : 3000; hp.Q.value = 0.7;
      var lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = up ? 9000 : 7000;
      src.connect(hp); hp.connect(lp); lp.connect(out); src.start(t);
      var o = actx.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(up ? 3400 : 2300, t);
      o.frequency.exponentialRampToValueAtTime(up ? 2900 : 1700, t + 0.012);
      var g = actx.createGain();
      g.gain.setValueAtTime(up ? 0.10 : 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (up ? 0.012 : 0.018));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.03);
    } catch (e) { /* no audio */ }
  }
  function paintSound() {
    if (!soundBtn) return;
    soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    var s = soundBtn.querySelector(".tool__state");
    if (s) s.textContent = soundOn ? "Sound on" : "Sound off";
  }
  if (soundBtn) {
    soundBtn.addEventListener("click", function () {
      soundOn = !soundOn; store.set("sound", soundOn ? "on" : "off"); paintSound();
      if (soundOn) { tick("down"); setTimeout(function () { tick("up"); }, 70); }
    });
    paintSound();
  }
  var PRESS = ".btn, .sign, .nav a, .tool, .picker label";
  function pressTarget(e) { var el = e.target && e.target.closest ? e.target.closest(PRESS) : null; return el && !el.disabled ? el : null; }
  var pressed = null;
  function release() { if (!pressed) return; pressed.classList.remove("is-pressed"); pressed = null; tick("up"); }
  document.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    var el = pressTarget(e); if (!el) return;
    pressed = el; tick("down");
  });
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  window.addEventListener("blur", function () { if (pressed) { pressed.classList.remove("is-pressed"); pressed = null; } });
  document.addEventListener("keydown", function (e) {
    if (e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
    var el = pressTarget(e); if (!el) return;
    el.classList.add("is-pressed"); pressed = el; tick("down");
    if (e.key === "Enter" && el.tagName === "A") setTimeout(release, 40);
  });
  document.addEventListener("keyup", function (e) { if (e.key === "Enter" || e.key === " ") release(); });

  /* ---------- stay on the newest version ----------
     GitHub Pages lets browsers cache files for up to 10 minutes. version.json is always fetched fresh; if it names
     a newer build than this one, the hub refreshes the cached files and reloads (on first load), or offers a Reload button. */
  var BUILD = "20261007005300";
  var lastVersionCheck = 0;
  function checkVersion(onLoad) {
    if (BUILD.indexOf("__") === 0) return;            // local copy without a stamp
    lastVersionCheck = Date.now();
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.v || j.v === BUILD) return;
      var tried = null; try { tried = sessionStorage.getItem("lv.reloadedFor"); } catch (e) { /* ignore */ }
      if (onLoad && tried !== j.v) { refreshTo(j.v); return; }
      var n = document.getElementById("update-notice");
      if (!n) { n = document.createElement("div"); n.id = "update-notice"; n.className = "notice"; n.setAttribute("role", "status"); document.getElementById("notice").before(n); }
      n.innerHTML = '<p><b>The hub was updated.</b> <button type="button" class="btn btn--quiet" id="reload-new">Reload to get the new version</button></p>';
      document.getElementById("reload-new").addEventListener("click", function () { refreshTo(j.v); });
    }).catch(function () { /* offline: keep going */ });
  }
  function refreshTo(v) {
    try { sessionStorage.setItem("lv.reloadedFor", v); } catch (e) { /* ignore */ }
    var urls = ["./", "index.html", "assets/app.js?v=" + v, "assets/styles.css?v=" + v, "assets/config.js?v=" + v];
    Promise.all(urls.map(function (u) { return fetch(u, { cache: "reload" }).catch(function () {}); })).then(function () { location.reload(); });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - lastVersionCheck > 5 * 60000) checkVersion(false);
  });

  function start() {
    if (!state.demo && !store.get("code")) { main.innerHTML = viewGate(""); return; }
    main.innerHTML = skeleton();
    load().then(route).catch(function (e) {
      if (e.code === "team") { store.del("code"); main.innerHTML = viewGate("That code didn't work. Check the code Gregor shared and try again."); return; }
      main.innerHTML = '<div class="wrap"><div class="head"><h1 tabindex="-1">Couldn\'t load the hub</h1><p>' + esc(e.message || "The server didn't respond.") + ' Check your connection, then reload the page.</p><div class="actions"><button class="btn btn--solid" type="button" onclick="location.reload()">Reload</button></div></div></div>';
    });
  }
  checkVersion(true);
  start();
})();
