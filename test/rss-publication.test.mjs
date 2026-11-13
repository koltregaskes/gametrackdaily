import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
test('branch Pages publication includes the generated RSS feed',()=>{
 assert.equal(execFileSync('git',['ls-files','rss.xml'],{encoding:'utf8'}).trim(),'rss.xml');
 assert.ok(fs.readFileSync('rss.xml','utf8').includes('<rss version="2.0"'));
 assert.match(fs.readFileSync('.github/workflows/refresh-games-news.yml','utf8'),/git add -- data\/games-news\.json rss\.xml/);
});
