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
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => k === 'PM_EMAIL' ? 'GregorPosadas@berkeley.edu' : null }) },
  Logger: { log() {} }, console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext("readTable = function (t) { return t === 'Members' ? [{ id: 'gregor', name: 'Gregor Posadas', email: 'gregorposadas@berkeley.edu' }, { id: 'noam', name: 'Noam Anglo', email: 'nanglo@berkeley.edu' }] : []; }", ctx);
const sync = a => vm.runInContext('syncCalendar', ctx)(a);

const a = { id: 'a-1', memberId: 'gregor', title: 'Book the room', due: '2026-10-12T17:00:00-07:00', status: 'todo', calendarEventId: '' };
a.calendarEventId = sync(a);
assert.ok(a.calendarEventId, 'an open task with a due date gets an event');
assert.strictEqual(events[a.calendarEventId].title, 'Due: Book the room');

const old = a.calendarEventId;
a.status = 'done';
a.calendarEventId = sync(a);
assert.strictEqual(a.calendarEventId, '', 'a done task keeps no event id');
assert.ok(events[old].deleted, 'and its event is deleted');

a.status = 'doing';
a.calendarEventId = sync(a);
assert.ok(a.calendarEventId && !events[a.calendarEventId].deleted, 'reopening puts it back');

// Only the project manager's own tasks are on the calendar.
const n = { id: 'a-2', memberId: 'noam', title: 'Follow up with UPRI', due: '2026-10-07T17:00:00-07:00', status: 'todo', calendarEventId: '' };
assert.strictEqual(sync(n), '', "a teammate's task gets no event");
a.memberId = 'noam'; const mineOld = a.calendarEventId;
a.calendarEventId = sync(a);
assert.ok(a.calendarEventId === '' && events[mineOld].deleted, 'reassigning a task to a teammate takes it off');
a.memberId = 'gregor';

const p = { id: 'p-1', name: 'Room', leadId: '', due: '2026-10-19T17:00:00-07:00', status: '', calendarEventId: '' };
p.calendarEventId = vm.runInContext('syncProjectCalendar', ctx)(p);
const pOld = p.calendarEventId;
p.status = 'done';
p.calendarEventId = vm.runInContext('syncProjectCalendar', ctx)(p);
assert.ok(p.calendarEventId === '' && events[pOld].deleted, 'a done workstream comes off too');
assert.strictEqual(vm.runInContext('syncProjectCalendar', ctx)({ id: 'p-2', name: 'Stanford', leadId: 'noam', due: '2026-10-19T17:00:00-07:00', status: '', calendarEventId: '' }), '', "a teammate's workstream stays off");
assert.ok(vm.runInContext('syncFundingCalendar', ctx)({ id: 'f-1', source: 'SOF', status: 'pending', ownerId: 'gregor', due: '2026-10-09T17:00:00-07:00', calendarEventId: '' }), 'my funding deadline is on');
assert.strictEqual(vm.runInContext('syncFundingCalendar', ctx)({ id: 'f-2', source: 'UPRI', status: 'working', ownerId: 'noam', due: '2026-10-09T17:00:00-07:00', calendarEventId: '' }), '', "a teammate's funding lead stays off");
console.log('Calendar tests passed');
