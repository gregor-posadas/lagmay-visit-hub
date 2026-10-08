// Minimal Apps Script mocks to test the RSVP functions in Code.gs.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const sheets = {};
function mkSheet(name, rows) {
  sheets[name] = { rows, getLastRow: () => rows.length, getLastColumn: () => Math.max(...rows.map(r => r.length)),
    getRange: (r, c, nr, nc) => ({ getValues: () => rows.slice(r - 1, r - 1 + nr).map(x => { const y = x.slice(c - 1, c - 1 + nc); while (y.length < nc) y.push(''); return y; }),
      setNumberFormat() { return this; }, setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] = row; }); return this; }, setFontWeight() { return this; } }),
    getName: () => name, deleteRow: i => rows.splice(i - 1, 1), appendRow: r => rows.push(r), getMaxRows: () => 1000, setFrozenRows() {} };
  return sheets[name];
}
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => mkSheet(n, []), getId: () => 'SS', getSheets: () => Object.values(sheets) };
const cache = {};
const ctx = {
  SpreadsheetApp: { openById: () => ss, getActive: () => ss, flush() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  Utilities: { formatDate: d => new Date(d).toISOString(), getUuid: () => 'uuid-1234-5678' },
  Logger: { log() {} }, console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const Q = vm.runInContext('Q', ctx);
// The county column still has its first title, as on the live Sheet; diet is a newer column.
const head = ['Timestamp', Q.name, Q.email, Q.role, Q.attend, 'Where do you live now?', Q.tie, Q.prov1, Q.prov2, Q.story, Q.consent, Q.question, Q.access, Q.diet];
mkSheet('RSVP responses', [head,
  [new Date(), 'Ana', 'a@x.org', 'UC Berkeley student', 'In person at Banatao Auditorium', 'Alameda', 'My parents are from there', 'Pampanga', 'Metro Manila', 'Ondoy took our house', 'Yes, you may share it without my name', 'Q1?', 'captions', 'vegetarian'],
  [new Date(), 'Ben', 'b@x.org', 'Community member', 'Online, on the livestream', 'Outside the Bay Area', 'No connection, just interested (everyone is welcome)', '', '', '', '', '', ''],
  [new Date(), 'Cy', 'c@x.org', '', 'Not sure yet', 'Prefer not to say', 'I was born there', 'Not sure', '', 'private story', 'No, please keep it private', '', ''],
  [new Date(), 'Di', 'd@x.org', '', vm.runInContext('PANEL', ctx), 'Alameda', 'I was born there', 'Pampanga', 'Pampanga', 'Yolanda', 'Yes, you may share it without my name', '', ''],
]);
sheets['RSVP responses'].rows.push(
  [new Date(), 'Fe', 'f@x.org', '', vm.runInContext('LECTURE', ctx), 'Alameda', '', '', '', '', '', '', '', ''],
  [new Date(), 'Gil', 'g@x.org', '', vm.runInContext('STANFORD', ctx), 'Santa Clara', '', '', '', '', '', '', '', '']);
mkSheet('Approvals', [['id', 'story', 'question', 'updatedAt', 'updatedBy']]);
mkSheet('Log', [['timestamp', 'who', 'action', 'detail']]);
let m = JSON.parse(JSON.stringify(vm.runInContext('publicMap()', ctx)));
assert.strictEqual(m.total, 6);
assert.deepStrictEqual(m.attend, { inPerson: 2, lecture: 1, stanford: 1, online: 1, unsure: 1, waitlist: 0, lectureWaitlist: 0 }, 'old and new panel wording both count as panel seats');
assert.deepStrictEqual(m.seats, { capacity: 149, taken: 2, left: 147 });
assert.deepStrictEqual(m.bay, { Alameda: 3, outside: 1, unsaid: 1, 'Santa Clara': 1 }, 'county found under its old title');
assert.deepStrictEqual(m.ph, { Pampanga: 2, 'Metro Manila': 1 });
assert.deepStrictEqual(m.sets, { 'Metro Manila|Pampanga': 1, Pampanga: 1 }, 'each person counted once, duplicates dropped');
assert.strictEqual(m.stories.length, 0, 'nothing shown before approval');
assert.ok(!JSON.stringify(m).includes('a@x.org') && !JSON.stringify(m).includes('Ana') && !JSON.stringify(m).includes('vegetarian'), 'no names, emails or food answers in public data');
vm.runInContext("setApproval('r2','story',true,'gregor'); setApproval('r5','story',true,'gregor'); setApproval('r4','story',true,'gregor')", ctx);
m = JSON.parse(JSON.stringify(vm.runInContext('publicMap()', ctx)));
assert.deepStrictEqual(m.stories.map(s => s.text), ['Ondoy took our house', 'Yolanda'], 'approved + consented only (r4 declined)');
assert.strictEqual(m.stories[0].province, 'Pampanga');
const links = m.links.map(l => l.from + '>' + l.to + ':' + l.n).sort();
assert.deepStrictEqual(links, ['Alameda>Metro Manila:1', 'Alameda>Pampanga:2']);
const list = JSON.parse(JSON.stringify(vm.runInContext('rsvpList()', ctx)));
assert.strictEqual(list.length, 6); assert.strictEqual(list[0].diet, 'vegetarian'); assert.strictEqual(list[0].storyOk, true); assert.strictEqual(list[0].tie, 'parents');
assert.throws(() => vm.runInContext("setApproval('x','story',true,'g')", ctx));

// Seat limit: the first SEATS "In person" answers get seats, in RSVP order; later ones and waitlist picks wait in order.
vm.runInContext('SEATS = 1', ctx);
sheets['RSVP responses'].rows.push([new Date(), 'Eve', 'e@x.org', '', vm.runInContext('WAITLIST', ctx), 'Marin', '', '', '', '', '', '', '', '']);
delete cache.map;
m = JSON.parse(JSON.stringify(vm.runInContext('publicMap()', ctx)));
assert.deepStrictEqual(m.attend, { inPerson: 1, lecture: 1, stanford: 1, online: 1, unsure: 1, waitlist: 2, lectureWaitlist: 0 }, 'Di is past the last seat, Eve picked the waitlist; lecture and Stanford are not seat-limited');
assert.deepStrictEqual(m.seats, { capacity: 1, taken: 1, left: 0 });
const l2 = JSON.parse(JSON.stringify(vm.runInContext('rsvpList()', ctx)));
assert.deepStrictEqual(l2.map(r => r.name + ':' + r.seat + (r.waitPlace ? '#' + r.waitPlace : '')), ['Ana:seat', 'Ben:', 'Cy:', 'Di:waitlist#1', 'Fe:', 'Gil:', 'Eve:waitlist#2']);
// The form swaps the panel for its waitlist when full, and back when a seat opens.
let choices = null, help = '';
const item = { getTitle: () => Q.attend, asMultipleChoiceItem: () => ({ setChoiceValues(v) { choices = v; return this; }, setHelpText(h) { help = h; return this; } }) };
ctx.FormApp = { ItemType: { MULTIPLE_CHOICE: 'mc' }, openById: () => ({ getItems: () => [item] }) };
ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: k => k === 'RSVP_FORM_ID' ? 'F1' : null, setProperty() {} }) };
let said = vm.runInContext('updateSeatChoices()', ctx);
assert.ok(/UC Berkeley campus, Nov 9, 11 AM/.test(choices[0]) && /^Waitlist/.test(choices[1]) && choices.length === 6 && /panel is full/.test(choices[2]) && /taken/.test(help), said);
vm.runInContext('SEATS = 149', ctx);
said = vm.runInContext('updateSeatChoices()', ctx);
assert.strictEqual(JSON.stringify(choices.map(c => vm.runInContext('joinKind', ctx)(c))), JSON.stringify(['lecture', 'panel', 'both', 'stanford', 'online', 'unsure']));
assert.ok(/147 of 149/.test(said) && /149/.test(help), said);
// Answers given under earlier wordings keep counting for the right event.
const kind = vm.runInContext('joinKind', ctx);
assert.strictEqual(JSON.stringify(['In person at Banatao Auditorium', 'In-person panel discussion, Nov 9, 4 to 5 PM (Drs. Mahar Lagmay, Lisandro Claudio and Diana Martinez, UC Berkeley)',
  'In-person guest lecture, morning of Nov 9 (Dr. Mahar Lagmay, UC Berkeley)', 'In-person guest lecture, Nov 10 (Dr. Mahar Lagmay, Stanford)', 'Online, on the livestream', 'Not sure yet'].map(kind)),
  JSON.stringify(['panel', 'panel', 'lecture', 'stanford', 'online', 'unsure']));
assert.ok(choices.every(c => /campus|Online|Not sure/.test(c)), 'every in-person choice names the campus');
assert.ok(/room for 20 guests/.test(choices[0]) && /149 seats/.test(choices[1]) && /20 guests/.test(help) && /reception/.test(help) && /same 149/.test(help), help);
assert.ok(/146 left/.test(help) === false && /\(19 left\)/.test(help), 'help text shows lecture spots left: ' + help);

// Morning lecture: a hard limit of LECTURE_SEATS guests in RSVP order; later lecture answers go on the lecture's own waitlist.
vm.runInContext('LECTURE_SEATS = 1', ctx);
sheets['RSVP responses'].rows.push([new Date(), 'Hal', 'h@x.org', '', vm.runInContext('LECTURE', ctx), 'Marin', '', '', '', '', '', '', '', ''],
  [new Date(), 'Ivy', 'i@x.org', '', vm.runInContext('LECTURE_WAITLIST', ctx), 'Marin', '', '', '', '', '', '', '', '']);
delete cache.map;
m = JSON.parse(JSON.stringify(vm.runInContext('publicMap()', ctx)));
assert.strictEqual(m.attend.lecture, 1); assert.strictEqual(m.attend.lectureWaitlist, 2, 'Hal is past the last spot, Ivy picked the lecture waitlist');
assert.deepStrictEqual(m.lectureSeats, { capacity: 1, taken: 1, left: 0 });
const l3 = JSON.parse(JSON.stringify(vm.runInContext('rsvpList()', ctx)));
assert.deepStrictEqual(l3.filter(r => r.lectureSeat).map(r => r.name + ':' + r.lectureSeat + (r.lectureWaitPlace ? '#' + r.lectureWaitPlace : '') + ':' + r.seat),
  ['Fe:seat:', 'Hal:waitlist#1:', 'Ivy:waitlist#2:'], 'lecture spots never touch the panel seats');
said = vm.runInContext('updateSeatChoices()', ctx);
assert.ok(/^Waitlist for the Nov 9 morning guest lecture/.test(choices[0]) && kind(choices[0]) === 'lectureWaitlist' && /Lecture full/.test(said) && /guest spots for the morning guest lecture are taken/.test(help), said);
assert.ok(choices.every(c => /campus|Online|Not sure/.test(c)), 'the lecture waitlist still names the campus');
const plan3 = vm.runInContext('seatPlan(readRsvps())', ctx);
assert.ok(!Object.keys(plan3.status).some(id => plan3.lecture.status[id]), 'the panel check-in list never includes lecture RSVPs');
vm.runInContext('LECTURE_SEATS = 20', ctx);

// Both: one RSVP takes a lecture spot and a panel seat, each in RSVP order, and counts once in each session.
sheets['RSVP responses'].rows.push([new Date(), 'Jo', 'j@x.org', '', vm.runInContext('BOTH', ctx), 'Marin', '', '', '', '', '', '', '', '']);
delete cache.map;
const plan4 = vm.runInContext('seatPlan(readRsvps())', ctx), jo = 'r' + sheets['RSVP responses'].rows.length;
assert.strictEqual(plan4.status[jo], 'seat'); assert.strictEqual(plan4.lecture.status[jo], 'seat');
m = JSON.parse(JSON.stringify(vm.runInContext('publicMap()', ctx)));
assert.strictEqual(m.total, 10, 'people, not sessions'); assert.strictEqual(m.attend.inPerson, 3); assert.strictEqual(m.attend.lecture, 3, 'Fe, Hal and Jo; Ivy chose the waitlist');
vm.runInContext('LECTURE_SEATS = 2', ctx);
const plan5 = vm.runInContext('seatPlan(readRsvps())', ctx);
assert.strictEqual(plan5.status[jo], 'seat'); assert.strictEqual(plan5.lecture.status[jo], 'waitlist', 'lecture full: Both keeps the panel seat and waits for the lecture');
said = vm.runInContext('updateSeatChoices()', ctx);
assert.ok(/lecture is full/.test(choices[2]) && kind(choices[2]) === 'both', choices[2]);
vm.runInContext('LECTURE_SEATS = 20', ctx);
said = vm.runInContext('updateSeatChoices()', ctx);
assert.strictEqual(choices[2], vm.runInContext('BOTH', ctx)); assert.ok(/Pick "Both"/.test(help));
// The Connect question: "Yes" leads to the page with the link; "Not right now" and the page's linear default both submit.
const made = [];
const fakeForm = {
  addMultipleChoiceItem: () => { const q = { kind: 'mc', setTitle(x) { q.title = x; return q; }, setHelpText(x) { q.help = x; return q; }, setRequired(x) { q.req = x; return q; },
    createChoice: (v, to) => ({ v, to }), setChoices(c) { q.choices = c; return q; } }; made.push(q); return q; },
  addPageBreakItem: () => { const p = { kind: 'page', setTitle(x) { p.title = x; return p; }, setHelpText(x) { p.help = x; return p; }, setGoToPage(x) { p.go = x; return p; } }; made.push(p); return p; }
};
ctx.FormApp.PageNavigationType = { SUBMIT: 'SUBMIT' };
vm.runInContext('addConnectQuestion', ctx)(fakeForm);
const [cq, cp] = made;
assert.strictEqual(cq.title, Q.connect); assert.strictEqual(cq.req, false);
assert.strictEqual(cq.choices[0].to, cp, 'Yes goes to the Connect page'); assert.strictEqual(cq.choices[1].to, 'SUBMIT');
assert.strictEqual(cp.go, 'SUBMIT', 'skipping the question submits instead of showing the page');
assert.ok(/forms\/d\/1Str71D7/.test(cp.help) && /event\/connect\//.test(cp.help) && /press Submit/.test(cp.help), cp.help);
console.log('RSVP backend tests passed');
