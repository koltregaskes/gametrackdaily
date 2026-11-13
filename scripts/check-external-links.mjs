import {safeLinkFetch,UnsafeLink} from './safe-link-fetch.mjs';
import fs from 'node:fs';
const urls=JSON.parse(fs.readFileSync('.local/external-links.json','utf8'));
let broken=0,unknown=0;const queue=[...new Set(urls.map(u=>{const x=new URL(u);x.hash='';return x.href}))];
async function inspect(url){
 try{
  let response=await safeLinkFetch(url,{method:'HEAD'});
  if(!response.ok)response=await safeLinkFetch(url,{method:'GET'});
  if(new URL(response.url).protocol!=='https:'){broken++;console.log(`UNSAFE ${url}`);return;}
  if([404,410].includes(response.status)){broken++;console.log(`BROKEN ${response.status} ${url}`);}
  else if(!response.ok){unknown++;console.log(`UNVERIFIED HTTP ${response.status} ${url}`);}
 }catch(error){if(error instanceof UnsafeLink){broken++;console.log(`UNSAFE ${url}`);return;}unknown++;console.log(`UNVERIFIED network ${url}`);}
}
await Promise.all(Array.from({length:12},async()=>{while(queue.length)await inspect(queue.shift())}));
console.log(`External links: ${urls.length} checked; ${broken} broken/unsafe; ${unknown} unverified (access or network).`);
if(broken)process.exitCode=1;
