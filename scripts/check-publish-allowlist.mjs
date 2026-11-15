import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

export function checkPublishAllowlist(root = 'dist') {
  const {files} = JSON.parse(fs.readFileSync('launch/publish-allowlist.json', 'utf8'));
  const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Public symlink: ${file}`);
    return entry.isDirectory() ? walk(file) : [path.relative(root, file).split(path.sep).join('/')];
  });
  assert.deepEqual(walk(root).sort(), [...files].sort(), 'Public artifact must match the exact allowlist');
  assert.ok(!files.some(p => /data\/(?:news-feed-|digest-)/.test(p)), 'Historical feeds must remain unpublished');
  const required = new Set();
  const requireURL = value => {
    if (!value || /^(?:https?:|mailto:|data:|#)/.test(value)) return;
    const file = value.split(/[?#]/)[0];
    if (file) { required.add(file); assert.ok(files.includes(file), `Missing public URL: ${file}`); }
  };
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  // Execute the real loader with an offline fetch double, including computed fetch paths.
  const context = vm.createContext({document: {addEventListener() {}}, fetch: async url => {
    requireURL(url);
    return {ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, url), 'utf8'))};
  }});
  vm.runInContext(app.replace(/\}\)\(\);\s*$/, 'globalThis.load = loadData; globalThis.pages = {renderHome, renderReleases, renderEvents, renderNews, renderReviews, renderGames, renderDevelopment};})();'), context);
  return context.load().then(data => {
    // readJson catches fetch errors, so validate recorded requests outside that catch.
    for (const file of required) assert.ok(files.includes(file), `Missing fetched public URL: ${file}`);
    const html = files.filter(p => p.endsWith('.html')).map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n') +
      Object.values(context.pages).map(render => render(data)).join('\n');
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) requireURL(match[1]);
    assert.ok(required.size > 4, 'Must check rendered links as well as fetched manifests');
    return {files: files.length, required: required.size};
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('PASS publish boundary:', await checkPublishAllowlist());
}
