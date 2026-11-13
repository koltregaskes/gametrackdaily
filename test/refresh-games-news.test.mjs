import test from 'node:test';import assert from 'node:assert/strict';
import {refresh,parseFeed} from '../scripts/refresh-games-news.mjs';
const now=Date.parse('2026-11-13T06:00:00Z');
const source={id:'pc',name:'PC source',rail:'gaming',url:'https://example.org/feed'};
const xml='<rss><channel><item><title>PC game launch</title><link>https://example.org/game</link><pubDate>Thu, 12 Nov 2026 12:00:00 GMT</pubDate><description>Windows PC release</description></item></channel></rss>';
const old={generated:'2026-11-12T12:00:00.000Z',feeds:[{id:'gaming',title:'Gaming News',items:[]},{id:'review',title:'Reviews',items:[]}]};
test('partial failures still produce successful gaming data and source report',async()=>{const r=await refresh([source,{...source,id:'bad'}],old,{now,fetcher:async url=>({ok:true,url,text:async()=>xml})});assert.equal(r.data.feeds[0].items.length,1);assert.equal(r.data.feeds[1].items.length,0);const partial=await refresh([source,{...source,id:'bad',url:'https://bad.org'}],old,{now,fetcher:async url=>{if(url.includes('bad'))throw Error('timeout');return {ok:true,url,text:async()=>xml}}});assert.equal(partial.failures.length,1);assert.equal(partial.data.feeds[0].items.length,1)});
test('all failures retain existing feed',async()=>{const r=await refresh([source],old,{now,fetcher:async()=>{throw Error('offline')}});assert.equal(r.data,null);assert.equal(r.failures.length,1)});
test('unchanged source editions do not churn generated timestamps',async()=>{const fetcher=async url=>({ok:true,url,text:async()=>xml});const a=await refresh([source],old,{now,fetcher});const b=await refresh([source],a.data,{now:now+1000,fetcher});assert.deepEqual(a.data,b.data)});
test('DTD, future dates and Nintendo-only articles do not enter the feed',()=>{assert.throws(()=>parseFeed('<!DOCTYPE rss>'+xml,source,now));assert.equal(parseFeed(xml,source,now-86400000).length,0);assert.equal(parseFeed(xml.replace('PC game launch','Nintendo Switch launch').replace('Windows PC release','Nintendo only'),source,now).length,0)});

test('platform filters use whole words, preserving Studios, BioShock and Switching headlines',()=>{
 for(const title of ['Larian Studios announces its next game','BioShock sequel announced','Switching to a new engine']){
  const item=xml.replace('PC game launch',title).replace('Windows PC release','A new game announcement');
  assert.equal(parseFeed(item,source,now).length,1,title);
 }
 for(const title of ['Nintendo Switch game announced','New iOS game','Android mobile release']){
  const item=xml.replace('PC game launch',title).replace('Windows PC release','A new game announcement');
  assert.equal(parseFeed(item,source,now).length,0,title);
 }
 assert.equal(parseFeed(xml.replace('PC game launch','Nintendo and Xbox cross-platform release'),source,now).length,1);
});

test('all refreshed rails, including preserved ones, satisfy the canonical news contract',async()=>{
 const previous=structuredClone(old);previous.feeds[1].generatedAt='2026-11-11T12:00:00.000Z';
 const r=await refresh([source],previous,{now,fetcher:async url=>({ok:true,url,text:async()=>xml})});
 const {validateNewsData,DEFAULT_MAX_SOURCE_AGE_HOURS}=await import('../scripts/public-data-contract.mjs');
 assert.equal(r.data.feeds[1].generatedAt,r.data.generated);
 assert.ok(r.data.feeds.every(f=>f.generatedAt===r.data.generated));
 assert.equal(validateNewsData(r.data,{now:new Date(now),maxSourceAgeHours:DEFAULT_MAX_SOURCE_AGE_HOURS}).feedCount,4);
 assert.equal(previous.feeds[1].generatedAt,'2026-11-11T12:00:00.000Z');
 const invalid=structuredClone(r.data);invalid.feeds[1].generatedAt='2026-11-11T12:00:00.000Z';
 assert.throws(()=>validateNewsData(invalid,{now:new Date(now),maxSourceAgeHours:DEFAULT_MAX_SOURCE_AGE_HOURS}),/news.feeds\[1\].generatedAt must match news.generated/);
});
