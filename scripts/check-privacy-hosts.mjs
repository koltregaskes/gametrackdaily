import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export function referencedHosts(text) {
  return [...new Set([...text.matchAll(/(?:https?:)?\/\/([a-z0-9.-]+)(?=[:/\s"'<>`)};]|$)/gi)].map(m => m[1].toLowerCase()))].sort();
}

export function checkPrivacyHosts(root = 'dist') {
  const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
  const listed = new Set([...privacy.matchAll(/data-privacy-host="([^"]+)"/g)].map(m => m[1]));
  assert.ok(listed.size > 0, 'Privacy page must list the referenced hosts');
  const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : /\.(html|css|js)$/.test(file) ? [file] : [];
  });
  const files = walk(root);
  assert.ok(files.length > 0, 'No built code to check');
  const site = new URL(JSON.parse(fs.readFileSync('seo-config.json', 'utf8')).base).hostname;
  for (const file of files) {
    for (const host of referencedHosts(fs.readFileSync(file, 'utf8'))) {
      assert.ok(host === site || listed.has(host), `Undisclosed host ${host} in ${file}`);
    }
  }
  return {files: files.length, hosts: listed.size};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('PASS privacy host inventory:', checkPrivacyHosts());
}
