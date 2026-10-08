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
  ConnectReview: ['id', 'card', 'introSentAt', 'updatedAt', 'updatedBy'],
  RsvpMail: ['id', 'sentAt', 'kind'],
  Log: ['timestamp', 'who', 'action', 'detail']
};

var DEFAULTS = {
  FOLDER_ID: '10D8K0m294pmMo6uYNr2slKSOXGJvo6ny',           // the shared "Dr. Lagmay Visit" Drive folder
  MEETINGS_FOLDER_ID: '1CHy4VFSHm6qzL6QMuMbEU2e6W64s4oGn',  // its Meetings subfolder
  CHECKIN_SHEET_ID: '12MAeXvAl9_QhQf_Cha2cFpmnUokpSADz3FZQLdp8MgM',  // the door check-in spreadsheet for Nov 9 (separate, so volunteers see no hub data)
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

/**
 * Run after setup (and again after editing the Sheet by hand): puts every open deadline on the shared calendar,
 * and takes finished ones off.
 */
function syncAllCalendarEvents() {
  var n = 0, removed = 0;
  readTable('Assignments').forEach(function (a) {
    if (!onCalendar(a, 'memberId') && !a.calendarEventId) return;
    var id = syncCalendar(a);
    if (id !== a.calendarEventId) { if (!id) removed++; a.calendarEventId = id; writeRow('Assignments', a); }
    if (id) n++;
  });
  readTable('Projects').forEach(function (p) {
    if (!onCalendar(p, 'leadId') && !p.calendarEventId) return;
    var id = syncProjectCalendar(p);
    if (id !== p.calendarEventId) { if (!id) removed++; p.calendarEventId = id; writeRow('Projects', p); }
    if (id) n++;
  });
  readTable('Funding').forEach(function (f) {
    var id = syncFundingCalendar(f);
    if (id !== f.calendarEventId) { f.calendarEventId = id; writeRow('Funding', f); }
    if (id) n++;
  });
  Logger.log('Deadlines calendar synced: ' + n + ' open deadlines; ' + removed + ' removed (done, undated or someone else\'s). No one is invited to these events.');
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
    if (p.action === 'connect') return json({ ok: true, data: publicConnect() });   // public: approved cards only, never emails
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
      case 'setConnectCard': checkCode(b.code, 'team'); return json(setConnectCard(b.id, !!b.value, who));
      case 'previewConnectIntros': checkCode(b.code, 'team'); return json({ ok: true, preview: connectIntroPlan().summary });
      case 'sendConnectIntros': checkCode(b.pmCode, 'pm'); return json(sendConnectIntros(who));
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
    connect: connectList(),
    connectFormUrl: setting('CONNECT_FORM_URL'),
    checkinUrl: setting('CHECKIN_SHEET_ID') ? 'https://docs.google.com/spreadsheets/d/' + setting('CHECKIN_SHEET_ID') + '/edit' : '',
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

/*
 * The calendar is the project manager's own: it shows only their open work. Teammates' assignments stay in the hub.
 * The PM is the team member whose email matches PM_EMAIL; set CALENDAR_MEMBER in Script properties to pick someone else.
 */
function calendarOwnerId() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('CALENDAR_MEMBER');
  if (id) return id;
  var email = String(props.getProperty('PM_EMAIL') || '').toLowerCase();
  var me = readTable('Members').filter(function (m) { return email && String(m.email || '').toLowerCase() === email; })[0];
  return me ? me.id : '';
}
/* Whether a row belongs on the calendar: open, dated, and the owner's (or nobody's, for workstreams and funding). */
function onCalendar(row, ownerField) {
  if (!row.due || row.status === 'done') return false;
  var mine = calendarOwnerId(), owner = row[ownerField] || '';
  return !mine || owner === mine || (ownerField !== 'memberId' && !owner);
}
/* Finished work and teammates' work come off the calendar; reopening or reassigning puts it back. */
function syncCalendar(a) {
  if (!onCalendar(a, 'memberId')) { removeEvent(a.calendarEventId); return ''; }
  return deadlineEvent(a.calendarEventId, 'Due: ' + a.title, a.due,
    (a.instructions || '') + (a.link ? '\n\nDocument: ' + a.link : '') + hubLink('a/' + a.id));
}
function syncProjectCalendar(p) {
  if (!onCalendar(p, 'leadId')) { removeEvent(p.calendarEventId); return ''; }
  return deadlineEvent(p.calendarEventId, 'Workstream deadline: ' + p.name, p.due,
    (p.description || '') + (p.link ? '\n\nDocument: ' + p.link : '') + hubLink('p/' + p.id));
}
/** Funding deadlines only matter while we're still working on the application, or waiting on the decision. */
function syncFundingCalendar(f) {
  if (['working', 'lead', 'pending'].indexOf(f.status) < 0 || !onCalendar({ due: f.due, ownerId: f.ownerId }, 'ownerId')) { removeEvent(f.calendarEventId); return ''; }
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
  county: 'Which Bay Area county do you live in?',
  tie: 'What is your connection to the Philippines?',
  prov1: 'Which province is that connection to?',
  prov2: 'Another province (optional)',
  story: 'Is there a flood your family still talks about?',
  consent: 'May we share your answer at the event, without your name?',
  question: 'What would you like to ask the speakers?',
  access: 'Is there anything you need to take part fully?',
  diet: 'Any food allergies or dietary restrictions?'
};
/* Earlier titles of renamed questions, so answers given before the rename are still found. */
var Q_OLD = { county: ['Where do you live now?'] };
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
/* "How will you join us?" is single choice. Only the panel in Banatao Auditorium has the 149-seat limit. */
/* The campus goes before the speaker so no one reads it as Dr. Lagmay's own university; he is visiting from UPRI. */
var LECTURE = 'Guest lecture by Dr. Mahar Lagmay, in person on the UC Berkeley campus, Nov 9, 11 AM to 12 PM';
var PANEL = 'Panel with Drs. Mahar Lagmay, Lisandro Claudio and Diana Martinez, in person in Banatao Auditorium on the UC Berkeley campus, Nov 9, 4 to 5 PM';
var STANFORD = 'Guest lecture by Dr. Mahar Lagmay, in person on the Stanford campus, Nov 10';
var ONLINE = 'Online, on the livestream of the Nov 9 panel';
var WAITLIST = 'Waitlist for the Nov 9 panel at UC Berkeley (we will email you if a seat opens; you can watch online meanwhile)';
var IN_PERSON = PANEL;   // the seat-limited choice
function joinChoices(full) { return [LECTURE, full ? WAITLIST : PANEL, STANFORD, ONLINE, NOT_SURE + ' yet']; }
/* Which event an answer is for. Earlier wordings still count: "In person at Banatao Auditorium" (the first form) and
   "In-person panel discussion" / "In-person guest lecture, morning" (Oct 5) were the panel and the morning lecture. */
function joinKind(a) {
  a = String(a || '');
  if (/^Waitlist/.test(a)) return 'waitlist';
  if (/^Online/.test(a)) return 'online';
  if (/^(Panel|In-person panel|In person at Banatao)/.test(a)) return 'panel';
  if (/lecture/i.test(a) && /Stanford/.test(a)) return 'stanford';
  if (/lecture/i.test(a)) return 'lecture';
  return 'unsure';
}
var CONSENT_YES = 'Yes, you may share it without my name';

/**
 * Run once from the editor. Makes the RSVP form, sends its answers to the "RSVP responses" tab of this Sheet, and logs
 * the link to share. Running it again only logs the links. It emails no one.
 */
/* The text at the top of the RSVP form. reviseRsvpForm() puts it on the live form too. */
function rsvpDescription() {
  return 'A free public conversation on flooding in the Philippines with Dr. Mahar Lagmay, visiting from the UP Resilience Institute ' +
    'and Project NOAH, and UC Berkeley faculty Dr. Lisandro Claudio and Dr. Diana Martinez.\n' +
    'Monday, November 9, 2026, 4 to 5 PM Pacific. Banatao Auditorium, Sutardja Dai Hall, UC Berkeley. Also livestreamed.\n' +
    'This form also takes RSVPs for Dr. Lagmay\'s guest lecture on the UC Berkeley campus that morning and his talk on the Stanford campus on November 10.\n\n' +
    'Everyone is welcome, whether or not you have ties to the Philippines. It takes about two minutes.\n\n' +
    'Your name and email are only for the RSVP list and are never shown. The places you pick (a Bay Area county and a province) ' +
    'appear as anonymous counts on a map at the event and on its web page. Only your name, your email, how you\'ll join and your county ' +
    'are required, and the county question has "Prefer not to say".';
}

function createRsvpForm() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('RSVP_FORM_ID')) {
    Logger.log('The RSVP form already exists. Share: ' + props.getProperty('RSVP_FORM_URL') + '  Edit: ' + props.getProperty('RSVP_EDIT_URL'));
    return;
  }
  var appUrl = setting('APP_URL'), eventUrl = appUrl ? appUrl.replace(/\/?$/, '/') + 'event/' : '';
  var form = FormApp.create('RSVP: When the Waters Rise, with Dr. Mahar Lagmay');
  form.setDescription(rsvpDescription());
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
  form.addMultipleChoiceItem().setTitle(Q.attend).setHelpText(joinHelp()).setRequired(true).setChoiceValues(joinChoices(false));
  form.addListItem().setTitle(Q.county).setHelpText(COUNTY_HELP)
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
  form.addParagraphTextItem().setTitle(Q.diet).setRequired(false).setHelpText(DIET_HELP);

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
  Object.keys(Q).forEach(function (k) { col[k] = head.indexOf(Q[k]); (Q_OLD[k] || []).forEach(function (t) { if (col[k] < 0) col[k] = head.indexOf(t); }); });
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
    var kind = joinKind(r.attend), wantsSeat = kind === 'panel', waiting = kind === 'waitlist';
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
  try { sendRsvpConfirmations(); } catch (err) { log('rsvp mail', 'error', String(err && err.message || err)); }
  try { syncCheckinSheet(); } catch (err) { log('check-in', 'error', String(err && err.message || err)); }
}
function updateSeatChoices() {
  var formId = PropertiesService.getScriptProperties().getProperty('RSVP_FORM_ID');
  if (!formId) return 'No RSVP form yet.';
  var plan = seatPlan(readRsvps()), full = plan.left === 0;
  var item = FormApp.openById(formId).getItems(FormApp.ItemType.MULTIPLE_CHOICE).filter(function (it) { return it.getTitle() === Q.attend; })[0];
  if (!item) return 'Could not find the "' + Q.attend + '" question.';
  item.asMultipleChoiceItem().setChoiceValues(joinChoices(full))
    .setHelpText(full ? 'Pick one. Dr. Lagmay is visiting from the University of the Philippines Resilience Institute. All ' + SEATS + ' seats for the Nov 9 panel in Banatao Auditorium are taken; you can join its waitlist or watch the livestream.'
                      : joinHelp());
  return full ? 'Full: the form now offers the waitlist (' + plan.waitlist + ' waiting).' : plan.left + ' of ' + SEATS + ' seats left.';
}

function joinHelp() { return 'Pick one. Dr. Lagmay is visiting from the University of the Philippines Resilience Institute. The Nov 9 panel is in Banatao Auditorium, which holds ' + SEATS + '; seats go in the order people RSVP.'; }
var COUNTY_HELP = 'If you live outside the Bay Area, pick "Outside the Bay Area".';
var DIET_HELP = 'For the refreshments after the panel. Optional, and only the organizers see this.';

/**
 * Run once from the editor (Oct 2026 changes): renames the county question, makes "How will you join us?" a single choice
 * across the morning lecture, the panel, the Stanford lecture and the livestream, and adds the food question before the
 * last page ends. Safe to run again: it only changes what still needs changing. Existing answers keep their columns.
 */
function reviseRsvpForm() {
  var formId = PropertiesService.getScriptProperties().getProperty('RSVP_FORM_ID');
  if (!formId) { Logger.log('No RSVP form yet.'); return; }
  var form = FormApp.openById(formId), items = form.getItems(), done = [];
  if (form.getDescription() !== rsvpDescription()) { form.setDescription(rsvpDescription()); done.push('description updated'); }
  var county = items.filter(function (it) { return it.getTitle() === Q.county || (Q_OLD.county || []).indexOf(it.getTitle()) > -1; })[0];
  if (county) { county.setTitle(Q.county).setHelpText(COUNTY_HELP); done.push('county question renamed'); }
  done.push(updateSeatChoices());
  var hasDiet = items.some(function (it) { return it.getTitle() === Q.diet; });
  if (!hasDiet) {
    var access = items.filter(function (it) { return it.getTitle() === Q.access; })[0];
    var diet = form.addParagraphTextItem().setTitle(Q.diet).setRequired(false).setHelpText(DIET_HELP);
    if (access) form.moveItem(diet.getIndex(), access.getIndex() + 1);
    done.push('food question added');
  }
  CacheService.getScriptCache().remove('map');
  Logger.log(done.join('; '));
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
  var out = { total: rows.length, attend: { inPerson: 0, lecture: 0, stanford: 0, online: 0, unsure: 0, waitlist: 0 }, seats: { capacity: SEATS, taken: plan.taken, left: plan.left },
    bay: {}, ph: {}, links: {}, sets: {}, ties: {}, stories: [], updated: cell(new Date()) };
  rows.forEach(function (r) {
    var seat = plan.status[r.id];
    var kind = joinKind(r.attend);
    if (seat === 'seat') out.attend.inPerson++; else if (seat === 'waitlist') out.attend.waitlist++;
    else if (kind === 'lecture' || kind === 'stanford' || kind === 'online') out.attend[kind]++; else out.attend.unsure++;
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
      prov1: r.prov1, prov2: r.prov2, story: r.story, consent: r.consent === CONSENT_YES, question: r.question, access: r.access, diet: r.diet,
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


/* ------------------------------------------------------------------ connect */
/*
 * Connect: people working on (or hoping to work on) Philippine-based projects add a short card, so they can find each other
 * through the event. Cards come in through a Google Form (createConnectForm). A teammate reads each card in the hub and ticks
 * it; only then does it appear on the event page (if the person said yes to that) and join the intro emails (if they said yes
 * to those). Emails are never public: they go only to people who both asked for introductions and were approved.
 */
var CONNECT_TAB = 'Connect responses';
var CQ = {
  name: 'Your name',
  email: 'Your email',
  org: 'School, organization or work',
  base: 'Where are you based?',
  areas: 'What do you work on or care about?',
  project: 'What are you working on, or hoping to work on?',
  seeking: 'What are you looking for?',
  link: 'A link where people can find you',
  nov9: 'Will you be at the event on November 9?',
  show: 'Show your card on the event page?',
  intros: 'Get introductions by email?'
};
var CONNECT_AREAS = ['Floods, disasters and climate resilience', 'Water and sanitation', 'Environment and conservation', 'Cities, housing and infrastructure',
  'Data, mapping and technology', 'Policy, governance and history', 'Health', 'Education and youth', 'Agriculture and food',
  'Business and social enterprise', 'Arts, culture and media'];
var CONNECT_SEEKING = ['Collaborators', 'A mentor', 'Someone to mentor', 'Research partners', 'Partners in the Philippines', 'Funding or funders',
  'Jobs or internships', 'Volunteers', 'Just to meet people'];
var CONNECT_BASES = ['Bay Area', 'Elsewhere in the US', 'Philippines', 'Somewhere else'];
var CONNECT_NOV9 = ['Yes, in person', 'Yes, online', 'Not this time'];
var SHOW_YES = "Yes, show my card (my name, school or organization, interests, project, what I'm looking for and my link, never my email)";
var SHOW_NO = 'No, keep it off the page';
var INTRO_YES = 'Yes. Before November 9, send me people with matching interests, and share my card and email with them';
var INTRO_NO = 'No thanks';
var CONNECT_MAX_MATCHES = 8;

function connectDescription() {
  return 'Working on something in or for the Philippines, or hoping to? Add a card so people at When the Waters Rise can find you, ' +
    'whether they are in the room, watching online or in the Philippines. The event is Monday, November 9, 2026 at UC Berkeley, co-hosted with PhilDev. ' +
    'Anyone is welcome, and you do not need to RSVP to the talk to add a card.\n\n' +
    'An organizer reads every card before it appears. Your email is never shown on the page. If you say yes to introductions, ' +
    'we will email you a short list of people with matching interests before November 9 and share your card and email with them. ' +
    'To change or remove your card, email gregorposadas@berkeley.edu. It takes about three minutes.';
}

/**
 * Run once from the editor. Makes the Connect form, sends its answers to the "Connect responses" tab of this Sheet, and logs
 * the link to share. Running it again only logs the links. It emails no one.
 */
function createConnectForm() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('CONNECT_FORM_ID')) {
    Logger.log('The Connect form already exists. Share: ' + props.getProperty('CONNECT_FORM_URL') + '  Edit: ' + props.getProperty('CONNECT_EDIT_URL'));
    return;
  }
  var appUrl = setting('APP_URL'), eventUrl = appUrl ? appUrl.replace(/\/?$/, '/') + 'event/#connect' : '';
  var form = FormApp.create('Connect: people working on Philippine projects (When the Waters Rise)');
  form.setDescription(connectDescription());
  form.setConfirmationMessage('Thank you. An organizer will read your card soon' + (eventUrl ? ', and approved cards appear here: ' + eventUrl : '.'));
  form.setShowLinkToRespondAgain(false);
  try { form.setRequireLogin(false); } catch (e) { /* not a Workspace setting on this account */ }
  try { form.setCollectEmail(false); } catch (e) { /* ignore */ }

  form.addTextItem().setTitle(CQ.name).setHelpText('Shown on your card if you choose to show it.').setRequired(true);
  form.addTextItem().setTitle(CQ.email).setHelpText('Never shown on the page. Shared only through intro emails, if you ask for them.')
    .setRequired(true).setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  form.addTextItem().setTitle(CQ.org).setHelpText('For example a school, a company, an NGO, or "Independent".').setRequired(false);
  form.addMultipleChoiceItem().setTitle(CQ.base).setRequired(true).setChoiceValues(CONNECT_BASES);
  form.addCheckboxItem().setTitle(CQ.areas).setHelpText('Pick all that fit.').setRequired(true).setChoiceValues(CONNECT_AREAS).showOtherOption(true);
  form.addParagraphTextItem().setTitle(CQ.project).setRequired(true)
    .setHelpText('A sentence or two about a project or idea in or for the Philippines. Up to 300 characters. This is the heart of your card.')
    .setValidation(FormApp.createParagraphTextValidation().requireTextLengthLessThanOrEqualTo(300).build());
  form.addCheckboxItem().setTitle(CQ.seeking).setHelpText('Pick all that fit.').setRequired(true).setChoiceValues(CONNECT_SEEKING);
  form.addTextItem().setTitle(CQ.link).setRequired(false)
    .setHelpText('Optional. LinkedIn, a website or a project page, shown on your card. Leave it blank to be reached only through intro emails.');
  form.addMultipleChoiceItem().setTitle(CQ.nov9).setRequired(true).setChoiceValues(CONNECT_NOV9)
    .setHelpText('Not needed to add a card. If you are coming, RSVP on the event page.');
  form.addMultipleChoiceItem().setTitle(CQ.show).setRequired(true).setChoiceValues([SHOW_YES, SHOW_NO])
    .setHelpText('An organizer reads every card first.');
  form.addMultipleChoiceItem().setTitle(CQ.intros).setRequired(true).setChoiceValues([INTRO_YES, INTRO_NO])
    .setHelpText('Introductions only go to people who also said yes.');

  var ss = spreadsheet();
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  var base = form.getEditUrl().replace(/\/edit.*$/, '');
  ss.getSheets().forEach(function (sh) {
    var f = sh.getFormUrl();
    if (f && f.replace(/\/(edit|viewform).*$/, '') === base && sh.getName() !== CONNECT_TAB) sh.setName(CONNECT_TAB);
  });
  props.setProperty('CONNECT_FORM_ID', form.getId());
  props.setProperty('CONNECT_FORM_URL', form.getPublishedUrl());
  props.setProperty('CONNECT_EDIT_URL', form.getEditUrl());
  Logger.log('Connect form ready. Share this link: ' + form.getPublishedUrl());
  Logger.log('Edit it here: ' + form.getEditUrl());
  Logger.log('Answers go to the "' + CONNECT_TAB + '" tab. Paste the share link into event/config.js (connectUrl).');
}

/* Google Forms joins checkbox answers with ", ", and some choices contain commas, so pick out the known choices first. */
function splitChoices(value, known) {
  var rest = String(value || ''), found = [];
  known.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (k) {
    var i = rest.indexOf(k);
    if (i > -1) { found.push(k); rest = rest.slice(0, i) + rest.slice(i + k.length); }
  });
  found.sort(function (a, b) { return known.indexOf(a) - known.indexOf(b); });
  var other = rest.replace(/^[\s,]+|[\s,]+$/g, '').replace(/(\s*,\s*){2,}/g, ', ');
  if (other) found.push(other.slice(0, 40));
  return found;
}
function normalizeLink(v) {
  var s = String(v || '').trim();
  if (!s || /\s/.test(s)) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(s) ? s.slice(0, 300) : '';
}

/** Every Connect card as an object keyed like CQ, with id "c<row>" (the form only appends, so rows never move). */
function readConnect() {
  var sh = spreadsheet().getSheetByName(CONNECT_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = values.shift().map(function (h) { return String(h).trim(); });
  var col = {};
  Object.keys(CQ).forEach(function (k) { col[k] = head.indexOf(CQ[k]); });
  var tsCol = head.indexOf('Timestamp');
  return values.map(function (r, i) {
    var o = { id: 'c' + (i + 2), at: tsCol > -1 ? cell(r[tsCol]) : '' };
    Object.keys(CQ).forEach(function (k) { o[k] = col[k] > -1 ? String(r[col[k]] == null ? '' : r[col[k]]).trim() : ''; });
    return o;
  }).filter(function (o) { return o.name || o.email; });
}

/* One card as the public sees it. No email, ever. */
function connectCard(r) {
  return {
    id: r.id,
    name: text(r.name, 80),
    org: text(r.org, 120),
    base: CONNECT_BASES.indexOf(r.base) > -1 ? r.base : '',
    areas: splitChoices(r.areas, CONNECT_AREAS),
    project: text(r.project, 300),
    seeking: splitChoices(r.seeking, CONNECT_SEEKING).filter(function (x) { return CONNECT_SEEKING.indexOf(x) > -1; }),
    link: normalizeLink(r.link),
    nov9: r.nov9 === CONNECT_NOV9[0] ? 'in-person' : r.nov9 === CONNECT_NOV9[1] ? 'online' : ''
  };
}

/** Public, no code: approved cards from people who asked to be shown, newest first. */
function publicConnect() {
  var cache = CacheService.getScriptCache(), hit = cache.get('connect');
  if (hit) return JSON.parse(hit);
  var review = indexBy(readTable('ConnectReview'));
  var cards = readConnect().filter(function (r) { return review[r.id] && review[r.id].card === 'yes' && r.show === SHOW_YES; })
    .reverse().map(connectCard);
  var out = { cards: cards, updated: cell(new Date()) };
  try { cache.put('connect', JSON.stringify(out), 60); } catch (e) { /* too big to cache */ }
  return out;
}

/** For the team hub (team code): every card with its review state. Emails stay in the Sheet. */
function connectList() {
  var review = indexBy(readTable('ConnectReview'));
  return readConnect().map(function (r) {
    var c = connectCard(r), rv = review[r.id] || {};
    c.at = r.at; c.show = r.show === SHOW_YES; c.intros = r.intros === INTRO_YES;
    c.cardOk = rv.card === 'yes'; c.introSentAt = rv.introSentAt || '';
    return c;
  });
}

/** A teammate approves a card (or takes it back down). */
function setConnectCard(id, value, who) {
  if (!/^c\d+$/.test(String(id || ''))) throw new Error('Unknown card.');
  var rv = indexBy(readTable('ConnectReview'))[id] || { id: id, card: '', introSentAt: '' };
  rv.card = value ? 'yes' : '';
  rv.updatedAt = cell(new Date()); rv.updatedBy = who;
  writeRow('ConnectReview', rv);
  CacheService.getScriptCache().remove('connect');
  log(who, 'connect card', id + ' -> ' + (value ? 'approved' : 'hidden'));
  return { ok: true, review: rv };
}

/*
 * Who each person should meet. Only approved cards from people who asked for introductions take part, on both sides.
 * Score: one point per shared area, plus two when one wants a mentor and the other wants someone to mentor.
 * Pure (no Google services), so it can be tested.
 */
function matchConnect(people) {
  function score(a, b) {
    var s = a.areas.filter(function (x) { return b.areas.indexOf(x) > -1; }).length;
    var wants = function (p, x) { return p.seeking.indexOf(x) > -1; };
    if ((wants(a, 'A mentor') && wants(b, 'Someone to mentor')) || (wants(a, 'Someone to mentor') && wants(b, 'A mentor'))) s += 2;
    return s;
  }
  return people.map(function (p) {
    var matches = people.filter(function (q) { return q.id !== p.id && q.email.toLowerCase() !== p.email.toLowerCase(); })
      .map(function (q) { return { person: q, score: score(p, q), shared: p.areas.filter(function (x) { return q.areas.indexOf(x) > -1; }) }; })
      .filter(function (m) { return m.score > 0; })
      .sort(function (a, b) { return b.score - a.score || (a.person.id < b.person.id ? -1 : 1); })
      .slice(0, CONNECT_MAX_MATCHES);
    return { person: p, matches: matches };
  });
}

function connectIntroPlan() {
  var review = indexBy(readTable('ConnectReview'));
  var people = readConnect().filter(function (r) {
    return review[r.id] && review[r.id].card === 'yes' && r.intros === INTRO_YES && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email);
  }).map(function (r) { var c = connectCard(r); c.email = r.email; c.sent = review[r.id].introSentAt || ''; return c; });
  var plan = matchConnect(people);
  var toSend = plan.filter(function (x) { return !x.person.sent && x.matches.length; });
  return { plan: toSend, summary: { optedIn: people.length, toSend: toSend.length,
    noMatch: plan.filter(function (x) { return !x.person.sent && !x.matches.length; }).length,
    alreadySent: plan.filter(function (x) { return x.person.sent; }).length } };
}

function introEmail(entry) {
  var p = entry.person, first = p.name.split(/\s+/)[0] || p.name;
  var eventUrl = (setting('APP_URL') || 'https://gregor-posadas.github.io/lagmay-visit-hub/').replace(/\/?$/, '/') + 'event/';
  var items = entry.matches.map(function (m) {
    var q = m.person;
    return '<li style="margin:0 0 16px"><b>' + esc(q.name) + '</b>' + (q.org ? ', ' + esc(q.org) : '') + (q.base ? ' (' + esc(q.base) + ')' : '') + '<br>' +
      esc(q.project) + '<br>' +
      (q.seeking.length ? '<span style="color:#4d4a43">Looking for: ' + esc(q.seeking.join(', ')) + '</span><br>' : '') +
      (m.shared.length ? '<span style="color:#4d4a43">You both care about: ' + esc(m.shared.join('; ')) + '</span><br>' : '') +
      '<a href="mailto:' + esc(q.email) + '">' + esc(q.email) + '</a>' + (q.link ? ' · <a href="' + esc(q.link) + '">' + esc(q.link.replace(/^https?:\/\//, '')) + '</a>' : '') + '</li>';
  }).join('');
  var body = '<p>You asked for introductions to people working on Philippine projects, through When the Waters Rise. ' +
    'Here ' + (entry.matches.length === 1 ? 'is one person' : 'are ' + entry.matches.length + ' people') + ' with interests like yours who also asked to be introduced. ' +
    'They may hear about you too. Feel free to write to them directly.</p><ul style="padding-left:20px">' + items + '</ul>' +
    '<p>The event is Monday, November 9, 4 to 5 PM Pacific, in Banatao Auditorium at UC Berkeley, co-hosted with PhilDev, with a reception after. ' +
    'It is also livestreamed. <a href="' + esc(eventUrl) + '">Event page and RSVP</a>.</p>';
  return emailShell('Hi ' + first + ',', body, 'You got this because you said yes to introductions on the Connect form. To change or remove your card, reply to this email.');
}

/** Run by the project manager, from the hub or the editor. Sends each approved, opted-in person their matches, once. */
function sendConnectIntros(who) {
  var plan = connectIntroPlan(), sent = 0, stopped = false;
  var replyTo = setting('PM_EMAIL') || 'gregorposadas@berkeley.edu';
  plan.plan.forEach(function (entry) {
    if (stopped) return;
    if (MailApp.getRemainingDailyQuota() < 5) { stopped = true; return; }
    var msg = { to: entry.person.email, subject: 'People to meet through When the Waters Rise', htmlBody: introEmail(entry), name: 'When the Waters Rise', replyTo: replyTo };
    msg.body = stripHtml(msg.htmlBody);
    MailApp.sendEmail(msg);
    var rv = indexBy(readTable('ConnectReview'))[entry.person.id];
    rv.introSentAt = cell(new Date()); rv.updatedAt = rv.introSentAt; rv.updatedBy = who || 'pm';
    writeRow('ConnectReview', rv);
    sent++;
  });
  log(who, 'connect intros', sent + ' sent' + (stopped ? ', stopped at the daily email limit' : ''));
  return { ok: true, sent: sent, stopped: stopped, noMatch: plan.summary.noMatch, alreadySent: plan.summary.alreadySent };
}


/* ------------------------------------------------------------------ RSVP confirmation emails */
/*
 * Everyone who RSVPs gets one confirmation email, sent by the form-submit trigger (onRsvpSubmit). It says how they're joining
 * (seat, waitlist place, livestream, the morning lecture or Stanford) and carries the event as a calendar file (invite.ics)
 * plus Google Calendar and Outlook links. The RsvpMail tab records who got theirs, so nobody gets two.
 */
var EVENT_URL = 'https://gregor-posadas.github.io/lagmay-visit-hub/event/';
var RSVP_EVENTS = {
  panel: { uid: 'when-the-waters-rise-2026-11-09@gregor-posadas.github.io', title: 'When the Waters Rise: Dr. Mahar Lagmay at UC Berkeley',
    start: '20261110T000000Z', end: '20261110T010000Z', startIso: '2026-11-09T16:00:00-08:00', endIso: '2026-11-09T17:00:00-08:00',
    where: 'Banatao Auditorium (Room 310), Sutardja Dai Hall, 2594 Hearst Ave, UC Berkeley, Berkeley, CA',
    about: 'A free public conversation on flooding in the Philippines with Dr. Mahar Lagmay, Dr. Lisandro Claudio and Dr. Diana Martinez, co-hosted with PhilDev. Stay after to meet the speakers at a reception in B100 Blum Hall, next door. Also livestreamed.' },
  lecture: { uid: 'lagmay-deveng-203-2026-11-09@gregor-posadas.github.io', title: 'Guest lecture by Dr. Mahar Lagmay (DevEng 203, UC Berkeley)',
    start: '20261109T190000Z', end: '20261109T200000Z', startIso: '2026-11-09T11:00:00-08:00', endIso: '2026-11-09T12:00:00-08:00',
    where: 'UC Berkeley campus (room to be confirmed)',
    about: 'Dr. Mahar Lagmay, Executive Director of the UP Resilience Institute and Project NOAH, guest lecturing in Development Engineering 203. We will email the room before the day.' }
};
function icsEscape(v) { return String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, function (c) { return '\\' + c; }); }
function icsFor(ev, stamp) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//When the Waters Rise//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + ev.uid, 'DTSTAMP:' + stamp, 'DTSTART:' + ev.start, 'DTEND:' + ev.end,
    'SUMMARY:' + icsEscape(ev.title), 'LOCATION:' + icsEscape(ev.where), 'DESCRIPTION:' + icsEscape(ev.about + '\n\n' + EVENT_URL), 'URL:' + EVENT_URL,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(ev.title), 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
function calLinks(ev) {
  var details = ev.about + '\n\n' + EVENT_URL;
  return {
    google: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title) + '&dates=' + ev.start + '/' + ev.end +
      '&details=' + encodeURIComponent(details) + '&location=' + encodeURIComponent(ev.where),
    outlook: 'https://outlook.live.com/calendar/0/action/compose?subject=' + encodeURIComponent(ev.title) + '&location=' + encodeURIComponent(ev.where) +
      '&body=' + encodeURIComponent(details) + '&startdt=' + encodeURIComponent(ev.startIso) + '&enddt=' + encodeURIComponent(ev.endIso)
  };
}

/** The email for one RSVP. Pure (no Google services), so it can be tested. Returns { kind, subject, html, event } . */
function rsvpConfirmation(r, plan) {
  var first = String(r.name || '').trim().split(/\s+/)[0] || 'there';
  var kind = joinKind(r.attend), seat = plan.status[r.id];
  if (kind === 'panel' && seat === 'waitlist') kind = 'waitlist';
  if (kind === 'waitlist' && !seat) seat = 'waitlist';
  var place = plan.place[r.id] || 0;
  var panelWhen = '<b>Monday, November 9, 4 to 5 PM Pacific</b>, in Banatao Auditorium (Room 310), Sutardja Dai Hall, UC Berkeley';
  var lines = {
    panel: { subject: 'Your seat is saved: When the Waters Rise, Nov 9',
      body: '<p>Your seat is saved for ' + panelWhen + '. Please arrive a few minutes early. Stay after to meet the speakers at a reception in B100 Blum Hall, next door.</p>' },
    waitlist: { subject: "You're on the waitlist: When the Waters Rise, Nov 9",
      body: '<p>All ' + SEATS + ' seats in Banatao Auditorium are taken, so you are ' + (place ? '<b>number ' + place + '</b> ' : '') + 'on the waitlist. We will email you if a seat opens. ' +
        'Either way, you can watch the livestream, and the link comes to this address before the event.</p><p>The panel is ' + panelWhen + '.</p>' },
    online: { subject: "You're on the list: When the Waters Rise livestream, Nov 9",
      body: '<p>You are joining the livestream of the panel on <b>Monday, November 9, 4 to 5 PM Pacific</b>. We will email the link to this address before the event.</p>' },
    lecture: { subject: "You're on the list: Dr. Lagmay's guest lecture, Nov 9",
      body: '<p>You are on the list for Dr. Lagmay\'s guest lecture on the UC Berkeley campus, <b>Monday, November 9, 11 AM to 12 PM Pacific</b>. We will email you the room before the day.</p>' +
        '<p>The public panel is the same afternoon, 4 to 5 PM in Banatao Auditorium, if you would like to come to that too. You can RSVP for it on the event page.</p>' },
    stanford: { subject: "You're on the list: Dr. Lagmay at Stanford, Nov 10",
      body: '<p>You are on the list for Dr. Lagmay\'s talk on the Stanford campus on <b>Tuesday, November 10</b>. The time and room are still being set, and we will email them to you as soon as they are.</p>' },
    unsure: { subject: 'Thanks for your RSVP: When the Waters Rise, Nov 9',
      body: '<p>Thanks for letting us know you might come. The panel is ' + panelWhen + ', and it is also livestreamed. The calendar invite below saves the date. If your plans firm up, just reply to this email.</p>' }
  };
  var l = lines[kind] || lines.unsure;
  var ev = kind === 'lecture' ? RSVP_EVENTS.lecture : kind === 'stanford' ? null : RSVP_EVENTS.panel;
  var cal = '';
  if (ev) {
    var links = calLinks(ev);
    cal = '<p><b>Add it to your calendar:</b> open the attached invite.ics, or use <a href="' + esc(links.google) + '">Google Calendar</a> or <a href="' + esc(links.outlook) + '">Outlook.com</a>.</p>';
  }
  var body = '<p>Thank you for your RSVP to <b>When the Waters Rise</b>, a free public conversation on flooding in the Philippines with Dr. Mahar Lagmay, Dr. Lisandro Claudio and Dr. Diana Martinez, co-hosted with PhilDev.</p>' +
    l.body + cal +
    '<p>Working on something in or for the Philippines? Add a card on the <a href="' + EVENT_URL + 'connect/">Connect page</a> so others at the event can find you.</p>' +
    '<p>Details, directions and the live map of who is coming: <a href="' + EVENT_URL + '">' + EVENT_URL.replace(/^https:\/\//, '') + '</a></p>';
  return { kind: kind, subject: l.subject, event: ev,
    html: emailShell('Hi ' + first + ',', body, 'Questions, or need to change your RSVP? Just reply to this email. Gregor, Noam and Veronica, UC Berkeley') };
}

/** Sends the confirmation to every RSVP that hasn't had one. Run by the form trigger; safe to run by hand. Returns how many went out. */
function sendRsvpConfirmations() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 0;
  try {
    var rows = readRsvps(), plan = seatPlan(rows), sent = indexBy(readTable('RsvpMail')), n = 0;
    var replyTo = setting('PM_EMAIL') || 'gregorposadas@berkeley.edu';
    var stamp = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
    rows.forEach(function (r) {
      if (sent[r.id] || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return;
      if (MailApp.getRemainingDailyQuota() < 5) return;
      var m = rsvpConfirmation(r, plan);
      var msg = { to: r.email, subject: m.subject, htmlBody: m.html, body: stripHtml(m.html), name: 'When the Waters Rise', replyTo: replyTo };
      if (m.event) msg.attachments = [Utilities.newBlob(icsFor(m.event, stamp), 'text/calendar', 'invite.ics')];
      MailApp.sendEmail(msg);
      writeRow('RsvpMail', { id: r.id, sentAt: cell(new Date()), kind: m.kind });
      n++;
    });
    if (n) log('rsvp mail', 'sent', n + ' confirmation' + (n === 1 ? '' : 's'));
    return n;
  } finally { lock.releaseLock(); }
}

/** Run once from the editor: tells people on the form's thank-you screen to look for the email. RSVPs marked "held" in the RsvpMail tab are skipped. */
function setupRsvpEmails() {
  var formId = PropertiesService.getScriptProperties().getProperty('RSVP_FORM_ID');
  if (formId) FormApp.openById(formId).setConfirmationMessage("Thank you, you're on the list. Check your email for a confirmation with a calendar invite. See who is coming: " + EVENT_URL);
  Logger.log('Confirmation emails sent: ' + sendRsvpConfirmations());
}

/** Run from the editor only if the team decides the RSVPs marked "held" (from before these emails existed) should get theirs too. */
function sendHeldRsvpConfirmations() {
  var sh = sheet('RsvpMail');
  for (var i = sh.getLastRow(); i >= 2; i--) if (String(sh.getRange(i, 2).getValue()) === 'held') sh.deleteRow(i);
  Logger.log('Confirmation emails sent: ' + sendRsvpConfirmations());
}


/* ------------------------------------------------------------------ door check-in */
/*
 * A separate spreadsheet for the door on Nov 9 (CHECKIN_SHEET_ID), so volunteers see names and nothing else from the hub.
 * Its Check-in tab lists everyone holding a seat or on the panel waitlist, as "Last, First", with their status and a
 * partly hidden email to tell two people with the same name apart. Volunteers tick Here; the time is stamped for them.
 * Syncing adds new people and refreshes name, status and email, but never touches Here, Time in or Notes.
 */
var CHECKIN_COLS = ['Name', 'Status', 'Email', 'Here', 'Time in', 'Notes', 'RSVP id'];
function lastFirst(name) {
  var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length < 2 ? parts.join(' ') : parts[parts.length - 1] + ', ' + parts.slice(0, -1).join(' ');
}
function maskEmail(e) {
  var m = String(e || '').trim().match(/^([^@]{0,2})[^@]*(@.+)$/);
  return m ? m[1] + '…' + m[2] : '';
}
/** Who belongs on the door list, in the shape of its first three columns. Pure, so it can be tested. */
function checkinPeople(rows, plan) {
  return rows.filter(function (r) { return plan.status[r.id]; }).map(function (r) {
    return { id: r.id, name: lastFirst(r.name), status: plan.status[r.id] === 'seat' ? 'Seat' : 'Waitlist ' + (plan.place[r.id] || ''), email: maskEmail(r.email) };
  });
}
function syncCheckinSheet() {
  var id = setting('CHECKIN_SHEET_ID');
  if (!id) return 'No check-in sheet set.';
  var sh = SpreadsheetApp.openById(id).getSheetByName('Check-in');
  var rows = readRsvps(), people = checkinPeople(rows, seatPlan(rows)), byId = {};
  people.forEach(function (p) { byId[p.id] = p; });
  var last = sh.getLastRow(), seen = {};
  if (last > 1) {
    var ids = sh.getRange(2, 7, last - 1, 1).getValues(), abc = sh.getRange(2, 1, last - 1, 3).getValues();
    abc = abc.map(function (old, i) {
      var p = byId[String(ids[i][0])];
      if (!p) return old;
      seen[p.id] = true;
      return [p.name, p.status, p.email];   // Here, Time in and Notes (columns D to F) are never written here
    });
    sh.getRange(2, 1, abc.length, 3).setValues(abc);
  }
  var fresh = people.filter(function (p) { return !seen[p.id]; });
  if (fresh.length) {
    var start = Math.max(last, 1) + 1;
    sh.getRange(start, 1, fresh.length, CHECKIN_COLS.length).setValues(fresh.map(function (p) { return [p.name, p.status, p.email, false, '', '', p.id]; }));
  }
  // Keep it A to Z for the door, but stop re-sorting once doors are close, so a tick can't land on a row that just moved.
  if (new Date() < new Date('2026-11-09T14:00:00-08:00') && sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, CHECKIN_COLS.length).sort({ column: 1, ascending: true });
  return people.length + ' on the door list, ' + fresh.length + ' new.';
}
/** Installable on-edit trigger for the check-in spreadsheet: stamps the time when someone is ticked Here or a walk-in is written in. */
function onCheckinEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet(), row = e.range.getRow(), col = e.range.getColumn(), name = sh.getName();
  if (row < 2 || e.range.getNumRows() > 1) return;
  var now = Utilities.formatDate(new Date(), TZ, 'h:mm a');
  if (name === 'Check-in' && col === 4) sh.getRange(row, 5).setValue(e.range.getValue() === true ? now : '');
  if (name === 'Walk-ins' && col === 1 && e.range.getValue() && !sh.getRange(row, 3).getValue()) sh.getRange(row, 3).setValue(now);
}
/** Run once from the editor: makes the time-stamp trigger on the check-in spreadsheet and fills it with everyone so far. */
function setupCheckin() {
  var id = setting('CHECKIN_SHEET_ID');
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onCheckinEdit'; });
  if (!has) ScriptApp.newTrigger('onCheckinEdit').forSpreadsheet(id).onEdit().create();
  Logger.log((has ? 'Time-stamp trigger was already there. ' : 'Time-stamp trigger made. ') + syncCheckinSheet());
}
