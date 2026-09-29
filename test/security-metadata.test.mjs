import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_PAGES = [
  'calendar.html',
  'events.html',
  'game-development.html',
  'games.html',
  'index.html',
  'news-development.html',
  'news-gaming.html',
  'news-previews.html',
  'news-reviews.html',
  'news.html',
  'releases.html',
  'reviews.html',
];
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "media-src 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

test('every public page has one early, exact CSP and referrer policy', async () => {
  const htmlPages = (await readdir(ROOT))
    .filter((name) => name.endsWith('.html'))
    .sort();
  assert.deepEqual(htmlPages, EXPECTED_PAGES);

  for (const page of htmlPages) {
    const html = await readFile(path.join(ROOT, page), 'utf8');
    const cspTags = html.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi) ?? [];
    const referrerTags = html.match(/<meta\b[^>]*name=["']referrer["'][^>]*>/gi) ?? [];

    assert.equal(cspTags.length, 1, `${page} must contain exactly one CSP meta tag`);
    assert.equal(referrerTags.length, 1, `${page} must contain exactly one referrer meta tag`);
    assert.equal(attribute(cspTags[0], 'content'), CSP, `${page} CSP must match the reviewed policy`);
    assert.equal(
      attribute(referrerTags[0], 'content'),
      'strict-origin-when-cross-origin',
      `${page} referrer policy must match the reviewed policy`,
    );

    const firstControlledResource = [
      html.search(/<script\b[^>]*\bsrc=/i),
      html.search(/<link\b[^>]*\brel=["'](?:icon|manifest|stylesheet)["']/i),
    ].filter((index) => index >= 0);
    assert.ok(firstControlledResource.length > 0, `${page} must have a controlled resource`);
    assert.ok(
      html.indexOf(cspTags[0]) < Math.min(...firstControlledResource),
      `${page} CSP must precede controlled resources`,
    );
  }
});

test('policy stays narrow and matches the current external resource graph', async () => {
  assert.doesNotMatch(CSP, /(?:^|[\s;])\*(?:[\s;]|$)/);
  assert.doesNotMatch(CSP, /'unsafe-eval'/);
  assert.doesNotMatch(CSP, /frame-ancestors/);

  const css = await readFile(path.join(ROOT, 'styles.css'), 'utf8');
  const externalCssUrls = [...css.matchAll(/https:\/\/[^"')\s]+/g)].map((match) => match[0]);
  assert.deepEqual([...new Set(externalCssUrls)], [
    'https://fonts.googleapis.com/css2?family=Anton&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap',
  ]);

  const app = await readFile(path.join(ROOT, 'app.js'), 'utf8');
  assert.doesNotMatch(app, /fetch\s*\(\s*["'`]https?:/i);
  assert.doesNotMatch(app, /serviceWorker|new\s+(?:Shared)?Worker|WebSocket|EventSource|sendBeacon/);
});
