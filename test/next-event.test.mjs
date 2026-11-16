import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app.js', 'utf8');
const calendar = JSON.parse(fs.readFileSync('data/release-calendar.json', 'utf8'));
const launch = Date.parse('2026-12-15T12:00:00Z');

// Run the real normaliser and Events template at a fixed clock, without a browser or network.
function app(at) {
  const context = vm.createContext({
    Date: class extends Date { static now() { return at; } },
    document: { querySelectorAll: () => [] },
  });
  const beforeBoot = source.slice(0, source.lastIndexOf('  document.addEventListener("DOMContentLoaded"'));
  vm.runInContext(beforeBoot + `
    globalThis.app = {normaliseEvents, renderEvents};
  })();`, context);
  return context.app;
}

function page(a, events) {
  return a.renderEvents({ games: [], releases: [], undated: [], events, news: [], literacy: [], meta: {} });
}

function nextTitle(html) {
  return html.match(/Next event<\/div>\s*<h2[^>]*>([^<]*)</)?.[1] ?? null;
}

function section(html, heading) {
  const start = html.indexOf(heading);
  if (start === -1) return '';
  const end = html.indexOf('<section', start);
  return html.slice(start, end === -1 ? undefined : end);
}

test('at launch the next event is the earliest confirmed 2027 event, never a past one', () => {
  const a = app(launch);
  const html = page(a, a.normaliseEvents(calendar));
  const upcoming = calendar.events.filter((e) => e.date >= '2026-12-15').sort((x, y) => x.date.localeCompare(y.date));
  assert.ok(upcoming.length > 0, 'officially announced events exist after launch');
  assert.equal(nextTitle(html), upcoming[0].title);
  for (const past of ['Game Developers Conference 2026', 'The Game Awards 2026', 'gamescom 2026']) {
    assert.notEqual(nextTitle(html), past);
    assert.ok(section(html, 'Event archive').includes(past), `${past} is archived`);
  }
});

test('next event ignores input order and never falls back to a past event', () => {
  const a = app(launch);
  const unsorted = [
    { title: 'Past conference', date: '2026-03-09', endDate: '2026-03-13' },
    { title: 'Later event', date: '2027-09-16' },
    { title: 'Past timed showcase', date: '2026-12-15', startAtUTC: '2026-12-15T11:00:00Z' },
    { title: 'Earliest upcoming', date: '2027-01-21' },
  ].map((e) => a.normaliseEvents({ events: [e] })[0]);
  assert.equal(nextTitle(page(a, unsorted)), 'Earliest upcoming');

  const onlyPast = unsorted.filter((e) => e.date < '2027-01-01');
  const empty = page(a, onlyPast);
  assert.equal(nextTitle(empty), null);
  assert.match(empty, /No upcoming events confirmed yet/);
  assert.doesNotMatch(empty, /data-countdown/);
  assert.ok(section(empty, 'Event archive').includes('Past conference'));
});

test('with no events at all the page shows the honest empty state', () => {
  const html = page(app(launch), []);
  assert.match(html, /No upcoming events confirmed yet/);
  assert.doesNotMatch(html, /Next event/);
});

test('a running multi-day date-only event stays current without becoming next or live', () => {
  const a = app(Date.parse('2027-03-02T12:00:00Z'));
  const events = a.normaliseEvents({ events: [
    { title: 'Running conference', date: '2027-03-01', endDate: '2027-03-04' },
    { title: 'Following awards', date: '2027-04-14' },
  ] });
  const html = page(a, events);
  assert.equal(nextTitle(html), 'Following awards');
  assert.ok(section(html, 'Upcoming and current events').includes('Running conference'));
  assert.ok(!section(html, 'Event archive').includes('Running conference'));
  assert.doesNotMatch(html, /LIVE/);
  const after = app(Date.parse('2027-03-05T12:00:00Z'));
  assert.ok(section(page(after, after.normaliseEvents({ events: [events[0]] })), 'Event archive').includes('Running conference'));
});

test('every post-launch event records an official source and check date without an invented time', () => {
  const later = calendar.events.filter((e) => e.date >= '2026-12-15');
  for (const e of later) {
    assert.match(e.officialUrl, /^https:\/\//, `${e.id} officialUrl`);
    if (e.sourceUrl) assert.match(e.sourceUrl, /^https:\/\//, `${e.id} sourceUrl`);
    assert.ok(e.source, `${e.id} names its source`);
    assert.ok(Number.isFinite(Date.parse(e.sourceCheck?.checkedAt)), `${e.id} records when it was checked`);
    if (/time-pending/.test(e.status)) assert.ok(!e.startAt && !e.startAtUTC, `${e.id} keeps its time pending`);
    if (e.endDate) assert.ok(e.endDate >= e.date, `${e.id} ends after it starts`);
    const where = [e.venue, e.city].filter(Boolean).join(' · ') || e.where;
    assert.ok(where, `${e.id} does not default to "Online"`);
  }
});
