import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {checkPrivacyHosts, referencedHosts} from '../scripts/check-privacy-hosts.mjs';

// Build an isolated public-only input tree without setting environment variables.
fs.mkdirSync('.local', {recursive: true});
const input = path.resolve(fs.mkdtempSync('.local/privacy-build-'));
for (const file of fs.readdirSync('.').filter(p => /\.(html|css|js|svg|png|xml|txt|webmanifest)$/.test(p))) {
  fs.copyFileSync(file, path.join(input, file));
}
for (const dir of ['assets', 'data', 'shared']) fs.cpSync(dir, path.join(input, dir), {recursive: true});
if (fs.existsSync('launch/publish-allowlist.json')) {
  fs.mkdirSync(path.join(input, 'launch'));
  fs.copyFileSync('launch/publish-allowlist.json', path.join(input, 'launch/publish-allowlist.json'));
}
execFileSync(process.execPath, [path.resolve('scripts/build.mjs')], {cwd: input});
const built = path.join(input, 'dist');

test('every built HTML, CSS and JS host is disclosed, with controls for new hosts', () => {
  checkPrivacyHosts(built);
  fs.mkdirSync('.local', {recursive: true});
  const root = fs.mkdtempSync('.local/privacy-');
  fs.copyFileSync(path.join(built, 'privacy.html'), path.join(root, 'privacy.html'));
  for (const [file, content] of [['third-party.js', 'fetch("https://new.example/api")'], ['third-party.css', '@import "//cdn.example/style.css";'], ['third-party.html', '<img src="https://images.example/a.png">']]) {
    const dir = path.join(root, file + '-case');
    fs.mkdirSync(dir);
    fs.copyFileSync(path.join(built, 'privacy.html'), path.join(dir, 'privacy.html'));
    fs.writeFileSync(path.join(dir, file), content);
    assert.throws(() => checkPrivacyHosts(dir), /Undisclosed host/);
  }
  assert.deepEqual(referencedHosts('url(//fonts.example/a) https://api.example:443/v1'), ['api.example', 'fonts.example']);
});

test('all routes share the privacy footer and privacy content renders in the common frame', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const notice = fs.readFileSync('privacy.html', 'utf8').match(/<template id="privacy-notice">([\s\S]*?)<\/template>/)[1];
  const context = vm.createContext({document: {addEventListener() {}, querySelector: () => ({innerHTML: notice})}});
  vm.runInContext(app.replace(/\}\)\(\);\s*$/, 'globalThis.footerHTML = footer(); globalThis.privacyHTML = renderPrivacy();})();'), context);
  assert.match(context.footerHTML, /href="privacy.html">Privacy and storage/);
  assert.match(context.privacyHTML, /<h1[^>]*>Privacy and storage/);
  assert.match(context.privacyHTML, /gtd-scanlines/);
  assert.match(context.privacyHTML, /site.s code contains no analytics/);
  assert.match(fs.readFileSync('sitemap.xml', 'utf8'), /privacy.html<\/loc>/);
  assert.match(fs.readFileSync('llms.txt', 'utf8'), /privacy.html/);
});
