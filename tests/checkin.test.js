// Door check-in: seats and waitlist only, "Last, First", masked emails, and volunteers' ticks and notes never overwritten.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const grid = [['Name', 'Status', 'Email', 'Here', 'Time in', 'Notes', 'RSVP id']];
function range(r, c, nr, nc) {
  return {
    getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = grid[r - 1 + i] || []; const v = []; for (let j = 0; j < nc; j++) v.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(v); } return out; },
    setValues: v => { v.forEach((row, i) => { grid[r - 1 + i] = grid[r - 1 + i] || []; row.forEach((x, j) => { grid[r - 1 + i][c - 1 + j] = x; }); }); },
    sort: () => { const body = grid.slice(r - 1, r - 1 + nr).sort((a, b) => String(a[0]).localeCompare(String(b[0]))); grid.splice(r - 1, nr, ...body); }
  };
}
const sh = { getLastRow: () => grid.length, getRange: range };
const ctx = {
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => sh }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  Logger: { log() {} }, console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const run = s => vm.runInContext(s, ctx);
assert.strictEqual(run("lastFirst('Juan dela Cruz')"), 'Cruz, Juan dela');
assert.strictEqual(run("lastFirst('Madonna')"), 'Madonna');
assert.strictEqual(run("maskEmail('ana.reyes@berkeley.edu')"), 'an…@berkeley.edu');

const P = run('PANEL'), O = run('ONLINE');
ctx.__rows = [
  { id: 'r2', name: 'Ana Reyes', email: 'ana@example.org', attend: P },
  { id: 'r3', name: 'Ben Cruz', email: 'ben@example.org', attend: O },     // online: not on the door list
  { id: 'r4', name: 'Cora Lim', email: 'cora@example.org', attend: P }
];
run('readRsvps = function () { return __rows; }; SEATS = 1;');
assert.strictEqual(run('syncCheckinSheet()'), '2 on the door list, 2 new.');
assert.deepStrictEqual(grid.slice(1).map(r => [r[0], r[1], r[6]]), [['Lim, Cora', 'Waitlist 1', 'r4'], ['Reyes, Ana', 'Seat', 'r2']]);
assert.ok(!JSON.stringify(grid).includes('ana@example.org'), 'no full emails at the door');

// A volunteer ticks Ana in and writes a note; then a seat frees up for Cora and a new RSVP arrives.
const ana = grid.findIndex(r => r[6] === 'r2'); grid[ana][3] = true; grid[ana][4] = '3:52 PM'; grid[ana][5] = 'Needs aisle seat';
run('SEATS = 2;');
ctx.__rows.push({ id: 'r5', name: 'Dan Uy', email: 'dan@example.org', attend: P });
assert.strictEqual(run('syncCheckinSheet()'), '3 on the door list, 1 new.');
const byId = Object.fromEntries(grid.slice(1).map(r => [r[6], r]));
assert.deepStrictEqual([byId.r2[3], byId.r2[4], byId.r2[5]], [true, '3:52 PM', 'Needs aisle seat'], 'ticks and notes survive a sync');
assert.strictEqual(byId.r4[1], 'Seat', 'status refreshes when a seat opens');
assert.strictEqual(byId.r5[1], 'Waitlist 1');
console.log('Check-in tests passed');
