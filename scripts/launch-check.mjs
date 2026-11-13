import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const root=path.resolve(process.env.BUILD_DIR||'dist'), base='https://koltregaskes.github.io/gametrackdaily/';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const routes=fs.readdirSync(root).filter(p=>p.endsWith('.html')&&p!=='404.html').sort();
const sitemap=read('sitemap.xml');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml'};
const browser=await chromium.launch(process.env.PW_CHANNEL?{channel:process.env.PW_CHANNEL}:{});
const external=new Set();
try {
 for(const route of routes.filter(r=>!process.env.ROUTES||process.env.ROUTES.split(',').includes(r))) {
  const html=read(route), url=new URL(route==='index.html'?'':route,base).href;
  const canonical=new URL(route==='calendar.html'?'releases.html':route==='index.html'?'':route,base).href;
  assert.equal([...html.matchAll(/rel="canonical"/g)].length,1,`${route}: unique canonical`);
  assert.ok(html.includes(`rel="canonical" href="${canonical}"`),`${route}: canonical`);
  assert.ok(html.includes(`property="og:url" content="${canonical}"`),`${route}: OG URL`);
  assert.equal(sitemap.includes(`<loc>${url}</loc>`),route!=='calendar.html',`${route}: sitemap coverage`);
  assert.ok(html.includes('type="application/rss+xml"'),`${route}: RSS discovery`);
  assert.ok(html.includes(`${base}assets/social/gametrackdaily-og.png`),`${route}: social image`);
  const graphs=[...html.matchAll(/type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
  assert.ok(graphs.length,`${route}: JSON-LD`);
  assert.ok(graphs.some(g=>JSON.stringify(g).includes(JSON.stringify(canonical))),`${route}: JSON-LD canonical`);
  for(const width of [320,1280]) {
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.route('**/*',async request=>{
    const u=new URL(request.request().url());
    if(!u.href.startsWith(base))return request.abort();
    const rel=decodeURIComponent(u.pathname.slice(new URL(base).pathname.length))||'index.html';
    const file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return request.fulfill({status:404,body:'Missing public asset'});
    await request.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.waitForSelector('main');
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
   assert.deepEqual(errors,[],`${route}: runtime errors`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} ${width}: horizontal overflow`);
   const result=await new AxeBuilder({page}).analyze();
   assert.deepEqual(result.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${route} ${width}: axe`);
   for(const href of await page.locator('a[href],link[href],script[src],img[src]').evaluateAll(nodes=>nodes.map(n=>n.href||n.src))) {
    const link=new URL(href,url);
    if(link.href.startsWith(base)) {
     const rel=decodeURIComponent(link.pathname.slice(new URL(base).pathname.length))||'index.html';
     assert.ok(fs.existsSync(path.join(root,rel)),`${route}: broken internal ${link.pathname}`);
     if(link.hash&&link.pathname===new URL(url).pathname)assert.ok(await page.locator(`[id="${decodeURIComponent(link.hash.slice(1))}"]`).count(),`${route}: missing fragment ${link.hash}`);
    } else if(/^https?:$/.test(link.protocol))external.add(link.href);
   }
   console.log(`PASS ${route} ${width}px: axe, overflow, runtime, internal links`);
   await context.close();
  }
 }
 const png=fs.readFileSync(path.join(root,'assets/social/gametrackdaily-og.png'));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
 assert.ok(read('rss.xml').includes('<pubDate>'));assert.ok(read('robots.txt').includes(`${base}sitemap.xml`));assert.ok(read('llms.txt').includes('GameTrackDaily'));
 fs.mkdirSync('.local',{recursive:true});fs.writeFileSync('.local/external-links.json',JSON.stringify([...external].sort(),null,2));
 console.log(`PASS SEO contract: ${routes.length-1} indexable routes, real PNG, RSS, robots and llms`);
} finally {await browser.close();}
