import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('launch acceptance covers both phone widths and keyboard focus',()=>{const s=fs.readFileSync('scripts/launch-check.mjs','utf8');assert.match(s,/\[320,390,1280\]/);assert.ok(s.includes("page.keyboard.press('Tab')"));assert.ok(s.includes("main-content:focus"));});
