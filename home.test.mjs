import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rankToday,signedMoney,readModules,readFollow,snapshotFiles,readArchive,compareSnapshots,followChange,dayKey} from './home-data.js';
const current=JSON.parse(fs.readFileSync(new URL('./data.json',import.meta.url)));
const a='A'.repeat(32),b='B'.repeat(32),c='C'.repeat(32),d='D'.repeat(32);
const row=(address,realized,pnl=realized)=>({address,realized,pnl,trades:1});
const snapshot=(stamp,today,full=true)=>({stamp,data:{today},full});
test('hero ranks by realized, not source order; tie-breaks match the full board and input stays unchanged',()=>{
 const rows=[row(a,null,99),row(b,10,8),row(c,10,9),row(d,0,100)],copy=JSON.stringify(rows);
 assert.deepEqual(rankToday(rows).map(w=>w.address),[c,b,d,a]);assert.equal(JSON.stringify(rows),copy);
 assert.equal(rankToday(current.today)[0].realized,Math.max(...current.today.map(w=>w.realized)));
 assert.equal(signedMoney(null),'—');assert.equal(signedMoney(-12.5),'−$12.50');assert.equal(signedMoney(0),'$0.00');assert.equal(signedMoney(.00001),'+$0.00001');
});
test('only common addresses can move up; newcomer count is set difference, never rank movement',()=>{
 const prior=snapshot('2026-10-15T00:00:00Z',[row(a,30),row(b,20),row(c,10)]),latest=snapshot('2026-10-16T00:00:00Z',[row(c,40),row(a,20),row(d,10)]),pair=compareSnapshots(latest,prior);
 assert.equal(pair.biggest.row.address,c);assert.equal(pair.biggest.gain,2);assert.deepEqual(pair.newcomers.map(w=>w.address),[d]);
 assert.deepEqual(followChange(a,pair).delta,-10);assert.equal(followChange(d,pair).status,'new');assert.equal(followChange(b,pair).status,'absent');assert.equal(followChange(c,pair).delta,30);
});

test('USD precision preserves cents, missing values and tiny nonzero values across homepage and boards',()=>{
 const format=globalThis.ResearchMoney.format;
 for(const [value,expected] of [[40678.29,'$40,678.29'],[12.5,'$12.50'],[0,'$0.00'],[-0,'$0.00'],[-12.5,'−$12.50'],[null,'—'],[NaN,'—'],[Infinity,'—'],[.00001,'$0.00001']]) assert.equal(format(value),expected);
 assert.equal(signedMoney(40678.29),'+$40,678.29');
 assert.equal(signedMoney(12.5),'+$12.50');
 assert.notEqual(format(0.00000001),'$0.00');
});
test('insufficient, partial, same-time or missing-metric snapshots never manufacture numeric comparisons',()=>{
 const prior=snapshot('2026-10-15T00:00:00Z',[row(a,10)]);
 assert.equal(compareSnapshots(prior,null),null);assert.equal(compareSnapshots(prior,prior),null);
 assert.equal(compareSnapshots(snapshot('2026-10-16T00:00:00Z',[row(a,20)],false),prior),null);
 assert.equal(compareSnapshots(snapshot('2026-10-16T00:00:00Z',[row(a,null)]),prior),null);
 assert.equal(followChange(a,null).status,'pending');
 const unchanged=compareSnapshots(snapshot('2026-10-16T00:00:00Z',[row(a,10)]),prior);assert.equal(unchanged.biggest,null);assert.equal(unchanged.newcomers.length,0);assert.equal(followChange(a,unchanged).delta,0);
});
test('snapshot index rejects traversal/remote paths and future dates; same-time revisions count once',()=>{
 const names=['2026-10-15T00-00-00Z--aaaaaaaaaaaa.json','/snapshots/2026-10-16T00-00-00Z--bbbbbbbbbbbb.json','snapshots/2026-10-16T00-00-00Z--cccccccccccc.json','snapshots/2026-10-17T00-00-00Z--dddddddddddd.json','../data.json','https://evil.test/a.json'];
 const files=snapshotFiles(names,Date.parse('2026-10-16T12:00:00Z'));assert.equal(files.length,2);assert.equal(files[0].stamp,'2026-10-16T00:00:00Z');assert.equal(dayKey('2026-10-15T20:00:00Z'),'2026-10-16');
});
test('published archives validate and actual latest comparisons agree with independent set/rank arithmetic',()=>{
 const names=fs.readdirSync(new URL('./snapshots/',import.meta.url));const entries=snapshotFiles(names,Date.parse(current.updated_at));
 const archives=entries.map(entry=>readArchive(JSON.parse(fs.readFileSync(new URL('./'+entry.path,import.meta.url))),entry));
 const full=archives.filter(a=>a.full),pair=compareSnapshots(full[0],full[1]);assert.ok(pair);
 const old=new Set(full[1].data.today.map(w=>w.address));assert.equal(pair.newcomers.length,full[0].data.today.filter(w=>!old.has(w.address)).length);
 const oldRank=new Map(rankToday(full[1].data.today).map((w,i)=>[w.address,i]));const maxGain=Math.max(...rankToday(full[0].data.today).filter(w=>oldRank.has(w.address)).map(w=>oldRank.get(w.address)-rankToday(full[0].data.today).indexOf(w)));
 assert.equal(pair.biggest?.gain??0,Math.max(0,maxGain));
 const invalid=JSON.parse(fs.readFileSync(new URL('./'+entries[0].path,import.meta.url)));invalid.data.today[0].realized='123';assert.throws(()=>readArchive(invalid,entries[0]));
});
test('local preferences handle corrupt/old storage and sanitize addresses without touching valid choices',()=>{
 assert.deepEqual(readModules('broken'),{board:true,trend:true,wallet:false,rebate:false});assert.deepEqual(readModules('{"board":false,"wallet":true,"trend":"false"}'),{board:false,trend:true,wallet:true,rebate:false});
 assert.deepEqual(readFollow(JSON.stringify([a,a,b,'<script>','0x123',null])),[a,b]);assert.deepEqual(readFollow('{}'),[]);assert.deepEqual(readFollow('broken'),[]);
});
