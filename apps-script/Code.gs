/**
 * Lagmay Visit Hub: backend.
 *
 * Paste this file into the Apps Script editor of the "Lagmay Visit Hub data"
 * Google Sheet (Extensions > Apps Script), run setup() once, then deploy as a web app.
 * Full steps are in README.md.
 *
 * What it does:
 *  - Serves the team's members, workstreams, assignments, contacts, funding, budget,
 *    meetings and Drive files to the website.
 *  - Saves changes back to the Sheet. Anyone with the team code can update their own
 *    work, contacts, funding sources and meetings. Assignments, workstreams, the budget
 *    and every delete need the project manager code.
 *  - Keeps assignment, workstream and funding deadlines on one shared
 *    "Lagmay visit deadlines" calendar, without inviting anyone.
 *  - Emails the project manager a summary every morning on days with something in it.
 *    Teammates get no email (set TEAM_EMAILS to 'on' in Script properties to change that).
 */

var TZ = 'America/Los_Angeles';
var APP_NAME = 'Lagmay Visit Hub';
var TABS = {
  Members: ['id', 'name', 'email', 'role', 'campus', 'color', 'textColor', 'emailPref'],
  Projects: ['id', 'name', 'campus', 'leadId', 'due', 'link', 'description', 'status', 'calendarEventId'],
  Assignments: ['id', 'projectId', 'memberId', 'title', 'instructions', 'due', 'link', 'linkLabel', 'status', 'updatedAt', 'updatedBy', 'calendarEventId', 'assignedAt'],
  Milestones: ['id', 'date', 'label', 'dateLabel', 'projectId'],
  Contacts: ['id', 'name', 'org', 'role', 'campus', 'projectId', 'ownerId', 'status', 'followUp', 'nextStep', 'lastContact', 'email', 'link', 'notes', 'updatedAt', 'updatedBy'],
  Funding: ['id', 'source', 'amount', 'status', 'covers', 'ownerId', 'campus', 'due', 'nextStep', 'contactId', 'link', 'notes', 'updatedAt', 'updatedBy', 'calendarEventId'],
  Budget: ['id', 'item', 'amount', 'basis', 'fundingId', 'status', 'campus', 'notes'],
  Meetings: ['id', 'title', 'start', 'end', 'where', 'link', 'docUrl', 'attendees', 'takeaway'],
  Rules: ['id', 'text'],
  Log: ['timestamp', 'who', 'action', 'detail']
};

var DEFAULTS = {
  FOLDER_ID: '10D8K0m294pmMo6uYNr2slKSOXGJvo6ny',           // the shared "Dr. Lagmay Visit" Drive folder
  MEETINGS_FOLDER_ID: '1CHy4VFSHm6qzL6QMuMbEU2e6W64s4oGn',  // its Meetings subfolder
  TEAM_EMAILS: 'off'       // 'on' sends each teammate their own reminders; 'off' (default) emails only the project manager
};
function setting(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || DEFAULTS[key] || '';
}
var STATUSES = ['todo', 'doing', 'done'];
var CONTACT_STATUSES = ['ours', 'theirs', 'new', 'settled'];
var FUNDING_STATUSES = ['secured', 'pending', 'working', 'lead', 'declined'];
var CAMPUSES = ['berkeley', 'stanford', 'both'];

/* ------------------------------------------------------------------ setup */

/** Run once from the editor. Creates tabs, the deadlines calendar, the daily trigger and access codes. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());

  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = TABS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), head.length).setNumberFormat('@');
    sh.setFrozenRows(1);
  });

  if (!props.getProperty('CALENDAR_ID')) {
    var cal = CalendarApp.createCalendar('Lagmay visit deadlines', { timeZone: TZ, color: CalendarApp.Color.BLUE });
    props.setProperty('CALENDAR_ID', cal.getId());
  }
  if (!props.getProperty('TEAM_CODE')) props.setProperty('TEAM_CODE', randomCode());
  if (!props.getProperty('PM_CODE')) props.setProperty('PM_CODE', randomCode() + '-' + randomCode());
  if (!props.getProperty('PM_EMAIL')) props.setProperty('PM_EMAIL', Session.getActiveUser().getEmail());

  // The Sheet's own folder is the team folder unless FOLDER_ID says otherwise; its "Meetings" subfolder holds the notes.
  if (!props.getProperty('FOLDER_ID')) {
    var parents = DriveApp.getFileById(ss.getId()).getParents();
    if (parents.hasNext()) props.setProperty('FOLDER_ID', parents.next().getId());
  }
  if (!props.getProperty('MEETINGS_FOLDER_ID') && props.getProperty('FOLDER_ID')) {
    var subs = DriveApp.getFolderById(props.getProperty('FOLDER_ID')).getFoldersByName('Meetings');
    if (subs.hasNext()) props.setProperty('MEETINGS_FOLDER_ID', subs.next().getId());
  }

  var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (handlers.indexOf('sendDailyReminders') < 0) {
    ScriptApp.newTrigger('sendDailyReminders').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
  }

  Logger.log('Setup done.');
  Logger.log('Team code (share with the team): ' + props.getProperty('TEAM_CODE'));
  Logger.log('Project manager code (keep to yourself): ' + props.getProperty('PM_CODE'));
  Logger.log('Team folder: ' + (props.getProperty('FOLDER_ID') || 'not set') + '. Meetings folder: ' + (props.getProperty('MEETINGS_FOLDER_ID') || 'not set') + '.');
  Logger.log('Next: set APP_URL in Project Settings > Script properties to your GitHub Pages address, then deploy as a web app.');
}

/** Run after setup (and again after editing the Sheet by hand): puts every open deadline on the shared calendar. */
function syncAllCalendarEvents() {
  var n = 0;
  readTable('Assignments').forEach(function (a) {
    if (a.status === 'done' || !a.due) return;
    var id = syncCalendar(a);
    if (id !== a.calendarEventId) { a.calendarEventId = id; writeRow('Assignments', a); }
    n++;
  });
  readTable('Projects').forEach(function (p) {
    if (p.status === 'done' || !p.due) return;
    var id = syncProjectCalendar(p);
    if (id !== p.calendarEventId) { p.calendarEventId = id; writeRow('Projects', p); }
    n++;
  });
  readTable('Funding').forEach(function (f) {
    var id = syncFundingCalendar(f);
    if (id !== f.calendarEventId) { f.calendarEventId = id; writeRow('Funding', f); }
    if (id) n++;
  });
  Logger.log('Deadlines calendar synced: ' + n + ' events. No one is invited to these events.');
}

function randomCode() {
  var words = ['baha', 'ilog', 'ulan', 'noah', 'bagyo', 'agos', 'dagat', 'lawa', 'bundok', 'habagat', 'amihan', 'pampang'];
  return words[Math.floor(Math.random() * words.length)] + '-' + Math.floor(1000 + Math.random() * 9000);
}

/* ------------------------------------------------------------------ web app */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'data') {
      checkCode(p.code, 'team');
      return json({ ok: true, data: payload() });
    }
    return json({ ok: true, service: APP_NAME });
  } catch (err) {
    return json({ ok: false, error: err.message, code: err.codeType || '' });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var b = JSON.parse(e.postData.contents || '{}');
    lock.waitLock(20000);
    var who = String(b.who || '');
    switch (b.action) {
      // Anyone on the team
      case 'setStatus': checkCode(b.code, 'team'); return json(setStatus(b.id, b.status, who));
      case 'setProjectStatus': checkCode(b.code, 'team'); return json(setProjectStatus(b.id, b.status, who));
      case 'setEmailPref': checkCode(b.code, 'team'); return json(setEmailPref(b.memberId, b.pref));
      case 'saveContact': checkCode(b.code, 'team'); return json(saveContact(b.contact || {}, who));
      case 'saveFunding': checkCode(b.code, 'team'); return json(saveFunding(b.funding || {}, who));
      case 'saveMeeting': checkCode(b.code, 'team'); return json(saveMeeting(b.meeting || {}, who));
      // Project manager only
      case 'saveAssignments': checkCode(b.pmCode, 'pm'); return json(saveAssignments(b.assignments || [], who));
      case 'deleteAssignment': checkCode(b.pmCode, 'pm'); return json(deleteAssignment(b.id, who));
      case 'saveProject': checkCode(b.pmCode, 'pm'); return json(saveProject(b.project || {}, who));
      case 'saveBudget': checkCode(b.pmCode, 'pm'); return json(saveBudget(b.line || {}, who));
      case 'deleteBudget': checkCode(b.pmCode, 'pm'); return json(deleteSimple('Budget', b.id, who));
      case 'deleteContact': checkCode(b.pmCode, 'pm'); return json(deleteSimple('Contacts', b.id, who));
      case 'deleteMeeting': checkCode(b.pmCode, 'pm'); return json(deleteSimple('Meetings', b.id, who));
      case 'deleteFunding': checkCode(b.pmCode, 'pm'); return json(deleteFunding(b.id, who));
      case 'sendReminders': checkCode(b.pmCode, 'pm'); return json({ ok: true, sent: sendDailyReminders() });
      default: throw new Error('Unknown action.');
    }
  } catch (err) {
    return json({ ok: false, error: err.message, code: err.codeType || '' });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkCode(code, level) {
  var props = PropertiesService.getScriptProperties();
  var pm = props.getProperty('PM_CODE'), team = props.getProperty('TEAM_CODE');
  var ok = level === 'pm' ? code && code === pm : code && (code === team || code === pm);
  if (!ok) {
    var err = new Error(level === 'pm' ? 'The project manager code is wrong.' : 'The team code is wrong.');
    err.codeType = level;
    throw err;
  }
}

/* ------------------------------------------------------------------ data */

function sheet(name) {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  return ss.getSheetByName(name);
}

function cell(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  return v === null || v === undefined ? '' : String(v);
}

function readTable(name) {
  var sh = sheet(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(1, 1, sh.getLastRow(), TABS[name].length).getValues();
  var head = values.shift();
  return values.filter(function (r) { return String(r[0]).trim() !== ''; }).map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = cell(r[i]); });
    return o;
  });
}

function writeRow(name, obj) {
  var sh = sheet(name), head = TABS[name];
  var row = head.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : String(obj[h]); });
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var i = ids.indexOf(String(obj[head[0]]));
  var range = i > -1 ? sh.getRange(i + 2, 1, 1, head.length) : sh.getRange(sh.getLastRow() + 1, 1, 1, head.length);
  range.setNumberFormat('@').setValues([row]);
}

function deleteRow(name, id) {
  var sh = sheet(name);
  if (sh.getLastRow() < 2) return;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
  var i = ids.indexOf(String(id));
  if (i > -1) sh.deleteRow(i + 2);
}

function log(who, action, detail) {
  sheet('Log').appendRow([cell(new Date()), who || '', action, detail || '']);
}

function payload() {
  var members = readTable('Members').map(function (m) {
    return { id: m.id, name: m.name, email: m.email, role: m.role, campus: m.campus, color: m.color, textColor: m.textColor, emailPref: m.emailPref || 'daily' };
  });
  return {
    members: members,
    projects: readTable('Projects'),
    assignments: readTable('Assignments'),
    milestones: readTable('Milestones'),
    contacts: readTable('Contacts'),
    funding: readTable('Funding'),
    budget: readTable('Budget'),
    meetings: readTable('Meetings').sort(function (a, b) { return a.start < b.start ? -1 : 1; }),
    rules: readTable('Rules'),
    files: listFiles(),
    notes: meetingNotes(),
    generated: cell(new Date())
  };
}

function find(name, id, quiet) {
  var list = readTable(name);
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  if (quiet) return null;
  throw new Error('That item no longer exists. Reload the page.');
}
function indexBy(list) { var o = {}; list.forEach(function (x) { o[x.id] = x; }); return o; }
function url(u) { return /^https?:\/\//i.test(u || '') ? String(u) : ''; }
function oneOf(v, list, fallback) { return list.indexOf(v) > -1 ? v : fallback; }
function dateStr(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : ''; }
function text(v, max) { return String(v == null ? '' : v).slice(0, max || 5000); }

/* ------------------------------------------------------------------ actions: assignments and workstreams */

function setStatus(id, status, who) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status.');
  var a = find('Assignments', id);
  a.status = status;
  a.updatedAt = cell(new Date());
  a.updatedBy = who;
  a.calendarEventId = syncCalendar(a);
  writeRow('Assignments', a);
  log(who, 'status', a.title + ' -> ' + status);
  return { ok: true, assignment: a };
}

function saveAssignments(list, who) {
  var members = indexBy(readTable('Members'));
  var saved = list.map(function (input) {
    if (!input.title || !String(input.title).trim()) throw new Error('Every assignment needs a title.');
    if (!members[input.memberId]) throw new Error('Unknown team member: ' + input.memberId);
    var existing = input.id ? find('Assignments', input.id, true) : null;
    var a = {
      id: input.id || 'a-' + Utilities.getUuid().slice(0, 8),
      projectId: input.projectId || '',
      memberId: input.memberId,
      title: text(input.title, 300).trim(),
      instructions: text(input.instructions),
      due: input.due || '',
      link: url(input.link),
      linkLabel: text(input.linkLabel, 100),
      status: existing ? existing.status : oneOf(input.status, STATUSES, 'todo'),
      updatedAt: cell(new Date()),
      updatedBy: who,
      calendarEventId: existing ? existing.calendarEventId : '',
      assignedAt: existing && existing.memberId === input.memberId && existing.assignedAt ? existing.assignedAt : cell(new Date())
    };
    a.calendarEventId = syncCalendar(a);
    writeRow('Assignments', a);
    log(who, existing ? 'edit' : 'create', a.title + ' (' + a.memberId + ')');
    return a;
  });
  return { ok: true, assignments: saved };
}

function deleteAssignment(id, who) {
  var a = find('Assignments', id);
  removeEvent(a.calendarEventId);
  deleteRow('Assignments', id);
  log(who, 'delete', a.title + ' (' + a.memberId + ')');
  return { ok: true };
}

function saveProject(input, who) {
  if (!input.id || !input.name) throw new Error('A workstream needs a name.');
  var existing = find('Projects', input.id, true);
  var p = {
    id: input.id,
    name: text(input.name, 200).trim(),
    campus: oneOf(input.campus, CAMPUSES, ''),
    leadId: input.leadId || '',
    due: input.due || '',
    link: url(input.link),
    description: text(input.description),
    status: input.status === 'done' ? 'done' : '',
    calendarEventId: existing ? existing.calendarEventId : ''
  };
  p.calendarEventId = syncProjectCalendar(p);
  writeRow('Projects', p);
  log(who, existing ? 'workstream edit' : 'workstream create', p.name);
  return { ok: true, project: p };
}

/** Anyone on the team can mark a workstream done (or undo it). */
function setProjectStatus(id, status, who) {
  var p = find('Projects', id);
  p.status = status === 'done' ? 'done' : '';
  p.calendarEventId = syncProjectCalendar(p);
  writeRow('Projects', p);
  log(who, 'workstream status', p.name + ' -> ' + (p.status || 'open'));
  return { ok: true, project: p };
}

/* ------------------------------------------------------------------ actions: contacts, funding, budget, meetings */

function saveContact(input, who) {
  if (!input.name || !String(input.name).trim()) throw new Error('A contact needs a name.');
  var existing = input.id ? find('Contacts', input.id, true) : null;
  var c = {
    id: input.id || 'c-' + Utilities.getUuid().slice(0, 8),
    name: text(input.name, 200).trim(),
    org: text(input.org, 200),
    role: text(input.role, 200),
    campus: oneOf(input.campus, CAMPUSES, ''),
    projectId: input.projectId || '',
    ownerId: input.ownerId || '',
    status: oneOf(input.status, CONTACT_STATUSES, 'new'),
    followUp: dateStr(input.followUp),
    nextStep: text(input.nextStep, 500),
    lastContact: dateStr(input.lastContact),
    email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(input.email || '').trim()) ? String(input.email).trim() : '',
    link: url(input.link),
    notes: text(input.notes, 20000),
    updatedAt: cell(new Date()),
    updatedBy: who
  };
  writeRow('Contacts', c);
  log(who, existing ? 'contact edit' : 'contact create', c.name + ' (' + c.status + ')');
  return { ok: true, contact: c };
}

function saveFunding(input, who) {
  if (!input.source || !String(input.source).trim()) throw new Error('A funding source needs a name.');
  var existing = input.id ? find('Funding', input.id, true) : null;
  var amount = String(input.amount == null ? '' : input.amount).replace(/[$,\s]/g, '');
  var f = {
    id: input.id || 'f-' + Utilities.getUuid().slice(0, 8),
    source: text(input.source, 200).trim(),
    amount: amount && isFinite(Number(amount)) ? String(Math.round(Number(amount))) : '',
    status: oneOf(input.status, FUNDING_STATUSES, 'lead'),
    covers: text(input.covers, 200),
    ownerId: input.ownerId || '',
    campus: oneOf(input.campus, CAMPUSES, ''),
    due: input.due || '',
    nextStep: text(input.nextStep, 500),
    contactId: input.contactId || '',
    link: url(input.link),
    notes: text(input.notes, 20000),
    updatedAt: cell(new Date()),
    updatedBy: who,
    calendarEventId: existing ? existing.calendarEventId : ''
  };
  f.calendarEventId = syncFundingCalendar(f);
  writeRow('Funding', f);
  log(who, existing ? 'funding edit' : 'funding create', f.source + ' (' + f.status + ')');
  return { ok: true, funding: f };
}

function deleteFunding(id, who) {
  var f = find('Funding', id);
  removeEvent(f.calendarEventId);
  deleteRow('Funding', id);
  log(who, 'delete Funding', f.source);
  return { ok: true };
}

function saveBudget(input, who) {
  if (!input.item || !String(input.item).trim()) throw new Error('A cost needs a name.');
  var existing = input.id ? find('Budget', input.id, true) : null;
  var amount = Number(String(input.amount || '0').replace(/[$,\s]/g, ''));
  var b = {
    id: input.id || 'b-' + Utilities.getUuid().slice(0, 8),
    item: text(input.item, 200).trim(),
    amount: isFinite(amount) ? String(Math.round(amount)) : '0',
    basis: input.basis === 'quote' ? 'quote' : 'estimate',
    fundingId: input.fundingId || '',
    status: input.status === 'notneeded' ? 'notneeded' : '',
    campus: oneOf(input.campus, CAMPUSES, ''),
    notes: text(input.notes, 500)
  };
  writeRow('Budget', b);
  log(who, existing ? 'budget edit' : 'budget create', b.item + ' $' + b.amount);
  return { ok: true, line: b };
}

function saveMeeting(input, who) {
  if (!input.title || !input.start) throw new Error('A meeting needs a name and a date.');
  var existing = input.id ? find('Meetings', input.id, true) : null;
  var m = {
    id: input.id || 'mt-' + Utilities.getUuid().slice(0, 8),
    title: text(input.title, 200).trim(),
    start: input.start,
    end: input.end || input.start,
    where: text(input.where, 200),
    link: url(input.link),
    docUrl: url(input.docUrl),
    attendees: text(input.attendees, 300),
    takeaway: text(input.takeaway, 5000)
  };
  writeRow('Meetings', m);
  log(who, existing ? 'meeting edit' : 'meeting create', m.title + ' ' + m.start);
  return { ok: true, meeting: m };
}

function deleteSimple(tab, id, who) {
  var x = find(tab, id, true);
  if (!x) return { ok: true };
  deleteRow(tab, id);
  log(who, 'delete ' + tab, x.name || x.item || x.title || id);
  return { ok: true };
}

/* ------------------------------------------------------------------ calendar */

function calendar() {
  var id = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID');
  return id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
}

/** One 30-minute event ending at the deadline, on the shared calendar with no guests. Returns the event id ('' when there is no event). */
function deadlineEvent(eventId, title, dueIso, description) {
  var cal = calendar(), ev = null;
  if (!dueIso) { removeEvent(eventId); return ''; }
  var end = new Date(dueIso), start = new Date(end.getTime() - 30 * 60000);
  if (eventId) { try { ev = cal.getEventById(eventId); } catch (e) { ev = null; } }
  if (ev) {
    ev.setTitle(title);
    ev.setDescription(description);
    if (ev.getEndTime().getTime() !== end.getTime()) ev.setTime(start, end);
    return ev.getId();
  }
  ev = cal.createEvent(title, start, end, { description: description });
  ev.addPopupReminder(24 * 60);
  ev.addPopupReminder(60);
  return ev.getId();
}
function hubLink(path) { var u = setting('APP_URL'); return u ? '\n\n' + APP_NAME + ': ' + u + '#/' + path : ''; }

function syncCalendar(a) {
  if (!a.due) { removeEvent(a.calendarEventId); return ''; }
  var member = indexBy(readTable('Members'))[a.memberId] || {};
  var who = member.name ? ' (' + member.name.split(' ')[0] + ')' : '';
  return deadlineEvent(a.calendarEventId, (a.status === 'done' ? 'Done' : 'Due') + who + ': ' + a.title, a.due,
    (a.instructions || '') + (a.link ? '\n\nDocument: ' + a.link : '') + hubLink('a/' + a.id));
}
function syncProjectCalendar(p) {
  return deadlineEvent(p.calendarEventId, (p.status === 'done' ? 'Done: ' : 'Workstream deadline: ') + p.name, p.due,
    (p.description || '') + (p.link ? '\n\nDocument: ' + p.link : '') + hubLink('p/' + p.id));
}
/** Funding deadlines only matter while we're still working on the application, or waiting on the decision. */
function syncFundingCalendar(f) {
  if (['working', 'lead', 'pending'].indexOf(f.status) < 0) { removeEvent(f.calendarEventId); return ''; }
  return deadlineEvent(f.calendarEventId, (f.status === 'pending' ? 'Funding decision: ' : 'Funding deadline: ') + f.source, f.due,
    (f.nextStep ? 'Next step: ' + f.nextStep + '\n\n' : '') + (f.notes || '') + (f.link ? '\n\n' + f.link : '') + hubLink('f/' + f.id));
}
function removeEvent(eventId) {
  if (!eventId) return;
  try { var ev = calendar().getEventById(eventId); if (ev) ev.deleteEvent(); } catch (e) { /* already gone */ }
}

/* ------------------------------------------------------------------ meeting notes archive */

/**
 * Every Google Doc in the Meetings folder, newest first, with its title and summary line:
 * the text under a "Key takeaway" heading, or else the first point under "Decisions".
 * The date comes from a yyyy-mm-dd at the start of the file name, a "Date: m/d/yyyy" line, or the day the doc was made.
 * A doc is only re-read when it changes, and the list is cached for 5 minutes.
 */
function meetingNotes() {
  var cache = CacheService.getScriptCache(), hit = cache.get('notes');
  if (hit) return JSON.parse(hit);
  var folderId = setting('MEETINGS_FOLDER_ID');
  if (!folderId) return [];
  var props = PropertiesService.getScriptProperties(), store = {};
  try { store = JSON.parse(props.getProperty('NOTES_INDEX') || '{}'); } catch (e) { store = {}; }
  var out = [], keep = {};
  var files = DriveApp.getFolderById(folderId).getFilesByType(MimeType.GOOGLE_DOCS);
  while (files.hasNext()) {
    var f = files.next(), id = f.getId(), updated = cell(f.getLastUpdated()), info = store[id];
    if (!info || info.u !== updated) { try { info = summarizeNotes(id); } catch (e) { info = {}; } info.u = updated; }
    keep[id] = info;
    var named = /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(f.getName());
    var date = named ? named[1] : info.d || Utilities.formatDate(f.getDateCreated(), TZ, 'yyyy-MM-dd');
    out.push({ id: id, date: date, title: info.t || (named ? named[2] : f.getName()), takeaway: info.k || '', url: f.getUrl(), modified: updated });
  }
  try { props.setProperty('NOTES_INDEX', JSON.stringify(keep)); } catch (e) { /* too big to keep; it will just re-read */ }
  out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  try { cache.put('notes', JSON.stringify(out), 300); } catch (e) { /* too big to cache */ }
  return out;
}

function summarizeNotes(id) {
  var body = DocumentApp.openById(id).getBody(), title = '', take = [], decisions = [], section = '', date = '';
  for (var i = 0; i < body.getNumChildren(); i++) {
    var el = body.getChild(i), type = el.getType();
    if (type !== DocumentApp.ElementType.PARAGRAPH && type !== DocumentApp.ElementType.LIST_ITEM) continue;
    var t = (type === DocumentApp.ElementType.PARAGRAPH ? el.asParagraph().getText() : el.asListItem().getText()).trim();
    var heading = type === DocumentApp.ElementType.PARAGRAPH ? el.asParagraph().getHeading() : DocumentApp.ParagraphHeading.NORMAL;
    if (!date) {
      var dm = /^Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
      if (dm) date = dm[3] + '-' + ('0' + dm[1]).slice(-2) + '-' + ('0' + dm[2]).slice(-2);
    }
    if (heading !== DocumentApp.ParagraphHeading.NORMAL) {
      if (!title && (heading === DocumentApp.ParagraphHeading.HEADING1 || heading === DocumentApp.ParagraphHeading.TITLE)) {
        title = t.replace(/^\d{4}-\d{2}-\d{2}\s*[·\-–:]?\s*/, '').replace(/^Meeting Notes:\s*/i, '');
      }
      section = /^key takeaway/i.test(t) ? 'take' : /^decisions/i.test(t) ? 'dec' : '';
      continue;
    }
    if (!t || t.charAt(0) === '[') continue;
    if (section === 'take') take.push(t);
    else if (section === 'dec' && decisions.length < 1) decisions.push(t);
  }
  var k = (take.length ? take : decisions).join(' ');
  return { t: title.slice(0, 120), k: k.length > 300 ? k.slice(0, 297) + '...' : k, d: date };
}

/* ------------------------------------------------------------------ Drive */

function listFiles() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('files');
  if (hit) return JSON.parse(hit);
  var id = setting('FOLDER_ID');
  if (!id) return [];
  var out = [];
  collect(DriveApp.getFolderById(id), '', out, 0);
  out.sort(function (a, b) { return a.modified < b.modified ? 1 : -1; });
  out = out.slice(0, 300);
  try { cache.put('files', JSON.stringify(out), 600); } catch (e) { /* too big to cache */ }
  return out;
}

function collect(folder, path, out, depth) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    out.push({ name: f.getName(), url: f.getUrl(), type: fileType(f.getMimeType()), modified: cell(f.getLastUpdated()), folder: path || 'Top level' });
  }
  if (depth >= 2) return;
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var s = subs.next();
    collect(s, path ? path + ' / ' + s.getName() : s.getName(), out, depth + 1);
  }
}

function fileType(mime) {
  var map = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.form': 'Google Form',
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint'
  };
  if (map[mime]) return map[mime];
  if (/^image\//.test(mime)) return 'Image';
  if (/^video\//.test(mime)) return 'Video';
  if (/^audio\//.test(mime)) return 'Audio';
  return 'File';
}

/* ------------------------------------------------------------------ reminders */

/*
 * Reminder emails, quiet by design:
 *  - At most one email per person per day (8 AM), and none on days with nothing to say.
 *  - Each item links straight to its page in the hub.
 *  - Overdue items and follow-ups come up the day after they're due, then every third day, not daily.
 *  - Each person picks Daily (default), Weekly (Monday mornings) or Off on their own page.
 */
var EMAIL_PREFS = ['daily', 'weekly', 'off'];

/** Runs every morning at 8 AM (set up by setup()). Returns the number of emails sent. */
function sendDailyReminders() {
  var props = PropertiesService.getScriptProperties();
  var appUrl = setting('APP_URL');
  var members = readTable('Members'), assignments = readTable('Assignments');
  var projects = indexBy(readTable('Projects'));
  var contacts = readTable('Contacts'), funding = readTable('Funding');
  var now = new Date(), DAYMS = 86400000;
  var lastRun = props.getProperty('LAST_DIGEST') ? new Date(props.getProperty('LAST_DIGEST')) : new Date(now.getTime() - DAYMS);
  var isMonday = Utilities.formatDate(now, TZ, 'u') === '1';
  var today = dayNum(now);
  var sent = 0;
  var link = function (path) { return appUrl ? appUrl + '#/' + path : ''; };
  var byDue = function (a, b) { return new Date(a.due) - new Date(b.due); };
  var dateDay = function (s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAYMS; };

  // Teammates get no email unless TEAM_EMAILS is 'on'. The project manager's summary below always goes out.
  if (setting('TEAM_EMAILS') === 'on') members.forEach(function (m) {
    var pref = EMAIL_PREFS.indexOf(m.emailPref) > -1 ? m.emailPref : 'daily';
    if (!m.email || pref === 'off' || (pref === 'weekly' && !isMonday)) return;
    var days = pref === 'weekly' ? 7 : 2;
    var horizon = new Date(now.getTime() + days * DAYMS);
    var since = pref === 'weekly' ? new Date(now.getTime() - 7 * DAYMS) : lastRun;
    var nag = function (late) { return pref === 'weekly' || late <= 1 || late % 3 === 0; };

    var open = assignments.filter(function (a) { return a.memberId === m.id && a.status !== 'done'; });
    var overdue = open.filter(function (a) { return a.due && new Date(a.due) < now && nag(today - dayNum(new Date(a.due))); }).sort(byDue);
    var soon = open.filter(function (a) { return a.due && new Date(a.due) >= now && new Date(a.due) <= horizon; }).sort(byDue);
    var shown = {}; overdue.concat(soon).forEach(function (a) { shown[a.id] = true; });
    var fresh = open.filter(function (a) { return !shown[a.id] && a.assignedAt && new Date(a.assignedAt) > since && a.updatedBy !== m.id; }).sort(byDue);

    var follow = contacts.filter(function (c) {
      if (c.ownerId !== m.id || ['ours', 'theirs'].indexOf(c.status) < 0 || !dateStr(c.followUp)) return false;
      var diff = dateDay(c.followUp) - today;
      return diff < 0 ? nag(-diff) : diff <= days;
    }).sort(function (a, b) { return a.followUp < b.followUp ? -1 : 1; });
    var money = funding.filter(function (f) {
      return f.ownerId === m.id && ['working', 'lead'].indexOf(f.status) > -1 && f.due && new Date(f.due) <= new Date(now.getTime() + Math.max(days, 7) * DAYMS) && new Date(f.due) >= new Date(now.getTime() - DAYMS);
    }).sort(byDue);
    if (!overdue.length && !soon.length && !fresh.length && !follow.length && !money.length) return;

    var item = function (a) {
      var d = a.due ? new Date(a.due) : null, proj = projects[a.projectId];
      var when = d ? (d < now ? 'Was due ' : 'Due ') + relDay(d, now) + ' at ' + Utilities.formatDate(d, TZ, 'h:mm a') : 'No due date';
      return emailItem(link('a/' + a.id), a.title, when + (proj ? ', ' + proj.name : ''), a.link, a.linkLabel || 'Open the document');
    };
    var contactItem = function (c) {
      var diff = dateDay(c.followUp) - today;
      var when = diff < 0 ? 'Follow-up was due ' + (-diff) + (diff === -1 ? ' day' : ' days') + ' ago' : diff === 0 ? 'Follow up today' : 'Follow up ' + (diff === 1 ? 'tomorrow' : 'in ' + diff + ' days');
      return emailItem(link('c/' + c.id), c.name + (c.org ? ', ' + c.org : ''), when + (c.status === 'ours' ? '. They are waiting on us.' : '. Nudge them if there is no answer.') + (c.nextStep ? ' Next: ' + c.nextStep : ''), '', '');
    };
    var moneyItem = function (f) {
      var d = new Date(f.due);
      return emailItem(link('f/' + f.id), f.source, 'Deadline ' + relDay(d, now) + ' at ' + Utilities.formatDate(d, TZ, 'h:mm a') + (f.nextStep ? '. Next: ' + f.nextStep : ''), f.link, 'Open the application');
    };
    var parts = [];
    if (overdue.length) parts.push(overdue.length + ' overdue');
    if (soon.length) parts.push(soon.length + (pref === 'weekly' ? ' due this week' : ' due soon'));
    if (fresh.length) parts.push(fresh.length + ' new');
    if (follow.length) parts.push(follow.length + ' follow-up' + (follow.length > 1 ? 's' : ''));
    if (money.length) parts.push(money.length + ' funding deadline' + (money.length > 1 ? 's' : ''));
    var html = emailShell(
      'Hi ' + m.name.split(' ')[0] + ',',
      emailSection('Overdue', overdue.map(item)) +
      emailSection(pref === 'weekly' ? 'Due this week' : 'Due soon', soon.map(item)) +
      emailSection('New for you', fresh.map(item)) +
      emailSection('People to follow up with', follow.map(contactItem)) +
      emailSection('Funding deadlines', money.map(moneyItem)),
      appUrl ? '<a href="' + esc(link('m/' + m.id)) + '">See everything on your page</a> or <a href="' + esc(link('m/' + m.id + '/email')) + '">change how often you get these emails</a>.' : '');
    sendMail(m.email, 'Lagmay visit: ' + parts.join(', '), html);
    sent++;
  });

  // Project manager summary, only on days with something in it.
  var pmEmail = props.getProperty('PM_EMAIL');
  if (pmEmail) {
    var byMember = indexBy(members), week = new Date(now.getTime() + 7 * DAYMS);
    var first = function (id) { return ((byMember[id] || {}).name || id || 'No one').split(' ')[0]; };
    var open = assignments.filter(function (a) { return a.status !== 'done'; });
    var late = open.filter(function (a) { return a.due && new Date(a.due) < now; }).sort(byDue);
    var upcoming = open.filter(function (a) { return a.due && new Date(a.due) >= now && new Date(a.due) <= week; }).sort(byDue);
    var doneRecent = assignments.filter(function (a) { return a.status === 'done' && a.updatedAt && new Date(a.updatedAt) >= lastRun; });
    var stale = contacts.filter(function (c) { return ['ours', 'theirs'].indexOf(c.status) > -1 && dateStr(c.followUp) && dateDay(c.followUp) <= today + 1; })
      .sort(function (a, b) { return a.followUp < b.followUp ? -1 : 1; });
    var deadlines = funding.filter(function (f) { return ['working', 'lead', 'pending'].indexOf(f.status) > -1 && f.due && new Date(f.due) <= week && new Date(f.due) >= new Date(now.getTime() - DAYMS); }).sort(byDue);
    var fundNews = funding.filter(function (f) { return f.updatedAt && new Date(f.updatedAt) >= lastRun; });
    var row = function (a) {
      return emailItem(link('a/' + a.id), first(a.memberId) + ': ' + a.title, a.due ? relDay(new Date(a.due), now) + ' at ' + Utilities.formatDate(new Date(a.due), TZ, 'h:mm a') : '', '', '');
    };
    var LABEL = { secured: 'secured', pending: 'waiting on a decision', working: 'working on it', lead: 'not started', declined: 'declined' };
    if (late.length || upcoming.length || doneRecent.length || stale.length || deadlines.length || fundNews.length) {
      var pmHtml = emailShell('Team summary',
        emailSection('Funding changes since the last summary', fundNews.map(function (f) { return emailItem(link('f/' + f.id), f.source, 'Now ' + (LABEL[f.status] || f.status) + (f.amount ? ', $' + f.amount : ''), '', ''); })) +
        emailSection('Funding deadlines in the next 7 days', deadlines.map(function (f) { return emailItem(link('f/' + f.id), f.source, first(f.ownerId) + ', ' + relDay(new Date(f.due), now), '', ''); })) +
        emailSection('Overdue', late.map(row)) +
        emailSection('Follow-ups due by tomorrow', stale.map(function (c) {
          var diff = dateDay(c.followUp) - today;
          var when = diff < 0 ? 'was due ' + Utilities.formatDate(new Date(c.followUp + 'T12:00:00'), TZ, 'EEE, MMM d') : diff === 0 ? 'due today' : 'due tomorrow';
          return emailItem(link('c/' + c.id), c.name + (c.org ? ', ' + c.org : ''), first(c.ownerId) + ', ' + when + (c.nextStep ? '. Next: ' + c.nextStep : ''), '', '');
        })) +
        emailSection('Due in the next 7 days', upcoming.map(row)) +
        emailSection('Finished since the last summary', doneRecent.map(row)),
        appUrl ? '<a href="' + esc(link('pm')) + '">Open the project view</a>' : '');
      sendMail(pmEmail, 'Lagmay visit summary: ' + late.length + ' overdue, ' + stale.length + ' follow-ups due', pmHtml);
      sent++;
    }
  }
  props.setProperty('LAST_DIGEST', cell(now));
  return sent;
}

function dayNum(d) { var s = Utilities.formatDate(d, TZ, 'yyyy-MM-dd').split('-'); return Date.UTC(+s[0], +s[1] - 1, +s[2]) / 86400000; }
/** "today", "tomorrow", "yesterday", "Fri, Oct 2" */
function relDay(d, now) {
  var diff = dayNum(d) - dayNum(now);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return Utilities.formatDate(d, TZ, 'EEE, MMM d');
}
function emailItem(href, title, meta, docUrl, docLabel) {
  return '<li style="margin:0 0 16px">' +
    (href ? '<a href="' + esc(href) + '" style="color:#000;font-weight:700">' + esc(title) + '</a>' : '<b>' + esc(title) + '</b>') +
    (meta ? '<br><span style="color:#4d4a43">' + esc(meta) + '</span>' : '') +
    (docUrl ? '<br><a href="' + esc(docUrl) + '" style="color:#0060a0">' + esc(docLabel) + '</a>' : '') + '</li>';
}
function emailSection(title, items) {
  return items.length ? '<h3 style="font-size:16px;margin:20px 0 8px;border-bottom:2px solid #000;padding-bottom:4px">' + esc(title) + '</h3><ul style="list-style:none;padding:0;margin:0">' + items.join('') + '</ul>' : '';
}
function emailShell(greeting, body, footer) {
  return '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#000;max-width:560px">' +
    '<p style="margin:0 0 4px">' + esc(greeting) + '</p>' + body +
    (footer ? '<p style="margin:24px 0 0;font-size:14px;color:#4d4a43">' + footer + '</p>' : '') + '</div>';
}
/** Sends from the university's no-reply address when allowed, so it reads as the hub, not a person. */
function sendMail(to, subject, html, replyTo) {
  var msg = { to: to, subject: subject, htmlBody: html, body: stripHtml(html), name: APP_NAME };
  if (replyTo) msg.replyTo = replyTo;
  try { MailApp.sendEmail(Object.assign({ noReply: !replyTo }, msg)); }
  catch (e) { MailApp.sendEmail(msg); }
}

/** Anyone can set their own reminder email preference from their page in the hub. */
function setEmailPref(memberId, pref) {
  if (EMAIL_PREFS.indexOf(pref) < 0) throw new Error('Pick daily, weekly or off.');
  var m = indexBy(readTable('Members'))[memberId];
  if (!m) throw new Error('Unknown team member.');
  m.emailPref = pref;
  writeRow('Members', m);
  log(memberId, 'email setting', pref);
  return { ok: true, member: { id: m.id, emailPref: pref } };
}

function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function stripHtml(h) { return h.replace(/<\/[uo]l>/g, '\n\n').replace(/<li[^>]*>/g, '\n- ').replace(/<br>/g, '\n').replace(/<\/p>/g, '\n\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'); }
