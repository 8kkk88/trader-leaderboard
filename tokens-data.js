import {validateTrades} from './trade-data.js?v=1';
export const SORTS={wallets:'交易錢包最多',amount:'買賣金額最高',buys:'買入金額最高',sells:'賣出金額最高',recent:'最近交易'};
export const PAGE_SIZE=20;
export const active=t=>['buy_count','sell_count','buy_usd','sell_usd'].some(k=>t[k]!==null&&t[k]>0);
// Keep missing values separate. A known subtotal never silently becomes a complete total.
export function total(values){
  let sum=0,correction=0,known=0;
  for(const value of values){if(value===null)continue;const y=value-correction,next=sum+y;correction=(next-sum)-y;sum=next;known++;}
  const safe=Number.isFinite(sum)&&Math.abs(sum)<=Number.MAX_SAFE_INTEGER;
  return {value:known&&safe?sum:null,missing:values.length-known,known,overflow:!safe};
}
export function buildTokenIndex(snapshot,now=Date.now()){
  validateTrades(snapshot,now);
  const groups=new Map();let omitted=0;
  for(const w of snapshot.wallets)for(const t of w.tokens){
    if(!active(t)){omitted++;continue;}
    // Mint is case sensitive on Solana. Symbols are labels, never identities.
    if(!groups.has(t.address))groups.set(t.address,{address:t.address,symbols:[],wallets:[]});
    const group=groups.get(t.address),symbol=t.symbol?.trim();
    if(symbol&&!group.symbols.includes(symbol))group.symbols.push(symbol);
    group.wallets.push({...t,wallet_address:w.address,snapshot_date:w.snapshot_date,sample_volume_rank:w.sample_volume_rank,coverage:w.coverage});
  }
  const tokens=[...groups.values()].map(t=>{
    const aggregate=Object.fromEntries(['buy_usd','sell_usd','buy_count','sell_count','realized_usd','unrealized_usd'].map(k=>[k,total(t.wallets.map(w=>w[k]))]));
    aggregate.amount=total(t.wallets.flatMap(w=>[w.buy_usd,w.sell_usd]));
    aggregate.trades=total(t.wallets.flatMap(w=>[w.buy_count,w.sell_count]));
    return {...t,symbol:t.symbols[0]||'未提供名稱',wallet_count:t.wallets.length,aggregate,
      last_trade:Math.max(0,...t.wallets.map(w=>w.last_trade_unix_time||0))||null};
  });
  return {tokens,omitted,walletCount:new Set(tokens.flatMap(t=>t.wallets.map(w=>w.wallet_address))).size};
}
export function parseState(search){
  const p=new URLSearchParams(search),raw=p.get('token');
  return {q:(p.get('q')||'').slice(0,200),sort:Object.hasOwn(SORTS,p.get('sort'))?p.get('sort'):'wallets',shared:p.get('shared')==='1',page:Math.min(10000,Math.max(1,Number.parseInt(p.get('page'),10)||1)),token:raw===null?null:/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)?raw:'invalid'};
}
export function stateURL(state){
  const p=new URLSearchParams();if(state.q)p.set('q',state.q);if(state.sort!=='wallets')p.set('sort',state.sort);if(state.shared)p.set('shared','1');if(state.page>1)p.set('page',state.page);if(state.token)p.set('token',state.token);
  return './tokens.html'+(p.size?'?'+p.toString():'');
}
export function selectTokens(tokens,state){
  const q=state.q.trim().toLowerCase(),key={amount:'amount',buys:'buy_usd',sells:'sell_usd'}[state.sort];
  const value=t=>key?t.aggregate[key].value:state.sort==='recent'?t.last_trade:t.wallet_count;
  const rows=tokens.filter(t=>(!state.shared||t.wallet_count>1)&&(!q||t.address.toLowerCase().includes(q)||t.symbols.some(s=>s.toLowerCase().includes(q))));
  rows.sort((a,b)=>{const x=value(a),y=value(b);return (x===null?(y===null?0:1):y===null?-1:y-x)||b.wallet_count-a.wallet_count||a.address.localeCompare(b.address);});
  const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)),page=Math.min(state.page,pages);
  return {total:rows.length,pages,page,rows:rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)};
}
