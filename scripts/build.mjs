import fs from 'node:fs';
import path from 'node:path';
import {checkPublishAllowlist} from './check-publish-allowlist.mjs';
const outputFlag=process.argv.indexOf('--output');
const root=process.cwd(), out=path.resolve(outputFlag>=0?process.argv[outputFlag+1]:process.env.BUILD_DIR||'dist');
if(fs.existsSync(out)) throw Error('Build requires an absent dist directory; use a fresh checkout');
fs.mkdirSync(out);
const {files}=JSON.parse(fs.readFileSync('launch/publish-allowlist.json','utf8'));
if(!Array.isArray(files)||!files.length||new Set(files).size!==files.length)throw Error('Invalid publish allowlist');
for(const p of files) {
 if(typeof p!=='string'||p.includes('\\')||p.split('/').some(s=>!s||s==='..'||s.startsWith('.')))throw Error(`Unsafe public path: ${p}`);
 const source=path.resolve(root,p);
 if(!source.startsWith(root+path.sep)||!fs.lstatSync(source).isFile())throw Error(`Expected a regular public file: ${p}`);
 fs.mkdirSync(path.dirname(path.join(out,p)),{recursive:true});
 fs.copyFileSync(source,path.join(out,p));
}
await checkPublishAllowlist(out);
console.log(`Built ${files.length} explicitly allowlisted public files; historical data retained in the repository only.`);
