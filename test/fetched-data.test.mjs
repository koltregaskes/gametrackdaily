import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFetchedData} from '../scripts/check-fetched-data.mjs';
const base = 'https://koltregaskes.github.io/gametrackdaily/';
for (const name of ['games-manifest.json','release-calendar.json','games-news.json','reviews-manifest.json']) {
 test('launch rejects a missing '+name+' even when the UI renders fallback', () => {
  assert.throws(() => assertFetchedData([{url:base+'data/'+name,status:404}],base), /Required public data/);
 });
}
test('launch rejects a network failure for public data', () => {
 assert.throws(() => assertFetchedData([{url:base+'data/games-news.json',failed:true}],base));
});
test('successful data and unrelated external failures are handled separately', () => {
 assertFetchedData([{url:base+'data/games-news.json',status:200},{url:'https://example.org/data/news.json',status:403}],base);
});
