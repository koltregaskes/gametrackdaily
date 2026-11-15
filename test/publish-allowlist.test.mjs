import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {checkPublishAllowlist} from '../scripts/check-publish-allowlist.mjs';

test('exact public artifact retains every fetched and rendered local URL', async () => {
  fs.mkdirSync('.local', {recursive: true});
  const out = path.join(fs.mkdtempSync('.local/allowlist-'), 'dist');
  execFileSync(process.execPath, ['scripts/build.mjs', '--output', out]);
  await checkPublishAllowlist(out);
  fs.writeFileSync(path.join(out, 'unexpected.json'), '{}');
  assert.throws(() => checkPublishAllowlist(out), /exact allowlist/);
});

test('missing fetched data fails the publication check', async () => {
  fs.mkdirSync('.local', {recursive: true});
  const out = path.join(fs.mkdtempSync('.local/allowlist-'), 'dist');
  execFileSync(process.execPath, ['scripts/build.mjs', '--output', out]);
  fs.renameSync(path.join(out, 'data/games-news.json'), path.join(out, 'data/archived-news.json'));
  assert.throws(() => checkPublishAllowlist(out), /exact allowlist/);
});

test('a new fetch cannot be hidden by the app loader fallback', async () => {
  fs.mkdirSync('.local', {recursive: true});
  const out = path.join(fs.mkdtempSync('.local/allowlist-'), 'dist');
  execFileSync(process.execPath, ['scripts/build.mjs', '--output', out]);
  const app = path.join(out, 'app.js');
  fs.writeFileSync(app, fs.readFileSync(app, 'utf8').replace('readJson("data/games-manifest.json"', 'readJson("data/new-unpublished.json"'));
  await assert.rejects(() => checkPublishAllowlist(out), /Missing fetched public URL/);
});
