import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('app.js', 'utf8');
const ctx = vm.createContext({URL, document: {addEventListener() {}}, fetch: async url => ({ok: true, json: async () => JSON.parse(fs.readFileSync(url, 'utf8'))})});
vm.runInContext(app.replace(/\}\)\(\);\s*$/, 'globalThis.api = {loadData, normaliseRelease, releaseRow, releaseCard, vsCell, renderHome, renderReleases, renderGames, footer, normaliseNews, newsRow};})();'), ctx);

test('release rows, grid cards and home cards retain linked sources and provenance', () => {
  const release = ctx.api.normaliseRelease({title: 'A game', platforms: ['PC'], source: 'IGDB', trackingState: 'live-api', sourceUrl: 'https://www.igdb.com/games/a-game', igdbUrl: 'https://www.igdb.com/g/a-game', officialUrl: 'https://example.com/game', releaseWindow: '2027'});
  for (const render of [ctx.api.releaseRow, ctx.api.releaseCard, item => ctx.api.vsCell(item, 'L')]) {
    const html = render(release);
    assert.match(html, /Source: <a[^>]+href="https:\/\/www.igdb.com\/games\/a-game"[^>]*>IGDB<\/a>/);
    assert.match(html, /provenance: live-api/);
    assert.match(html, /recorded window: 2027/);
    assert.match(html, /href="https:\/\/www.igdb.com\/g\/a-game"/);
    assert.match(html, /href="https:\/\/example.com\/game"/);
  }
  const wanted = ctx.api.normaliseRelease({title: '<script>', source: 'Wanted List: Games', trackingState: 'wanted', igdbUrl: 'https://www.igdb.com/g/3jfg'});
  assert.match(ctx.api.releaseRow(wanted), /Source: Wanted List: Games; provenance: wanted/);
  assert.match(ctx.api.releaseRow(wanted), />IGDB record<\/a>/);
  const unsafe = ctx.api.normaliseRelease({...wanted, sourceUrl: 'javascript:alert(1)', officialUrl: 'https://user:pass@example.com/'});
  assert.doesNotMatch(ctx.api.releaseCard(unsafe), /href="(?:javascript:|https:\/\/user:pass)/);
});

test('persistent credit covers Releases, Calendar, Home and Games, including an empty release slate', async () => {
  const data = await ctx.api.loadData();
  for (const render of [ctx.api.renderHome, ctx.api.renderReleases, d => ctx.api.renderReleases(d, true), ctx.api.renderGames]) {
    assert.match(render(data), /data-igdb-credit>Release data provided by <a href="https:\/\/www.igdb.com\/"/);
  }
  assert.match(ctx.api.renderReleases({...data, releases: [], undated: []}), /data-igdb-credit/);
  for (const release of data.releases) {
    assert.match(ctx.api.releaseRow(release), /Source: <a[^>]*>IGDB<\/a>; provenance: live-api/);
  }
  assert.doesNotMatch(ctx.api.footer(), /partner(?:ship)?/i);
});

test('Releases and Calendar show IGDB credit together with the original source timestamp and stale-data notice', async () => {
  const data = await ctx.api.loadData();
  data.meta.releaseUpdated = '2000-01-01T00:00:00Z';
  for (const alias of [false, true]) {
    const html = ctx.api.renderReleases(data, alias);
    assert.match(html, /datetime="2000-01-01T00:00:00Z"/);
    assert.match(html, /data-release-freshness="unverified"/);
    assert.match(html, /this data may be out of date/);
    assert.match(html, /data-igdb-credit>Release data provided by/);
    assert.match(html, /Source: <a[^>]*>IGDB<\/a>; provenance: live-api/);
  }
});

test('news retains its actual outlet names and article links; every published source is reviewed', () => {
  const news = JSON.parse(fs.readFileSync('data/games-news.json', 'utf8'));
  const rows = ctx.api.normaliseNews(news);
  assert.equal(rows.length, news.feeds.flatMap(f => f.items).length);
  for (const item of rows) {
    const html = ctx.api.newsRow(item);
    assert.ok(html.includes(item.src));
    assert.ok(html.includes(item.url.replaceAll('&', '&amp;')));
  }
  const permissions = fs.readFileSync('launch/source-permissions.md', 'utf8');
  const sources = new Set(['IGDB']);
  for (const file of fs.readdirSync('data').filter(p => /^(?:games-news|news-feed-.*)\.json$/.test(p) && p !== 'news-feed-latest.json')) {
    const data = JSON.parse(fs.readFileSync('data/' + file, 'utf8'));
    for (const item of [...(data.articles || []), ...(data.feeds || []).flatMap(f => f.items)]) if (item.source) sources.add(item.source);
  }
  for (const source of sources) assert.ok(permissions.includes(`| ${source} |`), `Missing permission row: ${source}`);
  assert.equal((permissions.match(/\| permission unverified \|/g) || []).length, sources.size);
});
