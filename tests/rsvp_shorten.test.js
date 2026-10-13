// shortenRsvpForm(): reshapes the live RSVP form into the short version. Runs against a fake form that moves items the way
// Apps Script does (take the item out, put it back at the new index), and checks the order, the pages and where each choice goes.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const ctx = { Logger: { log() {} }, console, CacheService: { getScriptCache: () => ({ remove() {} }) } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const run = s => vm.runInContext(s, ctx);
const Q = run('Q'), SUBMIT = 'SUBMIT';

let items = [];
function mk(type, title) {
  const it = {
    type, title, help: '', choices: null, required: false,
    getType: () => type, getTitle: () => it.title, getIndex: () => items.indexOf(it),
    setTitle(t) { it.title = t; return it; }, setHelpText(h) { it.help = h; return it; }, getHelpText: () => it.help,
    setRequired(r) { it.required = r; return it; },
    createChoice: (v, to) => ({ v, to }), setChoices(c) { it.choices = c; return it; }, setChoiceValues(v) { it.choices = v.map(x => ({ v: x })); return it; },
    asPageBreakItem: () => it, asMultipleChoiceItem: () => it, asParagraphTextItem: () => it, asListItem: () => it
  };
  return it;
}
const page = t => mk('PAGE_BREAK', t), mc = t => mk('MULTIPLE_CHOICE', t), txt = t => mk('PARAGRAPH_TEXT', t);
// The live form as built in October, with the food question added after access needs.
items = [txt(Q.name), txt(Q.email), mc(Q.role), mc(Q.attend), mk('LIST', Q.county),
  page('Your connection to the Philippines'), mc(Q.tie), page('Where in the Philippines'), mk('LIST', Q.prov1), mk('LIST', Q.prov2),
  page('Stories and questions'), txt(Q.story), mc(Q.consent), txt(Q.question), txt(Q.access), txt(Q.diet), mc(Q.connect), page('Connect with others at the event')];
let description = 'long';
const form = {
  getItems: type => type ? items.filter(i => i.type === type) : items.slice(),
  moveItem(item, to) { items.splice(items.indexOf(item), 1); items.splice(to, 0, item); },
  deleteItem(item) { items.splice(items.indexOf(item), 1); },
  addPageBreakItem() { const p = page(''); items.push(p); return p; },
  addMultipleChoiceItem() { const q = mc(''); items.push(q); return q; },
  setDescription(d) { description = d; }
};
ctx.FormApp = { openById: () => form, ItemType: { PAGE_BREAK: 'PAGE_BREAK', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE' }, PageNavigationType: { SUBMIT } };
ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: k => k === 'RSVP_FORM_ID' ? 'F1' : null }) };
ctx.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
run('readRsvps = function () { return []; }');

run('shortenRsvpForm()');
const titles = items.map(i => i.type === 'PAGE_BREAK' ? '[' + i.title + ']' : i.title);
assert.deepStrictEqual(titles, [Q.name, Q.email, Q.attend, Q.county, Q.access, Q.diet,
  '[Your connection to the Philippines]', Q.tie, '[Where in the Philippines]', Q.prov1,
  '[Almost done]', run('Q_MORE'),
  '[A few optional extras]', Q.question, Q.story, Q.consent, Q.role, Q.connect, '[Connect with others at the event]'], titles.join('\n'));
assert.ok(description.length < 700 && /a minute or two/.test(description), 'short description');

const byTitle = t => items.find(i => i.title === t);
const more = byTitle(run('Q_MORE'));
assert.ok(more.required, 'the early exit is a required choice');
assert.strictEqual(more.choices.find(c => c.v === run('MORE_NO')).to, SUBMIT);
assert.strictEqual(more.choices.find(c => c.v === run('MORE_YES')).to, byTitle('A few optional extras'));
const tie = byTitle(Q.tie);
for (const c of tie.choices) {
  const none = /No connection/.test(c.v);
  assert.strictEqual(c.to, none ? byTitle('Almost done') : byTitle('Where in the Philippines'), c.v);
}
assert.ok(/Leave it blank if none/.test(byTitle(Q.access).help) && /Leave it blank if none/.test(byTitle(Q.diet).help));
assert.ok(!items.some(i => i.title === Q.prov2), '"Another province" is gone');
assert.ok(byTitle(Q.attend).choices.every(c => c.v.length < 100), 'attendance choices are short');

// Running it again changes nothing.
const before = items.map(i => i.title).join('|');
run('shortenRsvpForm()');
assert.strictEqual(items.map(i => i.title).join('|'), before);
console.log('RSVP form shortening tests passed');
