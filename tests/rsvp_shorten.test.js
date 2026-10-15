// shortenRsvpForm(): reshapes the live RSVP form into the short version. Runs against a fake form that moves items the way
// Apps Script does (take the item out, put it back at the new index; by index only, as Form.moveItem rejects typed items),
// and checks the order, the pages and where each choice goes, from a fresh form and from the half-done state of Oct 13.
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
    asPageBreakItem: () => it, asMultipleChoiceItem: () => it, asCheckboxItem: () => it, asParagraphTextItem: () => it, asListItem: () => it
  };
  return it;
}
const page = t => mk('PAGE_BREAK', t), mc = t => mk('MULTIPLE_CHOICE', t), txt = t => mk('PARAGRAPH_TEXT', t);
// The live form as built in October, with the food question added after access needs.
const fresh = () => [txt(Q.name), txt(Q.email), mc(Q.role), mk('CHECKBOX', Q.join), mk('LIST', Q.county),
  page('Your connection to the Philippines'), mc(Q.tie), page('Where in the Philippines'), mk('LIST', Q.prov1), mk('LIST', Q.prov2),
  page('Stories and questions'), txt(Q.story), mc(Q.consent), txt(Q.question), txt(Q.access), txt(Q.diet), mc(Q.connect), page('Connect with others at the event')];
items = fresh();
let description = 'long';
const form = {
  getItems: type => type ? items.filter(i => i.type === type) : items.slice(),
  moveItem(from, to) {
    if (typeof from !== 'number' || typeof to !== 'number') throw new Error("The parameters don't match the method signature for FormApp.Form.moveItem.");
    const [it] = items.splice(from, 1); items.splice(to, 0, it);
  },
  deleteItem(x) {
    const it = typeof x === 'number' ? items[x] : x;
    if (items.some(q => (q.choices || []).some(c => c.to === it))) throw new Error('Invalid data updating form.');
    items.splice(items.indexOf(it), 1);
  },
  addPageBreakItem() { const p = page(''); items.push(p); return p; },
  addMultipleChoiceItem() { const q = mc(''); items.push(q); return q; },
  setDescription(d) { description = d; }
};
ctx.FormApp = { openById: () => form, ItemType: { PAGE_BREAK: 'PAGE_BREAK', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE' }, PageNavigationType: { SUBMIT } };
ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: k => k === 'RSVP_FORM_ID' ? 'F1' : null }) };
ctx.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
run('readRsvps = function () { return []; }');

function check(label) {
  const titles = items.map(i => i.type === 'PAGE_BREAK' ? '[' + i.title + ']' : i.title);
  assert.deepStrictEqual(titles, [Q.name, Q.email, Q.join, Q.county, Q.question,
    '[Your connection to the Philippines]', Q.tie,
    '[Where in the Philippines]', Q.prov1,
    '[Almost done]', run('Q_MORE'),
    '[A few optional extras]', Q.story, Q.consent, Q.role, Q.connect, '[Connect with others at the event]'], label + '\n' + titles.join('\n'));
  assert.ok(description.length < 400 && /please contact gregorposadas@berkeley.edu/.test(description), 'short description: ' + description);
  const byTitle = t => items.find(i => i.title === t);
  const more = byTitle(run('Q_MORE'));
  assert.ok(more.required, 'the early exit is a required choice');
  assert.strictEqual(more.choices.find(c => c.v === run('MORE_NO')).to, SUBMIT);
  assert.strictEqual(more.choices.find(c => c.v === run('MORE_YES')).to, byTitle('A few optional extras'));
  const TIES = run('TIES');
  for (const c of byTitle(Q.tie).choices) {
    const skip = ['friend', 'none'].includes(TIES[c.v]);
    assert.strictEqual(c.to, skip ? byTitle('Almost done') : byTitle('Where in the Philippines'), label + ': ' + c.v);
  }
  assert.ok(byTitle(Q.tie).choices.some(c => TIES[c.v] === 'friend'), 'the friend option is there');
  assert.ok(!byTitle(Q.question).required && !byTitle(Q.prov1).required, 'question and province are optional');
  assert.ok(!byTitle(Q.access) && !byTitle(Q.diet), 'access and food questions removed');
  assert.ok(!items.some(i => i.title === Q.prov2), 'no second province');
  for (const p of ['Almost done', 'Where in the Philippines', 'A few optional extras']) assert.strictEqual(items.filter(i => i.title === p).length, 1, 'one ' + p);
  assert.ok(byTitle(Q.join).choices.length === 4 && byTitle(Q.join).choices.every(c => c.v.length < 100), 'attendance choices are short');
}

// 1. From the form as first built.
run('shortenRsvpForm()');
check('fresh');
const before = items.map(i => i.title).join('|');
run('shortenRsvpForm()');
assert.strictEqual(items.map(i => i.title).join('|'), before, 'running it again changes nothing');

// 2. From the half-done state the first, interrupted run left on Oct 13.
items = [txt(Q.name), txt(Q.email), mk('CHECKBOX', Q.join), mk('LIST', Q.county), txt(Q.access), txt(Q.diet),
  page('Your connection to the Philippines'), mc(Q.tie), page('Where in the Philippines'), mk('LIST', Q.prov1),
  page('A few optional extras'), txt(Q.question), txt(Q.story), mc(Q.consent), mc(Q.role), mc(Q.connect), page('Connect with others at the event'),
  page('Almost done')];
run('shortenRsvpForm()');
check('half-done');

// 3. From the earlier short version (province page after the connection, question on the extras page).
items = [txt(Q.name), txt(Q.email), mk('CHECKBOX', Q.join), mk('LIST', Q.county), txt(Q.access), txt(Q.diet),
  page('Your connection to the Philippines'), mc(Q.tie), page('Where in the Philippines'), mk('LIST', Q.prov1),
  page('Almost done'), mc(run('Q_MORE')),
  page('A few optional extras'), txt(Q.question), txt(Q.story), mc(Q.consent), mc(Q.role), mc(Q.connect), page('Connect with others at the event')];
{ const t = items.find(i => i.title === Q.tie), prov = items.find(i => i.title === 'Where in the Philippines'), ex = items.find(i => i.title === 'Almost done');
  t.choices = Object.keys(run('TIES')).map(v => ({ v, to: /No connection/.test(v) ? ex : prov }));
  items.find(i => i.title === run('Q_MORE')).choices = [{ v: 'No', to: SUBMIT }, { v: 'Yes', to: items.find(i => i.title === 'A few optional extras') }]; }
run('shortenRsvpForm()');
check('earlier short version');

// 4. From the layout of the previous run (province in the extras, every connection answer to "Almost done").
items = [txt(Q.name), txt(Q.email), mk('CHECKBOX', Q.join), mk('LIST', Q.county), txt(Q.access), txt(Q.diet), txt(Q.question),
  page('Your connection to the Philippines'), mc(Q.tie), page('Almost done'), mc(run('Q_MORE')),
  page('A few optional extras'), mk('LIST', Q.prov1), txt(Q.story), mc(Q.consent), mc(Q.role), mc(Q.connect), page('Connect with others at the event')];
items.find(i => i.title === run('Q_MORE')).choices = [{ v: 'No', to: SUBMIT }, { v: 'Yes', to: items.find(i => i.title === 'A few optional extras') }];
run('shortenRsvpForm()');
check('previous run');
const again = items.map(i => i.title).join('|'); run('shortenRsvpForm()');
assert.strictEqual(items.map(i => i.title).join('|'), again, 'running it again changes nothing');
console.log('RSVP form shortening tests passed');
