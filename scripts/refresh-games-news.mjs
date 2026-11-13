import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
const text=x=>String(typeof x==='object'?x?.['#text']||'':x||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function parseFeed(xml,source,now=Date.now()) {
 if(xml.length>5_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Unsafe or oversized XML');
 if(XMLValidator.validate(xml)!==true)throw Error('Invalid XML');
 const doc=new XMLParser({ignoreAttributes:false,processEntities:true}).parse(xml);
 const entries=doc.rss?.channel?.item||doc.feed?.entry||[];
 return [entries].flat().map(i=>{
  const url=typeof i.link==='string'?i.link:[i.link].flat().find(l=>!l?.['@_rel']||l['@_rel']==='alternate')?.['@_href'];
  const date=Date.parse(i.pubDate||i.published||i.updated||i['dc:date']);
  return {title:text(i.title),source:source.name,url,summary:text(i.description||i.summary||i['content:encoded']).slice(0,600),publishedAt:Number.isFinite(date)?new Date(date).toISOString():null,tag:'News',_example:false};
 }).filter(i=>i.title&&/^https:\/\//.test(i.url)&&i.publishedAt&&Date.parse(i.publishedAt)<=now&&now-Date.parse(i.publishedAt)<7*86400000)
 .filter(i=>!/(nintendo|switch|mobile|ios|android)/i.test(i.title+' '+i.summary)||/(\bpc\b|windows|xbox|playstation|steam)/i.test(i.title+' '+i.summary));
}
export async function refresh(sources,previous,{fetcher=fetch,now=Date.now()}={}) {
 const results=await Promise.all(sources.map(async source=>{
  try {const response=await fetcher(source.url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'GameTrackDaily RSS reader'}});if(!response.ok)throw Error(`HTTP ${response.status}`);if(!response.url?.startsWith('https://')&&response.url)throw Error('Unsafe redirect');const items=parseFeed(await response.text(),source,now);if(!items.length)throw Error('No recent dated gaming items');return {source,items};}
  catch(e){return {source,error:String(e.message).replace(/https?:\/\/\S+/g,'[url]').slice(0,160)};}
 }));
 const failures=results.filter(r=>r.error).map(r=>({id:r.source.id,error:r.error}));
 if(results.every(r=>r.error))return {data:null,failures};
 const feeds=['gaming','review','preview','dev'].map(id=>{
  const old=previous.feeds.find(f=>f.id===id)||{id,title:id,items:[]};
  const successful=results.filter(r=>!r.error&&r.source.rail===id);
  if(!successful.length)return old;
  const items=[...new Map(successful.flatMap(r=>r.items).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).map(i=>[i.url,i])).values()].slice(0,30);
  return {...old,items,generatedAt:new Date(Math.max(...items.map(i=>Date.parse(i.publishedAt)))).toISOString()};
 });
 const generated=new Date(Math.max(...feeds.flatMap(f=>f.items).map(i=>Date.parse(i.publishedAt)))).toISOString();
 return {data:{...previous,generated,feeds,failedSources:failures},failures};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const previous=JSON.parse(fs.readFileSync('data/games-news.json','utf8'));
 const result=await refresh(JSON.parse(fs.readFileSync('data/news-sources.json','utf8')),previous);
 fs.mkdirSync('.local',{recursive:true});fs.writeFileSync('.local/news-refresh-report.json',JSON.stringify({checkedAt:new Date().toISOString(),failures:result.failures,allFailed:!result.data},null,2));
 if(result.data)fs.writeFileSync('data/games-news.json',JSON.stringify(result.data,null,2)+'\n');
 console.log(`Games sources: ${result.failures.length} failed; ${result.data?'successful sources written':'previous feed retained'}`);
 for(const f of result.failures)console.log(`Source ${f.id}: ${f.error}`);
 if(!result.data)process.exitCode=1;
}
