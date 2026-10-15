import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateReferral,renderRow,matchesExchange} from './referral.js';
const data=JSON.parse(await readFile(new URL('./referral.json',import.meta.url),'utf8'));
const catalog=JSON.parse(await readFile(new URL('./referral-sources.json',import.meta.url),'utf8'));
const brief=await readFile(new URL('./CODEX_REFERRAL_BRIEF.md',import.meta.url),'utf8');

test('Every published value is exactly the approved brief value',()=>{
  validateReferral(data);
  const rows=brief.split('\n').filter(line=>data.exchanges.some(item=>line.startsWith('| '+item.name+' |'))).map(line=>line.trim().slice(1,-1).split('|').map(value=>value.trim()));
  assert.equal(rows.length,9);
  assert.deepEqual(data.exchanges.map(item=>['name','spot','futures','tiers','notes'].map(key=>item[key])),rows);
  assert.equal(data.baseline_date,catalog.baseline_date);
});
test('Only supplied CEX source URLs are attached; MAX stays unverified',()=>{
  const urls=new Set(catalog.sources.filter(source=>source.id!=='okx-dex-referral').map(source=>source.url));
  for(const row of data.exchanges) for(const url of row.sources) assert.ok(urls.has(url));
  const max=data.exchanges.find(item=>item.id==='max');
  assert.equal(max.verified,false);assert.deepEqual(max.sources,[]);
  for(const key of ['spot','futures','tiers']) assert.equal(max[key],'待查證');
  assert.match(renderRow(max),/referral-pending/);
});
test('Each comparison cell preserves its source links and input strings are escaped',()=>{
  const row={...data.exchanges[0],name:'<script>alert(1)</script>',notes:'<img src=x onerror=alert(1)>待查證'};
  const html=renderRow(row);
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));
  assert.equal((html.match(/class="referral-source-links"/g)||[]).length,4);
});
test('Invalid sources, duplicate identities and missing data fail before rendering',()=>{
  for(const mutate of [d=>d.exchanges[0].sources=['javascript:alert(1)'],d=>d.exchanges[0].sources=[],d=>d.exchanges.push(d.exchanges[0]),d=>delete d.exchanges[0].notes]){
    const copy=structuredClone(data);mutate(copy);assert.throws(()=>validateReferral(copy));
  }
});
test('Search is case insensitive and finds the approved Chinese name',()=>{
  assert.ok(matchesExchange(data.exchanges[0],' BINANCE '));assert.ok(matchesExchange(data.exchanges[0],'幣安'));
  assert.ok(!matchesExchange(data.exchanges[0],'不存在'));
});
