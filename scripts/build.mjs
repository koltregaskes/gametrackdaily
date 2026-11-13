import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), out=path.join(root,'dist');
if(fs.existsSync(out)) throw Error('Build requires an absent dist directory; use a fresh checkout');
fs.mkdirSync(out);
const files=fs.readdirSync(root).filter(p=>/\.(html|css|js|svg|png|xml|txt|webmanifest)$/.test(p));
for(const p of [...files,'assets','data','shared']) {
 if(fs.existsSync(p))fs.cpSync(p,path.join(out,p),{recursive:true,filter:s=>!path.basename(s).startsWith('.')});
}
console.log(`Built ${files.length} root public assets; private tooling excluded.`);
