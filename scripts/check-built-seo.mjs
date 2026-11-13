import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';import{XMLParser,XMLValidator}from'fast-xml-parser';
export function checkBuiltSEO(root){
 const read=p=>fs.readFileSync(path.join(root,p),'utf8'),base='https://koltregaskes.github.io/gametrackdaily/';
 const xml=text=>{assert.equal(XMLValidator.validate(text),true,'Invalid XML');return new XMLParser().parse(text);};
 const pages=fs.readdirSync(root).filter(p=>p.endsWith('.html')&&p!=='404.html');assert.ok(pages.length);
 const urls=[];
 for(const page of pages){const html=read(page),url=new URL(page==='calendar.html'?'releases.html':page==='index.html'?'':page,base).href;
  assert.equal([...html.matchAll(/rel="canonical"/g)].length,1,page+' canonical count');assert.ok(html.includes('rel="canonical" href="'+url+'"'),page+' canonical');
  assert.match(html,/<title>[^<]+<\/title>/);assert.match(html,/<meta\s+name="description"\s+content="[^"]+"/);
  assert.ok(html.includes('property="og:url" content="'+url+'"'));assert.ok(html.includes(base+'assets/social/gametrackdaily-og.png'));assert.match(html,/name="twitter:image:alt" content="[^"]+"/);
  assert.ok(html.includes('type="application/rss+xml"'));const graphs=[...html.matchAll(/type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));assert.ok(graphs.some(g=>JSON.stringify(g).includes(JSON.stringify(url))),page+' JSON-LD canonical');
  if(page!=='calendar.html')urls.push(url);
 }
 const locations=xml(read('sitemap.xml')).urlset.url.map(v=>v.loc);assert.deepEqual([...locations].sort(),urls.sort(),'Exact built sitemap routes');
 assert.ok(read('robots.txt').includes('Sitemap: '+base+'sitemap.xml'));assert.ok(read('llms.txt').includes('GameTrackDaily'));
 const png=fs.readFileSync(path.join(root,'assets/social/gametrackdaily-og.png'));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
 const news=JSON.parse(read('data/games-news.json'));let expected=news.feeds.flatMap(f=>f.items).filter(i=>i.title&&/^https:\/\//.test(i.url)&&Number.isFinite(Date.parse(i.publishedAt))).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));expected=[...new Map(expected.map(i=>[i.url,i])).values()].slice(0,30);
 const channel=xml(read('rss.xml')).rss.channel;assert.equal(channel.link,base);const items=Array.isArray(channel.item)?channel.item:[channel.item];assert.equal(items.length,expected.length);for(const [i,item]of items.entries()){assert.equal(item.link,expected[i].url);assert.equal(Date.parse(item.pubDate),Date.parse(expected[i].publishedAt),'RSS original source date');}
 return {routes:urls.length,rssItems:items.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log('PASS built SEO '+JSON.stringify(checkBuiltSEO(path.resolve(process.env.BUILD_DIR||'dist'))));
