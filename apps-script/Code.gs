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
  Assignments: ['id', 'projectId', 'memberId', 'title', 'instructions', 'due', 'link', 'linkLabel', 'status', 'updatedAt', 'updatedBy', 'calendarEventId', 'assignedAt', 'start', 'dependsOn'],
  Milestones: ['id', 'date', 'label', 'dateLabel', 'projectId', 'dependsOn'],
  Contacts: ['id', 'name', 'org', 'role', 'campus', 'projectId', 'ownerId', 'status', 'followUp', 'nextStep', 'lastContact', 'email', 'link', 'notes', 'updatedAt', 'updatedBy'],
  Funding: ['id', 'source', 'amount', 'status', 'covers', 'ownerId', 'campus', 'due', 'nextStep', 'contactId', 'link', 'notes', 'updatedAt', 'updatedBy', 'calendarEventId'],
  Budget: ['id', 'item', 'amount', 'basis', 'fundingId', 'status', 'campus', 'notes'],
  Meetings: ['id', 'title', 'start', 'end', 'where', 'link', 'docUrl', 'attendees', 'takeaway'],
  Rules: ['id', 'text'],
  Approvals: ['id', 'story', 'question', 'updatedAt', 'updatedBy'],
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
    if (p.action === 'map') return json({ ok: true, data: publicMap() });   // public: counts and approved stories only
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
      case 'setApproval': checkCode(b.code, 'team'); return json(setApproval(b.id, b.field, !!b.value, who));
      // Project manager only
      case 'saveAssignments': checkCode(b.pmCode, 'pm'); return json(saveAssignments(b.assignments || [], who));
      case 'setLinks': checkCode(b.pmCode, 'pm'); return json(setLinks(b, who));
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

function spreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}
function sheet(name) {
  var ss = spreadsheet(), sh = ss.getSheetByName(name);
  if (!sh && TABS[name]) {   // a tab added in a later version: make it on first use
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), TABS[name].length).setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
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
    rsvps: rsvpList(),
    rsvpFormUrl: setting('RSVP_FORM_URL'),
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
      assignedAt: existing && existing.memberId === input.memberId && existing.assignedAt ? existing.assignedAt : cell(new Date()),
      start: input.start !== undefined ? String(input.start || '') : (existing ? existing.start : ''),
      dependsOn: input.dependsOn !== undefined ? cleanLinks(input.dependsOn, input.id) : (existing ? existing.dependsOn : '')
    };
    a.calendarEventId = syncCalendar(a);
    writeRow('Assignments', a);
    log(who, existing ? 'edit' : 'create', a.title + ' (' + a.memberId + ')');
    return a;
  });
  return { ok: true, assignments: saved };
}

/* The timeline: what an assignment or milestone waits on (a comma-separated list of assignment and milestone ids),
   and, for assignments, an optional start date. Copies of one assignment given to several people are passed together. */
function cleanLinks(list, selfId) {
  var known = {};
  readTable('Assignments').forEach(function (a) { known[a.id] = 1; });
  readTable('Milestones').forEach(function (m) { known[m.id] = 1; });
  var out = [];
  [].concat(list || []).join(',').split(/[,\s]+/).forEach(function (id) { if (id && known[id] && id !== selfId && out.indexOf(id) < 0) out.push(id); });
  return out.join(',');
}
function setLinks(b, who) {
  var tab = b.kind === 'm' ? 'Milestones' : 'Assignments', ids = [].concat(b.ids || []);
  if (!ids.length) throw new Error('Nothing to change.');
  var saved = ids.map(function (id) {
    var row = find(tab, id);
    row.dependsOn = cleanLinks(b.dependsOn, id);
    if (tab === 'Assignments' && b.start !== undefined && b.start !== null) row.start = String(b.start || '');
    writeRow(tab, row);
    return row;
  });
  log(who, 'timeline links', (saved[0].title || saved[0].label) + ' waits on ' + (saved[0].dependsOn || 'nothing'));
  return { ok: true, rows: saved };
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

/*
 * The RSVP form is a Google Form made by createRsvpForm(). Its answers land in the "RSVP responses" tab of this Sheet.
 * The public event page reads only counts from it (action=map): how many people, which Bay Area counties, which
 * provinces, and the stories a teammate approved AND the person agreed to share without their name. Names, emails,
 * accessibility needs and questions stay in the Sheet and the team hub.
 * The province list matches event/data/ph-provinces.json exactly (PSA PSGC 2023; the NCR districts are "Metro Manila").
 */
var RSVP_TAB = 'RSVP responses';
var BAY_COUNTIES = ['Alameda', 'Contra Costa', 'Marin', 'Napa', 'San Francisco', 'San Mateo', 'Santa Clara', 'Solano', 'Sonoma'];
var PROVINCES = ["Abra", "Agusan del Norte", "Agusan del Sur", "Aklan", "Albay", "Antique", "Apayao", "Aurora", "Basilan", "Bataan", "Batanes", "Batangas", "Benguet", "Biliran", "Bohol", "Bukidnon", "Bulacan", "Cagayan", "Camarines Norte", "Camarines Sur", "Camiguin", "Capiz", "Catanduanes", "Cavite", "Cebu", "Cotabato", "Davao Occidental", "Davao Oriental", "Davao de Oro", "Davao del Norte", "Davao del Sur", "Dinagat Islands", "Eastern Samar", "Guimaras", "Ifugao", "Ilocos Norte", "Ilocos Sur", "Iloilo", "Isabela", "Kalinga", "La Union", "Laguna", "Lanao del Norte", "Lanao del Sur", "Leyte", "Maguindanao del Norte", "Maguindanao del Sur", "Marinduque", "Masbate", "Metro Manila", "Misamis Occidental", "Misamis Oriental", "Mountain Province", "Negros Occidental", "Negros Oriental", "Northern Samar", "Nueva Ecija", "Nueva Vizcaya", "Occidental Mindoro", "Oriental Mindoro", "Palawan", "Pampanga", "Pangasinan", "Quezon", "Quirino", "Rizal", "Romblon", "Samar", "Sarangani", "Siquijor", "Sorsogon", "South Cotabato", "Southern Leyte", "Sultan Kudarat", "Sulu", "Surigao del Norte", "Surigao del Sur", "Tarlac", "Tawi-Tawi", "Zambales", "Zamboanga Sibugay", "Zamboanga del Norte", "Zamboanga del Sur"];

/* The form's questions. The response tab's column headers are these titles, so the code finds answers by title. */
var Q = {
  name: 'Your name',
  email: 'Your email',
  role: 'Which best describes you?',
  attend: 'How will you join us?',
  county: 'Where do you live now?',
  tie: 'What is your connection to the Philippines?',
  prov1: 'Which province is that connection to?',
  prov2: 'Another province (optional)',
  story: 'Is there a flood your family still talks about?',
  consent: 'May we share your answer at the event, without your name?',
  question: 'What would you like to ask the speakers?',
  access: 'Is there anything you need to take part fully?'
};
var TIES = {
  'I was born there': 'born',
  'My parents are from there': 'parents',
  'My grandparents or earlier generations are from there': 'roots',
  "I've lived, worked or studied there": 'lived',
  'Another connection': 'other',
  'No connection, just interested (everyone is welcome)': 'none'
};
var NOT_SURE = 'Not sure', NO_SAY = 'Prefer not to say', OUTSIDE = 'Outside the Bay Area';
/* Banatao Auditorium holds 149. In-person seats go in the order people RSVP; after that, "In person" answers go on the waitlist. */
var SEATS = 149;
var IN_PERSON = 'In person at Banatao Auditorium', ONLINE = 'Online, on the livestream';
var WAITLIST = 'Waitlist for an in-person seat (we will email you if one opens; you can watch online meanwhile)';
var CONSENT_YES = 'Yes, you may share it without my name';

/**
 * Run once from the editor. Makes the RSVP form, sends its answers to the "RSVP responses" tab of this Sheet, and logs
 * the link to share. Running it again only logs the links. It emails no one.
 */
function createRsvpForm() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('RSVP_FORM_ID')) {
    Logger.log('The RSVP form already exists. Share: ' + props.getProperty('RSVP_FORM_URL') + '  Edit: ' + props.getProperty('RSVP_EDIT_URL'));
    return;
  }
  var appUrl = setting('APP_URL'), eventUrl = appUrl ? appUrl.replace(/\/?$/, '/') + 'event/' : '';
  var form = FormApp.create('RSVP: When the Waters Rise, with Dr. Mahar Lagmay');
  form.setDescription(
    'A free public conversation on flooding in the Philippines, with Dr. Mahar Lagmay (UP Resilience Institute and Project NOAH), ' +
    'Dr. Lisandro Claudio and Dr. Diana Martinez.\n' +
    'Monday, November 9, 2026, 4 to 5 PM Pacific. Banatao Auditorium, Sutardja Dai Hall, UC Berkeley. Also livestreamed.\n\n' +
    'Everyone is welcome, whether or not you have ties to the Philippines. It takes about two minutes.\n\n' +
    'Your name and email are only for the RSVP list and are never shown. The places you pick (a Bay Area county and a province) ' +
    'appear as anonymous counts on a map at the event and on its web page. Every question about you is optional except your name, ' +
    'your email and where you live now, and you can pick "Prefer not to say".');
  form.setConfirmationMessage("Thank you, you're on the list. " + (eventUrl ? 'See who is coming: ' + eventUrl : 'See you on November 9.'));
  form.setShowLinkToRespondAgain(false);
  try { form.setRequireLogin(false); } catch (e) { /* not a Workspace setting on this account */ }
  try { form.setCollectEmail(false); } catch (e) { /* ignore */ }

  form.addTextItem().setTitle(Q.name).setHelpText('For the RSVP list only. Never shown.').setRequired(true);
  form.addTextItem().setTitle(Q.email).setHelpText('Only for event updates, such as the start time and the livestream link.')
    .setRequired(true).setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  form.addMultipleChoiceItem().setTitle(Q.role).setRequired(false).setChoiceValues([
    'UC Berkeley student', 'UC Berkeley faculty or staff', 'Stanford student, faculty or staff', 'Student at another school',
    'Community member', NO_SAY]).showOtherOption(true);
  form.addMultipleChoiceItem().setTitle(Q.attend).setRequired(true).setChoiceValues([IN_PERSON, ONLINE, NOT_SURE + ' yet']);
  form.addListItem().setTitle(Q.county).setHelpText('Only the county is used, on the Bay Area side of the map.')
    .setRequired(true).setChoiceValues(BAY_COUNTIES.concat([OUTSIDE, NO_SAY]));

  // Page 2: the connection. "No connection" skips the province questions.
  var tiePage = form.addPageBreakItem().setTitle('Your connection to the Philippines')
    .setHelpText('There is no wrong answer here, and no connection is needed to come.');
  var tie = form.addMultipleChoiceItem().setTitle(Q.tie).setRequired(false);
  var provPage = form.addPageBreakItem().setTitle('Where in the Philippines')
    .setHelpText('Provinces are listed A to Z, and Metro Manila is one choice. Pick the place that matters most to you.');
  var p1 = form.addListItem().setTitle(Q.prov1).setRequired(false).setChoiceValues([NOT_SURE].concat(PROVINCES).concat([NO_SAY]));
  form.addListItem().setTitle(Q.prov2).setHelpText('If your family has roots in two places.').setRequired(false).setChoiceValues(PROVINCES);
  var storyPage = form.addPageBreakItem().setTitle('Stories and questions').setHelpText('Both are optional.');
  tie.setChoices(Object.keys(TIES).map(function (label) {
    return TIES[label] === 'none' ? tie.createChoice(label, storyPage) : tie.createChoice(label, provPage);
  }));
  form.addParagraphTextItem().setTitle(Q.story).setRequired(false)
    .setHelpText('A storm, a flood, what your family did. A sentence or two is plenty. Share only what you are comfortable sharing.');
  form.addMultipleChoiceItem().setTitle(Q.consent).setRequired(false)
    .setHelpText('A few answers may be read aloud or shown on screen at the start of the event, never with a name. A teammate reads every answer first.')
    .setChoiceValues([CONSENT_YES, 'No, please keep it private']);
  form.addParagraphTextItem().setTitle(Q.question).setRequired(false)
    .setHelpText('The moderator will pick from these. Questions are not shown with names.');
  form.addParagraphTextItem().setTitle(Q.access).setRequired(false)
    .setHelpText('For example live captions, wheelchair seating, or a seat near an exit. Only the organizers see this.');

  // Answers go to this Sheet, in a tab we rename so the code can find it.
  var ss = spreadsheet();
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  var url = form.getEditUrl().replace(/\/edit.*$/, '');
  ss.getSheets().forEach(function (sh) {
    var f = sh.getFormUrl();
    if (f && f.replace(/\/(edit|viewform).*$/, '') === url && sh.getName() !== RSVP_TAB) sh.setName(RSVP_TAB);
  });
  props.setProperty('RSVP_FORM_ID', form.getId());
  props.setProperty('RSVP_FORM_URL', form.getPublishedUrl());
  props.setProperty('RSVP_EDIT_URL', form.getEditUrl());
  Logger.log('RSVP form ready. Share this link: ' + form.getPublishedUrl());
  Logger.log('Edit it here: ' + form.getEditUrl());
  Logger.log('Answers go to the "' + RSVP_TAB + '" tab. Paste the share link into event/config.js (rsvpUrl).');
}

/** Every RSVP as an object keyed like Q, with id "r<row>" (rows never move: the form only appends). */
function readRsvps() {
  var sh = spreadsheet().getSheetByName(RSVP_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = values.shift().map(function (h) { return String(h).trim(); });
  var col = {};
  Object.keys(Q).forEach(function (k) { col[k] = head.indexOf(Q[k]); });
  var tsCol = head.indexOf('Timestamp');
  return values.map(function (r, i) {
    var o = { id: 'r' + (i + 2), at: tsCol > -1 ? cell(r[tsCol]) : '' };
    Object.keys(Q).forEach(function (k) { o[k] = col[k] > -1 ? String(r[col[k]] == null ? '' : r[col[k]]).trim() : ''; });
    return o;
  }).filter(function (o) { return o.name || o.email; });
}

function provinceOk(p) { return PROVINCES.indexOf(p) > -1; }

/**
 * Who holds an in-person seat. The first SEATS people who answered "In person" (in the order they RSVPed) have seats;
 * anyone after that, and anyone who picked the waitlist, is on the waitlist in order. Returns { id: 'seat' | 'waitlist' }
 * plus the counts. "Not sure yet" holds no seat.
 */
function seatPlan(rows) {
  var plan = { status: {}, place: {}, taken: 0, waitlist: 0 };
  rows.forEach(function (r) {
    var wantsSeat = /^In person/.test(r.attend), waiting = /^Waitlist/.test(r.attend);
    if (wantsSeat && plan.taken < SEATS) { plan.taken++; plan.status[r.id] = 'seat'; }
    else if (wantsSeat || waiting) { plan.waitlist++; plan.status[r.id] = 'waitlist'; plan.place[r.id] = plan.waitlist; }
  });
  plan.left = Math.max(0, SEATS - plan.taken);
  return plan;
}

/**
 * Runs on every RSVP (an installable "on form submit" trigger made by setupSeatLimit). When the seats are gone, the form's
 * "How will you join us?" question swaps "In person" for the waitlist; if seats open up again (a row deleted by hand),
 * it swaps back. It emails no one.
 */
function onRsvpSubmit() {
  CacheService.getScriptCache().remove('map');
  updateSeatChoices();
}
function updateSeatChoices() {
  var formId = PropertiesService.getScriptProperties().getProperty('RSVP_FORM_ID');
  if (!formId) return 'No RSVP form yet.';
  var plan = seatPlan(readRsvps()), full = plan.left === 0;
  var item = FormApp.openById(formId).getItems(FormApp.ItemType.MULTIPLE_CHOICE).filter(function (it) { return it.getTitle() === Q.attend; })[0];
  if (!item) return 'Could not find the "' + Q.attend + '" question.';
  item.asMultipleChoiceItem().setChoiceValues(full ? [WAITLIST, ONLINE, NOT_SURE + ' yet'] : [IN_PERSON, ONLINE, NOT_SURE + ' yet'])
    .setHelpText(full ? 'All ' + SEATS + ' in-person seats are taken. Join the waitlist or watch the livestream.'
                      : 'Banatao Auditorium holds ' + SEATS + '. In-person seats go in the order people RSVP.');
  return full ? 'Full: the form now offers the waitlist (' + plan.waitlist + ' waiting).' : plan.left + ' of ' + SEATS + ' seats left.';
}

/** Run once from the editor: makes the trigger that keeps the form in step with the seats, and sets the form right now. */
function setupSeatLimit() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onRsvpSubmit'; });
  if (!has) ScriptApp.newTrigger('onRsvpSubmit').forSpreadsheet(spreadsheet()).onFormSubmit().create();
  Logger.log((has ? 'The seat trigger was already there. ' : 'Seat trigger made. ') + updateSeatChoices());
}

/** Public, no code: anonymous counts for the map, and the stories a teammate approved that the person agreed to share. */
function publicMap() {
  var cache = CacheService.getScriptCache(), hit = cache.get('map');
  if (hit) return JSON.parse(hit);
  var rows = readRsvps(), approvals = indexBy(readTable('Approvals')), plan = seatPlan(rows);
  var out = { total: rows.length, attend: { inPerson: 0, online: 0, unsure: 0, waitlist: 0 }, seats: { capacity: SEATS, taken: plan.taken, left: plan.left },
    bay: {}, ph: {}, links: {}, sets: {}, ties: {}, stories: [], updated: cell(new Date()) };
  rows.forEach(function (r) {
    var seat = plan.status[r.id];
    if (seat === 'seat') out.attend.inPerson++; else if (seat === 'waitlist') out.attend.waitlist++;
    else if (/^Online/.test(r.attend)) out.attend.online++; else out.attend.unsure++;
    var county = BAY_COUNTIES.indexOf(r.county) > -1 ? r.county : r.county === OUTSIDE ? 'outside' : 'unsaid';
    out.bay[county] = (out.bay[county] || 0) + 1;
    var tie = TIES[r.tie] || 'unsaid';
    out.ties[tie] = (out.ties[tie] || 0) + 1;
    var provs = [];
    if (tie !== 'none') [r.prov1, r.prov2].forEach(function (p) { if (provinceOk(p) && provs.indexOf(p) < 0) provs.push(p); });
    if (provs.length) { var set = provs.slice().sort().join('|'); out.sets[set] = (out.sets[set] || 0) + 1; }   // people, not places
    provs.forEach(function (p) {
      out.ph[p] = (out.ph[p] || 0) + 1;
      var key = county + '|' + p;
      out.links[key] = (out.links[key] || 0) + 1;
    });
    var ok = approvals[r.id] && approvals[r.id].story === 'yes';
    if (ok && r.consent === CONSENT_YES && r.story) out.stories.push({ text: r.story.slice(0, 600), province: provs[0] || '' });
  });
  out.links = Object.keys(out.links).map(function (k) { var p = k.split('|'); return { from: p[0], to: p[1], n: out.links[k] }; });
  try { cache.put('map', JSON.stringify(out), 60); } catch (e) { /* too big to cache */ }
  return out;
}

/** For the team hub (team code): every RSVP with the approval marks. Emails stay in the Sheet. */
function rsvpList() {
  var approvals = indexBy(readTable('Approvals')), rows = readRsvps(), plan = seatPlan(rows);
  return rows.map(function (r) {
    var a = approvals[r.id] || {};
    return { id: r.id, at: r.at, name: r.name, role: r.role, attend: r.attend, seat: plan.status[r.id] || '', waitPlace: plan.place[r.id] || 0, county: r.county, tie: TIES[r.tie] || '',
      prov1: r.prov1, prov2: r.prov2, story: r.story, consent: r.consent === CONSENT_YES, question: r.question, access: r.access,
      storyOk: a.story === 'yes', questionOk: a.question === 'yes' };
  });
}

/** A teammate approves a story for the screen, or picks a question for the moderator. */
function setApproval(id, field, value, who) {
  if (!/^r\d+$/.test(String(id || ''))) throw new Error('Unknown RSVP.');
  if (['story', 'question'].indexOf(field) < 0) throw new Error('Unknown field.');
  var a = indexBy(readTable('Approvals'))[id] || { id: id, story: '', question: '' };
  a[field] = value ? 'yes' : '';
  a.updatedAt = cell(new Date()); a.updatedBy = who;
  writeRow('Approvals', a);
  CacheService.getScriptCache().remove('map');
  log(who, 'rsvp ' + field, id + ' -> ' + (value ? 'yes' : 'no'));
  return { ok: true, approval: a };
}
