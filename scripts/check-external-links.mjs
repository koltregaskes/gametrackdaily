import {classifyExternalResponse} from './external-link-policy.mjs';
import fs from 'node:fs';
const urls=JSON.parse(fs.readFileSync('.local/external-links.json','utf8'));
let broken=0,unknown=0;const queue=[...new Set(urls.map(u=>{const x=new URL(u);x.hash='';return x.href}))];
async function inspect(url){
 try{
  let response=await fetch(url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(15000)});
  if(!response.ok)response=await fetch(url,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(15000)});
  await response.body?.cancel();
  const classification=classifyExternalResponse(response.status,url,response.url);
  if(classification==='unverified'){unknown++;console.log(`UNVERIFIED HTTP ${response.status} or redirect ${url}`);return;}
  if([404,410].includes(response.status)){broken++;console.log(`BROKEN ${response.status} ${url}`);}
  else if(!response.ok){unknown++;console.log(`UNVERIFIED HTTP ${response.status} ${url}`);}
 }catch{unknown++;console.log(`UNVERIFIED network ${url}`);}
}
await Promise.all(Array.from({length:12},async()=>{while(queue.length)await inspect(queue.shift())}));
console.log(`External links: ${urls.length} checked; ${broken} broken (404/410); ${unknown} unverified (access or network).`);
if(broken)process.exitCode=1;
