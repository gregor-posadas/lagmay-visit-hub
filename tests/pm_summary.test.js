// The project manager's summary: Monday mornings only by default (PM_SUMMARY 'weekly'), every day when set to 'daily',
// and always when sent by hand from the hub. Teammates still get nothing while TEAM_EMAILS is off.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
let weekday = '2', props = { PM_EMAIL: 'pm@x.org' };
const sent = [];
const pad = n => String(n).padStart(2, '0');
const ctx = {
  console, Logger: { log() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: {
    formatDate(d, tz, f) {
      if (f === 'u') return weekday;
      if (f === 'yyyy-MM-dd') return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
      return d.toISOString();
    }
  }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const run = s => vm.runInContext(s, ctx);
const soon = new Date(Date.now() + 2 * 86400000).toISOString(), past = new Date(Date.now() - 2 * 86400000).toISOString();
const tables = {
  Members: [{ id: 'gregor', name: 'Gregor Posadas', email: 'g@x.org' }, { id: 'noam', name: 'Noam Anglo', email: 'n@x.org' }],
  Assignments: [{ id: 'a1', memberId: 'noam', title: 'Late thing', due: past, status: 'todo' }, { id: 'a2', memberId: 'gregor', title: 'Soon thing', due: soon, status: 'todo' }],
  Projects: [], Contacts: [], Funding: []
};
ctx.__tables = tables; ctx.__sent = sent;
run("readTable = function (n) { return __tables[n] || []; }; sendMail = function (to, subject, html) { __sent.push({ to: to, subject: subject, html: html }); }; setting = function (k) { return PropertiesService.getScriptProperties().getProperty(k) || DEFAULTS[k] || ''; };");

// A Tuesday: nothing goes out.
weekday = '2';
assert.strictEqual(run('sendDailyReminders()'), 0, 'no email on a Tuesday');
assert.strictEqual(sent.length, 0);

// A Monday: one briefing, to the project manager only.
weekday = '1';
assert.strictEqual(run('sendDailyReminders()'), 1);
assert.strictEqual(sent.length, 1);
assert.strictEqual(sent[0].to, 'pm@x.org', 'teammates get nothing while TEAM_EMAILS is off');
assert.ok(/^Lagmay visit, Monday briefing: 1 overdue, 1 due this week/.test(sent[0].subject), sent[0].subject);
assert.ok(sent[0].html.includes('Your Monday briefing') && sent[0].html.includes('Late thing') && sent[0].html.includes('Soon thing'));
assert.ok(props.PM_LAST_SUMMARY, 'remembers when the last briefing went out');

// The hub's Send button still sends on any day.
weekday = '4';
assert.strictEqual(run('sendDailyReminders(true)'), 1);

// PM_SUMMARY 'daily' brings back the old every-morning summary.
props.PM_SUMMARY = 'daily'; weekday = '3';
assert.strictEqual(run('sendDailyReminders()'), 1);
assert.ok(/^Lagmay visit summary:/.test(sent[sent.length - 1].subject));
console.log('PM summary tests passed');
