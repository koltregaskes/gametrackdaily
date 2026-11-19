import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app.js', 'utf8');
const now = Date.parse('2026-11-15T12:00:00Z');

// Exercise the real normalisers, page templates and timer without a browser or network.
function app(at = now, countdowns = []) {
  const context = vm.createContext({
    Date: class extends Date { static now() { return at; } },
    document: { querySelectorAll: () => countdowns },
    fetch: async (file) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }),
  });
  const beforeBoot = source.slice(0, source.lastIndexOf('  document.addEventListener("DOMContentLoaded"'));
  vm.runInContext(beforeBoot + `
    globalThis.app = {loadData, normaliseEvents, normaliseNews, renderEvents, renderReviews,
      renderReleases, renderHome, renderNews, eventCard, eventRow, isEventLive, updateCountdowns,
      scoreStamp, newsRow, reviewCard};
  })();`, context);
  return context.app;
}

function data(overrides = {}) {
  return { games: [], releases: [], undated: [], events: [], news: [], literacy: [], meta: {}, ...overrides };
}

function event(overrides = {}) {
  return { title: 'Official showcase', date: '2026-12-10', platforms: ['pc'], ...overrides };
}

function review(overrides = {}) {
  return { feed: 'review', t: 'Source review', src: 'Original outlet', url: 'https://example.org/review', platforms: ['pc'], score: null, ...overrides };
}

test('missing, date-only and invalid event times stay pending in every event surface', () => {
  const a = app();
  for (const startAt of [undefined, null, '', '2026-12-10', 'not a time', '2026-12-10T18:00:00']) {
    const [item] = a.normaliseEvents({ events: [event({ startAt })] });
    assert.equal(item.startAtUTC, null);
    assert.equal(a.isEventLive(item), false);
    for (const html of [a.eventCard(item), a.eventRow(item), a.renderEvents(data({ events: [item] }))]) {
      assert.match(html, /Time pending/);
      assert.doesNotMatch(html, /data-countdown|LIVE|T-minus|startDate/);
    }
  }
  assert.doesNotMatch(fs.readFileSync('events.html', 'utf8'), /"startDate"\s*:/);
});

test('past events cannot become next, including starts less than a day ago', () => {
  const a = app();
  const events = a.normaliseEvents({ events: [event({ title: 'Expired timed event', date: '2026-11-15', startAt: '2026-11-15T11:00:00Z' }), event({ title: 'Expired date-only event', date: '2026-11-14' })] });
  const html = a.renderEvents(data({ events }));
  assert.match(html, /No upcoming events confirmed yet/);
  assert.doesNotMatch(html, /Next event|data-countdown|LIVE/);
  assert.match(html, /Event archive/);
  const empty = a.renderEvents(data());
  assert.match(empty, /No upcoming events confirmed yet/);
});

test('date-only events remain upcoming for their stated day and roll into the archive', () => {
  const input = { events: [event({ date: '2026-11-15' })] };
  const a = app();
  assert.match(a.renderEvents(data({ events: a.normaliseEvents(input) })), /Next event/);
  const tomorrow = app(now + 86400000);
  assert.match(tomorrow.renderEvents(data({ events: tomorrow.normaliseEvents(input) })), /No upcoming events confirmed yet/);
});

test('sourced times count down, support both input names and sort by actual instant', () => {
  const a = app();
  const events = a.normaliseEvents({ events: [event({ startAtUTC: '2026-12-10T17:00:00Z' }), event({ startAt: '2026-12-10T18:00:00+02:00' })] });
  assert.equal(events[0].startAtUTC, '2026-12-10T18:00:00+02:00');
  assert.match(a.renderEvents(data({ events })), /data-countdown="2026-12-10T18:00:00\+02:00"/);
});

test('live timers conclude at a sourced end or the documented 30-minute limit', () => {
  for (const [at, end, expected] of [[now, null, 'LIVE NOW'], [now + 30 * 60000, null, 'Concluded'], [now + 60 * 60000, '2026-11-15T13:00:00Z', 'Concluded'], [now + 45 * 60000, '2026-11-15T13:00:00Z', 'LIVE NOW']]) {
    const el = { dataset: { countdown: '2026-11-15T12:00:00Z', countdownEnd: end }, style: {} };
    const a = app(at, [el]);
    a.updateCountdowns();
    assert.equal(el.textContent, expected);
    assert.equal(a.isEventLive({ startAtUTC: el.dataset.countdown, endAtUTC: end }), expected === 'LIVE NOW');
  }
  const invalid = { dataset: { countdown: '' }, style: {} };
  app(now, [invalid]).updateCountdowns();
  assert.equal(invalid.textContent, 'Time pending');
});

test('null scores render unscored coverage without a stamp or /10 on every review surface', () => {
  const a = app();
  const item = review();
  const fixture = data({ news: [item, review({ t: 'Second review' })], games: [{ id: 'starfall-protocol', art: 'unrelated-studio.svg', platforms: [] }] });
  for (const html of [a.renderReviews(fixture), a.reviewCard(item), a.newsRow(item, 'red'), a.renderNews(fixture), a.renderHome(fixture)]) {
    assert.match(html, /Unscored coverage/);
    assert.doesNotMatch(html, /\/10|score-stamp/);
  }
  assert.doesNotMatch(a.renderReviews(fixture), /unrelated-studio\.svg|Featured verdict/);
});

test('verified scores retain original scale and precision, including zero', () => {
  const a = app();
  for (const [score, scoreScale] of [[82.5, 100], [4.5, 5], [0, 10]]) {
    const input = review({ score, scoreScale, scoreVerified: true });
    const [item] = a.normaliseNews({ feeds: [{ id: 'review', items: [input] }] });
    assert.equal(item.scoreScale, scoreScale);
    assert.equal(item.scoreVerified, true);
    assert.match(a.scoreStamp(item), new RegExp(`>${score}</span>`));
    assert.match(a.scoreStamp(item), new RegExp(`>/${scoreScale}</span>`));
  }
  for (const change of [{ score: 8 }, { score: 8, scoreScale: 10 }, { score: 8, scoreVerified: true }, { score: 8, scoreScale: 0, scoreVerified: true }, { score: 11, scoreScale: 10, scoreVerified: true }, { score: 8, scoreScale: 10, scoreVerified: true, _example: true }, { score: 8, scoreScale: 10, scoreVerified: true, url: null }]) {
    const html = a.scoreStamp(review(change));
    assert.match(html, /Unscored coverage/);
    assert.doesNotMatch(html, /score-stamp|\/10/);
  }
});

test('provisional review notice remains visible', () => {
  const html = app().renderReviews(data({ news: [review({ _example: true })], meta: { usingProvisionalNews: true } }));
  assert.match(html, /PROVISIONAL/);
  assert.match(html, /Unscored coverage/);
});

test('calendar and news disclose stale, unavailable and future source dates; fresh data has no warning', () => {
  const a = app();
  for (const [stamp, warning] of [['2026-11-12T11:59:59.999Z', true], ['2026-11-12T12:00:00.000Z', false], ['2026-11-15T11:00:00.000Z', false], [undefined, true], ['invalid', true], ['2026-11-16T12:00:00.000Z', true]]) {
    const fixture = data({ meta: { releaseUpdated: stamp, newsUpdated: stamp } });
    for (const html of [a.renderReleases(fixture), a.renderReleases(fixture, true), a.renderEvents(fixture), a.renderNews(fixture), a.renderReviews(fixture), a.renderHome(fixture)]) {
      assert.equal(html.includes('may be out of date'), warning);
      if (stamp && Number.isFinite(Date.parse(stamp))) assert.ok(html.includes(`datetime="${stamp}"`));
      else assert.match(html, /source timestamp: unavailable/);
    }
  }
});

test('real local manifests retain their own timestamps and missing event times through loading', async () => {
  const a = app();
  const loaded = await a.loadData();
  const calendar = JSON.parse(fs.readFileSync('data/release-calendar.json', 'utf8'));
  const news = JSON.parse(fs.readFileSync('data/games-news.json', 'utf8'));
  assert.equal(loaded.meta.releaseUpdated, calendar.updatedAt);
  assert.equal(loaded.meta.newsUpdated, news.generated);
  const untimed = calendar.events.filter(e => !e.startAt && !e.startAtUTC);
  assert.ok(untimed.length > 0, 'real date-only fixtures exist');
  for (const e of untimed) assert.equal(loaded.events.find(item => item.id === e.id).startAtUTC, null);
  const stale = app(Date.parse(calendar.updatedAt) + 72 * 3600000 + 1);
  assert.ok(stale.renderReleases(loaded).includes('may be out of date'));
  const december = app(Date.parse('2026-12-15T12:00:00Z'));
  const launchDay = december.renderEvents(loaded);
  const nextTitle = launchDay.match(/Next event<\/div>\s*<h2[^>]*>([^<]*)</)?.[1];
  const nextSource = calendar.events.find(e => e.title === nextTitle);
  if (nextTitle) assert.ok(nextSource.date >= '2026-12-15', `${nextTitle} is not in the past at launch`);
  else assert.match(launchDay, /No upcoming events confirmed yet/);
  assert.match(a.renderReviews(loaded), /Unscored coverage/);
  assert.doesNotMatch(a.renderReviews(loaded), /score-stamp/);
});
