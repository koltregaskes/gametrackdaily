import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('app.js', 'utf8');
async function load({ calendar = {}, news = {}, unavailable = [] } = {}) {
  const context = vm.createContext({
    document: { addEventListener() {} },
    fetch: async file => {
      if (unavailable.includes(file)) throw Error('offline');
      const value = file === 'data/release-calendar.json' ? calendar
        : file === 'data/games-news.json' ? news
        : JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ok: true, json: async () => value };
    },
  });
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.api = {loadData, normaliseNews, renderHome, renderReleases, renderEvents, renderNews, renderReviews};})();'), context);
  return { api: context.api, data: await context.api.loadData() };
}

test('empty and entirely past calendars never manufacture upcoming releases', async () => {
  for (const releases of [[], [{ id: 'past', title: 'Past release', date: '2000-01-01', platforms: ['pc'] }]]) {
    const { api, data } = await load({ calendar: { releases } });
    assert.equal(data.releases.length, 0);
    assert.equal(data.meta.usingProvisionalReleases, false);
    for (const html of [api.renderHome(data), api.renderReleases(data), api.renderReleases(data, true)]) {
      assert.doesNotMatch(html, /Crimson Skylines|Garrison: Final Mile|handoff examples/);
      assert.match(html, /No upcoming releases listed/);
    }
  }
});

test('missing news and calendar requests remain empty and visibly unavailable', async () => {
  const { api, data } = await load({ unavailable: ['data/release-calendar.json', 'data/games-news.json'] });
  assert.equal(data.releases.length, 0);
  assert.equal(data.news.length, 0);
  assert.equal(data.meta.usingProvisionalNews, false);
  for (const html of [api.renderHome(data), api.renderNews(data), api.renderReviews(data), api.renderReleases(data), api.renderEvents(data)]) {
    assert.match(html, /source timestamp: unavailable/);
    assert.match(html, /Update not verified/);
    assert.doesNotMatch(html, /Godot 5 hits stable|Crimson Skylines/);
  }
});

test('a fresh feed still discloses partial failures on all coverage surfaces', async () => {
  const news = { generated: new Date().toISOString(), feeds: [{ id: 'gaming', title: 'Gaming', items: [{ title: 'Sourced story', source: 'Outlet', url: 'https://example.org/story' }] }], failedSources: [{ id: '<untrusted>', error: 'do not render raw provider errors' }] };
  const { api, data } = await load({ news });
  for (const html of [api.renderHome(data), api.renderNews(data), api.renderNews(data, 'gaming'), api.renderReviews(data)]) {
    assert.match(html, /Coverage incomplete/);
    assert.match(html, /1 news source could not be refreshed/);
    assert.doesNotMatch(html, /<untrusted>|do not render raw provider errors/);
  }
  const good = await load({ news: { ...news, failedSources: [] } });
  assert.doesNotMatch(good.api.renderNews(good.data), /Coverage incomplete/);
});

test('missing article attribution is labelled instead of borrowing the rail title', async () => {
  const { api } = await load();
  const [item] = api.normaliseNews({ feeds: [{ id: 'gaming', title: 'Gaming News', items: [{ title: 'Unattributed' }] }] });
  assert.equal(item.src, 'Source unavailable');
  assert.equal(api.normaliseNews({ feeds: [] }).length, 0);
});

test('real upcoming releases, undated watchlists and source attribution survive loading', async () => {
  const release = { id: 'future', title: 'Tracked release', date: '2099-01-01', platforms: ['pc'], source: 'Official studio' };
  const { api, data } = await load({ calendar: { releases: [release], undated: [{ ...release, id: 'undated', date: null }] }, news: { feeds: [{ id: 'gaming', title: 'Gaming', items: [{ title: 'Real story', source: 'Original outlet', url: 'https://example.org/story' }] }] } });
  assert.equal(data.releases.length, 1);
  assert.equal(data.releases[0].title, release.title);
  assert.equal(data.undated.length, 1);
  assert.equal(data.news[0].src, 'Original outlet');
  assert.doesNotMatch(api.renderReleases(data), /No upcoming releases listed/);
  assert.match(api.renderNews(data), /href="https:\/\/example.org\/story"/);
});
