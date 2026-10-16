import test from 'node:test';
import assert from 'node:assert/strict';
import './money-format.js';
import {validateHoldings,holdingsMarkup} from './holdings.js';
const date='2026-10-19T01:00:00Z',now=Date.parse(date);
const sample=()=>({updated_at:date,wallets:[...'ABCDEFGHJK'].map(c=>({address:c.repeat(32),snapshot_date:date,tokens:[{symbol:'TOKEN',value_usd:4,pct:40}]}))});
test('honest proportions, escaped symbols, dates and absence are preserved',()=>{
  const data=sample();data.wallets[0].tokens[0].symbol='<img src=x onerror=alert(1)>';
  validateHoldings(data,now);
  const html=holdingsMarkup(data,'A'.repeat(32),now);
  assert.match(html,/width:40%/);assert.match(html,/40%/);assert.match(html,/2026\/10\/19/);assert.match(html,/&lt;img/);assert.ok(!html.includes('<img'));
  assert.match(holdingsMarkup(data,'Z'.repeat(32),now),/未收錄/);
});
test('empty, unknown and old snapshots remain distinct',()=>{
  const data=sample();data.wallets[0].tokens=[];data.wallets[1].tokens[0]={symbol:'ZERO',value_usd:0,pct:null};
  validateHoldings(data,now);assert.match(holdingsMarkup(data,'A'.repeat(32),now),/沒有符合範圍/);
  assert.match(holdingsMarkup(data,'B'.repeat(32),now),/佔比未知/);
  assert.match(holdingsMarkup(data,'C'.repeat(32),now+8*86400000),/超過七天/);
});
test('partial batches, duplicate wallets, malformed dates and misleading percentages fail closed',()=>{
  for(const edit of [d=>d.wallets.pop(),d=>d.wallets[0].address=d.wallets[1].address,d=>d.wallets[0].tokens[0].pct=-1,d=>d.wallets[0].tokens[0].value_usd=null,d=>d.wallets[0].snapshot_date='yesterday',d=>d.updated_at='2026-10-20T01:00:00Z']){const data=sample();edit(data);assert.throws(()=>validateHoldings(data,now));}
});
test('upstream total discrepancy is disclosed without rewriting the ratio',()=>{
  const data=sample();data.wallets[0].tokens[0].pct=100.004877;
  validateHoldings(data,now);const html=holdingsMarkup(data,'A'.repeat(32),now);
  assert.match(html,/100\.004877%/);assert.match(html,/width:100%/);assert.match(html,/高於來源總值/);
});
