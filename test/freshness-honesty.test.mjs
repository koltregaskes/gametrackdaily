import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('app.js','utf8');const now=Date.parse('2026-11-13T12:00:00Z');
function fn(name){const start=source.indexOf('  function '+name+'(');assert.ok(start>=0,name+' exists');const end=source.indexOf('\n  function ',start+5);return source.slice(start,end<0?undefined:end);}
const ctx={NOW:()=>now,DAY:86400000,railForFeed:()=>({id:'gaming',title:'Gaming'}),normalisePlatforms:()=>[],PROVISIONAL_NEWS:[],esc:String};vm.createContext(ctx);vm.runInContext(fn('readableAge')+'\n'+fn('normaliseNews')+'\n'+fn('newsFreshnessNotice'),ctx);
test('stored headline age cannot conceal old or missing source timestamps',()=>{const rows=ctx.normaliseNews({feeds:[{generatedAt:new Date(now).toISOString(),items:[{title:'Old',age:'1h',publishedAt:'2026-11-01T12:00:00Z'},{title:'Unknown',age:'2h'}]}]});assert.equal(rows[0].h,'12d');assert.equal(rows[1].h,'undated');});
test('future source timestamps are unverified, never labelled fresh',()=>assert.equal(ctx.readableAge('2026-11-14T12:00:00Z'),'future date (unverified)'));

test('stale, invalid and future feed editions disclose unverified freshness',()=>{for(const value of ['2026-11-01','invalid','2026-11-14'])assert.match(ctx.newsFreshnessNotice(value),/Update not verified/);assert.equal(ctx.newsFreshnessNotice('2026-11-13T11:00:00Z'),'');});
