// Read-only preflight. No network calls, JSON writes or workflow changes.
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const baseIndex=process.argv.indexOf('--base');
const base=baseIndex<0?'HEAD':process.argv[baseIndex+1];
if(!base||base.startsWith('-'))throw new Error('Supply a Git commit after --base');
const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git('rev-parse','--verify',base+'^{commit}');
const changed=git('diff','--name-only',base,'--','*.js','*.css').split(/\r?\n/).filter(Boolean);
const pages=readdirSync(cwd).filter(name=>name.endsWith('.html'));
const issues=[];
for(const page of pages){
  let old;try{old=git('show',base+':'+page);}catch{continue;}
  const current=readFileSync(new URL('../'+page,import.meta.url),'utf8');
  for(const asset of changed){
    if(asset.includes('/'))continue;
    const refs=text=>[...text.matchAll(/(?:src|href)="\.\/([^"?#]+)(\?[^"#]*)?"/g)].filter(m=>m[1]===asset).map(m=>m[0]);
    if(refs(current).some(ref=>refs(old).includes(ref)))issues.push(`${page}: ${asset} changed without a new asset version`);
  }
}
if(issues.length){console.error(issues.join('\n'));process.exit(1);}
for(const file of ['app.js','product.js','research.js','shell.js'])execFileSync(process.execPath,['--check',file],{cwd,stdio:'inherit'});
const tests=readdirSync(cwd).filter(name=>name.endsWith('.test.mjs'));
const result=spawnSync(process.execPath,['--test','--test-isolation=none',...tests],{cwd,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
console.log(`UI preflight passed: syntax, ${tests.length} test files and asset versions vs ${base}.`);
