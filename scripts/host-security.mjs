import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
export function checkDocument(html){
 const csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1]||'';
 for(const directive of ["default-src 'self'","script-src 'self'","object-src 'none'","base-uri 'self'","form-action 'none'","upgrade-insecure-requests"])assert.ok(csp.split(';').some(p=>p.trim()===directive),'Missing CSP directive '+directive);
 assert.match(html,/<meta name="referrer" content="strict-origin-when-cross-origin">/i,'Missing referrer policy');
}
export function checkResponse(headers){
 assert.ok(/max-age=[1-9]\d*/i.test(headers.get('strict-transport-security')||''),'Host HSTS missing');
 const unavailable=['content-security-policy','x-frame-options','x-content-type-options','referrer-policy'].filter(h=>!headers.has(h));
 return {hsts:true,unavailable};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const root=path.resolve(process.env.BUILD_DIR||'dist');let count=0;
 for(const file of fs.readdirSync(root).filter(p=>p.endsWith('.html')&&p!=='404.html')){checkDocument(fs.readFileSync(path.join(root,file),'utf8'));count++;}
 assert.ok(count>0,'No built pages');console.log('PASS browser CSP/referrer policies: '+count+' built routes. Meta policies do not supply framing or MIME response headers.');
 if(process.argv.includes('--live')){const r=await fetch('https://koltregaskes.github.io/gametrackdaily/',{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);console.log(JSON.stringify(checkResponse(r.headers)));}
}
