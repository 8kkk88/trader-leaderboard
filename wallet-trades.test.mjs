import test from 'node:test';
import assert from 'node:assert/strict';
import './money-format.js';
import {validateTrades,tradesMarkup} from './wallet-trades.js';
const date='2026-10-17T01:00:00Z',now=Date.parse(date);
const token=()=>({address:'Z'.repeat(32),symbol:'TOKEN',last_trade_unix_time:null,buy_count:1,sell_count:0,buy_usd:25,sell_usd:0,realized_usd:-3,unrealized_usd:null});
const sample=()=>({schema_version:1,source:'Birdeye',chain:'solana',selection:'week_sample_volume_top10',updated_at:date,source_updated_at:date,parameters:{duration:'7d',pnl_method:'wac',position_scope:'duration_only',limit:100,offset:0,sort_by:'last_trade',sort_type:'desc'},wallets:[...'ABCDEFGHJK'].map((a,i)=>({address:a.repeat(32),snapshot_date:date,sample_volume_rank:i+1,sample_volume_usd:100-i,reported_unique_tokens:1,coverage:'source_page',tokens:[token()]}))});
test('token identity, negative PnL, zeros, unknowns and escaped symbols',()=>{
  const data=sample();data.wallets[0].tokens[0].symbol='<img onerror=alert(1)>';
  validateTrades(data,now);const html=tradesMarkup(data,'A'.repeat(32),now);
  assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.match(html,/未提供/);assert.match(html,/negative/);assert.match(html,/\$0\.00/);assert.match(html,/solscan.io\/token\/ZZZZ/);assert.match(html,/WAC/);
});
test('absence, emptiness, old data and source discrepancy are explicit',()=>{
  const data=sample();assert.match(tradesMarkup(data,'Y'.repeat(32),now),/未收錄不代表沒有交易/);
  data.wallets[0].tokens=[];data.wallets[0].reported_unique_tokens=0;validateTrades(data,now);assert.match(tradesMarkup(data,'A'.repeat(32),now),/沒有回傳幣種/);
  assert.match(tradesMarkup(data,'B'.repeat(32),now+2*86400000),/保留上一份/);
  data.wallets[1].reported_unique_tokens=0;data.wallets[1].coverage='count_mismatch';validateTrades(data,now);assert.match(tradesMarkup(data,'B'.repeat(32),now),/統計口徑有差異/);
});
test('partial coverage and progressive disclosure do not claim complete tokens',()=>{
  const data=sample();data.wallets[0].tokens=[...'LMNPQR'].map(c=>({...token(),address:c.repeat(32)}));data.wallets[0].reported_unique_tokens=169;data.wallets[0].coverage='limited';
  validateTrades(data,now);const html=tradesMarkup(data,'A'.repeat(32),now);assert.match(html,/部分幣種摘要/);assert.match(html,/查看其餘 1 個幣種/);assert.match(html,/未列出不代表沒有交易/);
});
test('wrong scope, duplicate identity, invalid numbers and missing coverage fail closed',()=>{
  for(const edit of [d=>d.wallets.pop(),d=>d.parameters.duration='24h',d=>d.wallets[0].address=d.wallets[1].address,d=>d.wallets[0].tokens[0].buy_usd=-1,d=>d.wallets[0].tokens[0].sell_count=1.2,d=>d.wallets[0].tokens[0].realized_usd=Infinity,d=>d.wallets[0].reported_unique_tokens=100,d=>d.wallets[0].tokens.push(token()),d=>d.wallets[0].snapshot_date='yesterday']){const data=sample();edit(data);assert.throws(()=>validateTrades(data,now));}
});
