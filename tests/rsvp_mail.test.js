// RSVP confirmations: the right words for how each person is joining, a correct calendar invite, and one email each.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const sent = [], mailRows = [];
const ctx = {
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => k === 'PM_EMAIL' ? 'gregorposadas@berkeley.edu' : null }) },
  Utilities: { formatDate: () => '20261008T060000Z', newBlob: (text, type, name) => ({ text, type, name }) },
  MailApp: { getRemainingDailyQuota: () => 100, sendEmail: m => sent.push(m) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Logger: { log() {} }, console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const run = s => vm.runInContext(s, ctx);
const P = run('PANEL'), L = run('LECTURE'), S = run('STANFORD'), O = run('ONLINE'), W = run('WAITLIST');

const plan = { status: { r2: 'seat', r3: 'waitlist' }, place: { r3: 4 } };
const conf = (attend, id) => run('rsvpConfirmation')({ id, name: 'Ana Reyes', email: 'ana@example.org', attend }, plan);

let m = conf(P, 'r2');
assert.strictEqual(m.kind, 'panel'); assert.ok(/seat is saved/i.test(m.subject)); assert.ok(m.html.includes('Hi Ana,'));
assert.ok(m.html.includes('B100 Blum Hall') && m.html.includes('calendar.google.com') && m.html.includes('connect/'));
assert.strictEqual(m.event.start, '20261110T000000Z', '4 PM Pacific on Nov 9 is midnight UTC on Nov 10');

m = conf(P, 'r3');
assert.strictEqual(m.kind, 'waitlist', 'a panel RSVP past the 149 seats is told it is on the waitlist'); assert.ok(m.html.includes('number 4'));
m = conf(W, 'r9'); assert.strictEqual(m.kind, 'waitlist');

m = conf(O, 'r4'); assert.strictEqual(m.kind, 'online'); assert.ok(/livestream/.test(m.html)); assert.ok(m.event);
m = conf(L, 'r5'); assert.strictEqual(m.kind, 'lecture'); assert.strictEqual(m.event.start, '20261109T190000Z', '11 AM Pacific');
m = conf(S, 'r6'); assert.strictEqual(m.kind, 'stanford'); assert.strictEqual(m.event, null, 'no invite until the Stanford time is set');
assert.ok(!m.html.includes('invite.ics'));
const lplan = { status: {}, place: {}, lecture: { status: { r5: 'seat', r8: 'waitlist' }, place: { r8: 2 } } };
m = run('rsvpConfirmation')({ id: 'r8', name: 'Hal', email: 'h@x.org', attend: L }, lplan);
assert.strictEqual(m.kind, 'lectureWaitlist', 'a lecture RSVP past the 20 guest spots is told it is on the lecture waitlist');
assert.ok(/waitlist/i.test(m.subject) && m.html.includes('number 2') && m.html.includes('20 guests') && m.event === null, 'no invite for a spot they do not have');
m = run('rsvpConfirmation')({ id: 'r5', name: 'Fe', email: 'f@x.org', attend: L }, lplan); assert.strictEqual(m.kind, 'lecture');
m = run('rsvpConfirmation')({ id: 'r9', name: 'Ivy', email: 'i@x.org', attend: run('LECTURE_WAITLIST') }, { status: {}, place: {}, lecture: { status: { r9: 'waitlist' }, place: { r9: 3 } } });
assert.strictEqual(m.kind, 'lectureWaitlist'); assert.ok(m.html.includes('number 3'));
const B = run('BOTH');
m = run('rsvpConfirmation')({ id: 'r10', name: 'Jo', email: 'j@x.org', attend: B }, { status: { r10: 'seat' }, place: {}, lecture: { status: { r10: 'seat' }, place: {} } });
assert.strictEqual(m.kind, 'both'); assert.strictEqual(m.events.length, 2, 'invite holds the lecture and the panel');
assert.ok(m.html.includes('Morning guest lecture:') && m.html.includes('seat is saved') && m.html.includes('it has both'));
assert.ok(run('icsFor')(m.events, 'X').split('BEGIN:VEVENT').length === 3, 'two events in one file');
m = run('rsvpConfirmation')({ id: 'r10', name: 'Jo', email: 'j@x.org', attend: B }, { status: { r10: 'seat' }, place: {}, lecture: { status: { r10: 'waitlist' }, place: { r10: 1 } } });
assert.strictEqual(m.events.length, 1); assert.strictEqual(m.events[0].uid, run('RSVP_EVENTS').panel.uid); assert.ok(m.html.includes('number 1') && /Your RSVP/.test(m.subject));
m = conf('Not sure yet', 'r7'); assert.strictEqual(m.kind, 'unsure'); assert.ok(m.event);

const ics = run('icsFor')(run('RSVP_EVENTS').panel, '20261008T060000Z');
assert.ok(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('\r\nDTSTART:20261110T000000Z\r\n') && ics.includes('DTEND:20261110T010000Z'));
assert.ok(ics.includes('LOCATION:Banatao Auditorium (Room 310)\\, Sutardja Dai Hall'), 'commas escaped');
assert.ok(!ics.includes('em dash'));

// Sending: one email per RSVP, recorded, never twice; bad emails skipped.
ctx.__rows = [{ id: 'r2', name: 'Ana Reyes', email: 'ana@example.org', attend: P }, { id: 'r3', name: 'Ben', email: 'not-an-email', attend: O },
  { id: 'r4', name: 'Cora Lim', email: 'cora@example.org', attend: S }, { id: 'r5', name: 'Dan', email: 'dan@example.org', attend: B }];
run("readRsvps = function () { return __rows; }; readTable = function (t) { return t === 'RsvpMail' ? __mail : []; }; writeRow = function (t, o) { __mail.push(o); }; log = function () {};");
ctx.__mail = mailRows;
assert.strictEqual(run('sendRsvpConfirmations()'), 3);
assert.deepStrictEqual(sent.map(x => x.to), ['ana@example.org', 'cora@example.org', 'dan@example.org']);
assert.strictEqual(sent[2].attachments[0].text.split('BEGIN:VEVENT').length, 3, 'Both gets one invite file with two events');
assert.strictEqual(sent[0].attachments[0].name, 'invite.ics'); assert.strictEqual(sent[0].attachments[0].type, 'text/calendar');
assert.ok(!sent[1].attachments, 'Stanford gets no invite yet');
assert.strictEqual(sent[0].replyTo, 'gregorposadas@berkeley.edu'); assert.strictEqual(sent[0].name, 'When the Waters Rise');
assert.strictEqual(run('sendRsvpConfirmations()'), 0, 'nobody gets a second one');
console.log('RSVP mail tests passed');
