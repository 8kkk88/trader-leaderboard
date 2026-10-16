import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateReferral,validateReferralLinks,renderBaseline,renderRow,renderCard,renderSources,matchesExchange} from './referral.js';
const data=JSON.parse(await readFile(new URL('./referral.json',import.meta.url),'utf8'));
const catalog=JSON.parse(await readFile(new URL('./referral-sources.json',import.meta.url),'utf8'));
const brief=await readFile(new URL('./CODEX_REFERRAL_BRIEF.md',import.meta.url),'utf8');
const invitations=JSON.parse(await readFile(new URL('./referral-links.json',import.meta.url),'utf8'));

test('Original nine exchanges retain every approved brief value',()=>{
  validateReferral(data);
  const rows=brief.split('\n').filter(line=>data.exchanges.some(item=>line.startsWith('| '+item.name+' |'))).map(line=>line.trim().slice(1,-1).split('|').map(value=>value.trim()));
  assert.equal(rows.length,9);
  assert.deepEqual(data.exchanges.filter(item=>!['backpack','hoyabit'].includes(item.id)).map(item=>['name','spot','futures','tiers','notes'].map(key=>item[key])),rows);
  assert.equal(data.baseline_date,catalog.baseline_date);
});
test('Approved additions retain rates, exclusions, pending status and separate dates',()=>{
  assert.equal(data.exchanges.length,11);
  const backpack=data.exchanges.find(item=>item.id==='backpack');
  assert.equal(backpack.spot,'10%');assert.equal(backpack.futures,'10%');assert.equal(backpack.verified,true);
  assert.equal(backpack.tiers,'有（標準 10%；高交易量／大追隨者可申請 Affiliate 拿更高，需官方審核）');
  assert.equal(backpack.notes,'官網明示 standard 10% rebate；Equity Perps 手續費不計入返佣；需 KYC');
  const hoya=data.exchanges.find(item=>item.id==='hoyabit');
  for(const field of ['spot','futures','tiers']) assert.equal(hoya[field],'待查證');
  assert.equal(hoya.verified,false);
  assert.equal(hoya.notes,'官網未公布常設比例返佣；推薦獎勵為限時活動制（如全家 Fa 點、比特幣抽獎），非按比例抽成');
  for(const row of [backpack,hoya]) assert.equal(row.baseline_date,'2026-10-16');
  assert.equal(data.baseline_date,'2026-10-15');
  assert.match(renderBaseline(data),/2026-10-15.*2026-10-16/);
  assert.match(renderCard(hoya,{},data.baseline_date),/datetime="2026-10-16"/);
  assert.match(renderRow(data.exchanges[0],{},data.baseline_date),/datetime="2026-10-15"/);
});
test('Invitation mapping is exact, disclosed, independent of verification and absent for Gate',()=>{
  const links=validateReferralLinks(invitations);
  assert.equal(Object.keys(links).length,10);
  for(const item of data.exchanges) for(const render of [renderCard,renderRow]) {
    const html=render(item,links,data.baseline_date);
    assert.equal((html.match(/class="button referral-invite-button"/g)||[]).length,item.id==='gateio'?0:1);
    if(item.id==='gateio') continue;
    assert.ok(html.includes(`href="${invitations.links[item.id]}"`));
    assert.match(html,/target="_blank" rel="noopener noreferrer sponsored"/);
    assert.ok(html.includes('透過此連結註冊，你我都可能獲得返佣回饋'));
    if(item.id==='hoyabit') assert.match(html,/資料待查證|referral-pending/);
  }
});
test('Missing or unsafe invitation links cannot become actionable URLs',()=>{
  const item=data.exchanges[0];
  for(const url of ['javascript:alert(1)','data:text/html,test','http://example.com','https://user:pass@example.com','not a url',null]) {
    assert.deepEqual(validateReferralLinks({links:{binance:url}}),{});
    assert.ok(!renderCard(item,{binance:url}).includes('referral-invite-button'));
  }
  for(const invalid of [null,{}, {links:[]}, {links:'https://example.com'}]) assert.throws(()=>validateReferralLinks(invalid));
  assert.ok(!renderRow(item).includes('referral-invite-button'));
  const safe='https://example.com/?ref=%22test%22&x=1';
  assert.ok(renderRow(item,{binance:safe}).includes('&amp;x=1'));
});
test('Only supplied CEX source URLs are attached; MAX stays unverified',()=>{
  const urls=new Set(catalog.sources.filter(source=>source.id!=='okx-dex-referral').map(source=>source.url));
  for(const row of data.exchanges) for(const url of row.sources) assert.ok(urls.has(url));
  const max=data.exchanges.find(item=>item.id==='max');
  assert.equal(max.verified,false);assert.deepEqual(max.sources,[]);
  for(const key of ['spot','futures','tiers']) assert.equal(max[key],'待查證');
  assert.match(renderRow(max),/referral-pending/);
});
test('Rows, cards and source titles escape untrusted content without losing attribution',()=>{
  const row={...data.exchanges[0],name:'<script>alert(1)</script>',notes:'<img src=x onerror=alert(1)>待查證'};
  for(const html of [renderRow(row),renderCard(row)]) {
    assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));
    assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html,/data-source="binance"/);
  }
  const unsafeCatalog={sources:[{url:row.sources[0],label:'<script>source</script>'}]};
  assert.ok(!renderSources(row,unsafeCatalog).includes('<script>'));
});
test('Source documents use catalog titles and preserve exactly each exchange source URL',()=>{
  for(const row of data.exchanges) {
    const html=renderSources(row,catalog);
    assert.equal((html.match(/<a href=/g)||[]).length,row.sources.length);
    for(const url of row.sources) {
      assert.ok(html.includes(`href="${url}"`));
      assert.ok(html.includes(catalog.sources.find(source=>source.url===url).label));
    }
    assert.ok(!html.includes('官網 1'));assert.ok(!html.includes('官網 2'));
  }
  const max=data.exchanges.find(item=>item.id==='max');
  assert.match(renderSources(max,catalog),/待查證/);
  assert.ok(renderSources(data.exchanges[0],null).includes(data.exchanges[0].sources[0]));
});
test('Table and card views preserve all approved field strings including rate conditions',()=>{
  const text=html=>html.replace(/<[^>]*>/g,'').replaceAll('&amp;','&');
  for(const row of data.exchanges) for(const render of [renderRow,renderCard]) {
    const content=text(render(row));
    for(const key of ['name','spot','futures','tiers','notes']) assert.ok(content.includes(row[key]),`${row.id}: ${key}`);
  }
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
