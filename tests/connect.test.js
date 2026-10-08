// Connect cards: only approved cards from people who said yes are public, emails never are, and intros pair the right people.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const cache = {};
const ctx = {
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  Utilities: { formatDate: d => new Date(d).toISOString() },
  Logger: { log() {} }, console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
const run = s => vm.runInContext(s, ctx);

// Checkbox answers are joined with ", " and some choices contain commas.
const areas = run("splitChoices('Floods, disasters and climate resilience, Water and sanitation, Seaweed farming', CONNECT_AREAS)");
assert.deepStrictEqual(Array.from(areas), ['Floods, disasters and climate resilience', 'Water and sanitation', 'Seaweed farming']);
assert.deepStrictEqual(Array.from(run("splitChoices('', CONNECT_AREAS)")), []);

assert.strictEqual(run("normalizeLink('linkedin.com/in/someone')"), 'https://linkedin.com/in/someone');
assert.strictEqual(run("normalizeLink('javascript:alert(1)')"), '', 'only web links');
assert.strictEqual(run("normalizeLink('not a link')"), '');

const SHOW = run('SHOW_YES'), NOSHOW = run('SHOW_NO'), INTRO = run('INTRO_YES'), NOINTRO = run('INTRO_NO');
const rows = [
  { id: 'c2', name: 'Ana Reyes', email: 'ana@example.org', org: 'UC Berkeley', base: 'Bay Area', areas: 'Floods, disasters and climate resilience, Data, mapping and technology', project: 'Flood sensors for barangays', seeking: 'Collaborators, A mentor', link: 'ana.example.org', nov9: 'Yes, in person', show: SHOW, intros: INTRO },
  { id: 'c3', name: 'Ben Cruz', email: 'ben@example.org', org: 'NGO', base: 'Philippines', areas: 'Floods, disasters and climate resilience', project: 'Evacuation planning', seeking: 'Someone to mentor', link: '', nov9: 'Yes, online', show: NOSHOW, intros: INTRO },
  { id: 'c4', name: 'Cora Lim', email: 'cora@example.org', org: '', base: 'Somewhere else', areas: 'Health', project: 'Clinics', seeking: 'Volunteers', link: '', nov9: 'Not this time', show: SHOW, intros: NOINTRO },
  { id: 'c5', name: 'Dan Uy', email: 'dan@example.org', org: '', base: 'Bay Area', areas: 'Floods, disasters and climate resilience', project: 'Not reviewed yet', seeking: 'Collaborators', link: '', nov9: '', show: SHOW, intros: INTRO }
];
ctx.__rows = rows;
ctx.__review = [{ id: 'c2', card: 'yes', introSentAt: '' }, { id: 'c3', card: 'yes', introSentAt: '' }, { id: 'c4', card: 'yes', introSentAt: '' }];
run("readConnect = function () { return __rows; }; readTable = function (t) { return t === 'ConnectReview' ? __review : []; };");

const pub = JSON.parse(JSON.stringify(run('publicConnect()')));
assert.deepStrictEqual(pub.cards.map(c => c.id), ['c4', 'c2'], 'approved and asked to be shown, newest first');
assert.ok(!JSON.stringify(pub).includes('@example.org'), 'no email in public data');
assert.strictEqual(pub.cards[1].link, 'https://ana.example.org');
assert.deepStrictEqual(pub.cards[1].seeking, ['Collaborators', 'A mentor']);

const hub = JSON.parse(JSON.stringify(run('connectList()')));
assert.ok(!JSON.stringify(hub).includes('@example.org'), 'no email in the hub data either');
assert.strictEqual(hub.find(c => c.id === 'c5').cardOk, false);

// Intros: only approved people who said yes, on both sides. Ana (mentee) and Ben (mentor) share floods: 1 + 2.
const plan = run('connectIntroPlan()');
assert.strictEqual(plan.summary.optedIn, 2, 'Cora said no to intros; Dan is not approved');
const ana = plan.plan.find(x => x.person.id === 'c2');
assert.strictEqual(ana.matches.length, 1);
assert.strictEqual(ana.matches[0].person.id, 'c3');
assert.strictEqual(ana.matches[0].score, 3);
const html = run('introEmail')(ana);
assert.ok(html.includes('ben@example.org') && html.includes('Evacuation planning'), 'the intro shares the match\'s card and email');

ctx.__review[0].introSentAt = '2026-11-01T10:00:00-07:00';
assert.strictEqual(run('connectIntroPlan()').summary.alreadySent, 1, 'no one gets the same intro twice');
console.log('Connect tests passed');
