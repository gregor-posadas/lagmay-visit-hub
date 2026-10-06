// Finished tasks and workstreams come off the deadlines calendar; open ones stay on it.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const events = {}; let next = 1;
const cal = {
  createEvent(title, start, end) { const id = 'ev' + next++; events[id] = { title, start, end, deleted: false }; return mkEv(id); },
  getEventById(id) { return events[id] && !events[id].deleted ? mkEv(id) : null; }
};
function mkEv(id) {
  const e = events[id];
  return { getId: () => id, setTitle(t) { e.title = t; }, setDescription() {}, getEndTime: () => e.end, setTime(s, en) { e.start = s; e.end = en; },
    addPopupReminder() {}, deleteEvent() { e.deleted = true; } };
}
const ctx = {
  CalendarApp: { getCalendarById: () => cal, getDefaultCalendar: () => cal },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  Logger: { log() {} }, console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext("readTable = function (t) { return t === 'Members' ? [{ id: 'gregor', name: 'Gregor Posadas' }] : []; }", ctx);
const sync = a => vm.runInContext('syncCalendar', ctx)(a);

const a = { id: 'a-1', memberId: 'gregor', title: 'Book the room', due: '2026-10-12T17:00:00-07:00', status: 'todo', calendarEventId: '' };
a.calendarEventId = sync(a);
assert.ok(a.calendarEventId, 'an open task with a due date gets an event');
assert.strictEqual(events[a.calendarEventId].title, 'Due (Gregor): Book the room');

const old = a.calendarEventId;
a.status = 'done';
a.calendarEventId = sync(a);
assert.strictEqual(a.calendarEventId, '', 'a done task keeps no event id');
assert.ok(events[old].deleted, 'and its event is deleted');

a.status = 'doing';
a.calendarEventId = sync(a);
assert.ok(a.calendarEventId && !events[a.calendarEventId].deleted, 'reopening puts it back');

const p = { id: 'p-1', name: 'Room', due: '2026-10-19T17:00:00-07:00', status: '', calendarEventId: '' };
p.calendarEventId = vm.runInContext('syncProjectCalendar', ctx)(p);
const pOld = p.calendarEventId;
p.status = 'done';
p.calendarEventId = vm.runInContext('syncProjectCalendar', ctx)(p);
assert.ok(p.calendarEventId === '' && events[pOld].deleted, 'a done workstream comes off too');
console.log('Calendar tests passed');
