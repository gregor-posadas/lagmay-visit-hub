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
const head = ['Timestamp', Q.name, Q.email, Q.role, Q.attend, Q.county, Q.tie, Q.prov1, Q.prov2, Q.story, Q.consent, Q.question, Q.access];
mkSheet('RSVP responses', [head,
  [new Date(), 'Ana', 'a@x.org', 'UC Berkeley student', 'In person at Banatao Auditorium', 'Alameda', 'My parents are from there', 'Pampanga', 'Metro Manila', 'Ondoy took our house', 'Yes, you may share it without my name', 'Q1?', 'captions'],
  [new Date(), 'Ben', 'b@x.org', 'Community member', 'Online, on the livestream', 'Outside the Bay Area', 'No connection, just interested (everyone is welcome)', '', '', '', '', '', ''],
  [new Date(), 'Cy', 'c@x.org', '', 'Not sure yet', 'Prefer not to say', 'I was born there', 'Not sure', '', 'private story', 'No, please keep it private', '', ''],
  [new Date(), 'Di', 'd@x.org', '', 'In person at Banatao Auditorium', 'Alameda', 'I was born there', 'Pampanga', 'Pampanga', 'Yolanda', 'Yes, you may share it without my name', '', ''],
]);
mkSheet('Approvals', [['id', 'story', 'question', 'updatedAt', 'updatedBy']]);
mkSheet('Log', [['timestamp', 'who', 'action', 'detail']]);
let m = JSON.parse(JSON.stringify(vm.runInContext('publicMap()', ctx)));
assert.strictEqual(m.total, 4);
assert.deepStrictEqual(m.attend, { inPerson: 2, online: 1, unsure: 1, waitlist: 0 });
assert.deepStrictEqual(m.seats, { capacity: 149, taken: 2, left: 147 });
assert.deepStrictEqual(m.bay, { Alameda: 2, outside: 1, unsaid: 1 });
assert.deepStrictEqual(m.ph, { Pampanga: 2, 'Metro Manila': 1 });
assert.deepStrictEqual(m.sets, { 'Metro Manila|Pampanga': 1, Pampanga: 1 }, 'each person counted once, duplicates dropped');
assert.strictEqual(m.stories.length, 0, 'nothing shown before approval');
assert.ok(!JSON.stringify(m).includes('a@x.org') && !JSON.stringify(m).includes('Ana'), 'no names or emails in public data');
vm.runInContext("setApproval('r2','story',true,'gregor'); setApproval('r5','story',true,'gregor'); setApproval('r4','story',true,'gregor')", ctx);
m = JSON.parse(JSON.stringify(vm.runInContext('publicMap()', ctx)));
assert.deepStrictEqual(m.stories.map(s => s.text), ['Ondoy took our house', 'Yolanda'], 'approved + consented only (r4 declined)');
assert.strictEqual(m.stories[0].province, 'Pampanga');
const links = m.links.map(l => l.from + '>' + l.to + ':' + l.n).sort();
assert.deepStrictEqual(links, ['Alameda>Metro Manila:1', 'Alameda>Pampanga:2']);
const list = JSON.parse(JSON.stringify(vm.runInContext('rsvpList()', ctx)));
assert.strictEqual(list.length, 4); assert.strictEqual(list[0].storyOk, true); assert.strictEqual(list[0].tie, 'parents');
assert.throws(() => vm.runInContext("setApproval('x','story',true,'g')", ctx));

// Seat limit: the first SEATS "In person" answers get seats, in RSVP order; later ones and waitlist picks wait in order.
vm.runInContext('SEATS = 1', ctx);
sheets['RSVP responses'].rows.push([new Date(), 'Eve', 'e@x.org', '', vm.runInContext('WAITLIST', ctx), 'Marin', '', '', '', '', '', '', '']);
delete cache.map;
m = JSON.parse(JSON.stringify(vm.runInContext('publicMap()', ctx)));
assert.deepStrictEqual(m.attend, { inPerson: 1, online: 1, unsure: 1, waitlist: 2 }, 'Di is past the last seat, Eve picked the waitlist');
assert.deepStrictEqual(m.seats, { capacity: 1, taken: 1, left: 0 });
const l2 = JSON.parse(JSON.stringify(vm.runInContext('rsvpList()', ctx)));
assert.deepStrictEqual(l2.map(r => r.name + ':' + r.seat + (r.waitPlace ? '#' + r.waitPlace : '')), ['Ana:seat', 'Ben:', 'Cy:', 'Di:waitlist#1', 'Eve:waitlist#2']);
// The form swaps "In person" for the waitlist when full, and back when a seat opens.
let choices = null, help = '';
const item = { getTitle: () => Q.attend, asMultipleChoiceItem: () => ({ setChoiceValues(v) { choices = v; return this; }, setHelpText(h) { help = h; return this; } }) };
ctx.FormApp = { ItemType: { MULTIPLE_CHOICE: 'mc' }, openById: () => ({ getItems: () => [item] }) };
ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: k => k === 'RSVP_FORM_ID' ? 'F1' : null, setProperty() {} }) };
let said = vm.runInContext('updateSeatChoices()', ctx);
assert.ok(/^Waitlist/.test(choices[0]) && choices.length === 3 && /taken/.test(help), said);
vm.runInContext('SEATS = 149', ctx);
said = vm.runInContext('updateSeatChoices()', ctx);
assert.strictEqual(choices[0], 'In person at Banatao Auditorium'); assert.ok(/147 of 149/.test(said), said);
console.log('RSVP backend tests passed');
