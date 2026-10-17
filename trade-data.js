const addressPattern=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const numeric=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER;
const date=s=>typeof s==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
export function validateTrades(input,now=Date.now()){
  if(!input||input.schema_version!==1||input.source!=='Birdeye'||input.chain!=='solana'||input.selection!=='week_sample_volume_top10'||!date(input.updated_at)||!date(input.source_updated_at)||Date.parse(input.updated_at)>now+60000||Date.parse(input.source_updated_at)>Date.parse(input.updated_at)||!Array.isArray(input.wallets)||input.wallets.length!==10)throw new Error('Invalid trading snapshot');
  const p=input.parameters;
  if(!p||p.duration!=='7d'||p.pnl_method!=='wac'||p.position_scope!=='duration_only'||p.limit!==100||p.offset!==0||p.sort_by!=='last_trade'||p.sort_type!=='desc')throw new Error('Unsupported trading scope');
  const seen=new Set();
  for(const [index,w] of input.wallets.entries()){
    if(!addressPattern.test(w.address)||seen.has(w.address)||w.sample_volume_rank!==index+1||!numeric(w.sample_volume_usd)||w.sample_volume_usd<0||!date(w.snapshot_date)||Date.parse(w.snapshot_date)>Date.parse(input.updated_at)||!Array.isArray(w.tokens)||w.tokens.length>100||!Number.isSafeInteger(w.reported_unique_tokens)||w.reported_unique_tokens<0||!['limited','count_mismatch','source_page'].includes(w.coverage))throw new Error('Invalid wallet summary');
    if(w.coverage!=='limited'&&(w.tokens.length===100||w.reported_unique_tokens>w.tokens.length))throw new Error('Missing truncation label');
    if(w.tokens.length<100&&w.reported_unique_tokens<w.tokens.length&&w.coverage!=='count_mismatch')throw new Error('Missing count discrepancy');
    seen.add(w.address);const mints=new Set();
    for(const t of w.tokens){
      if(!addressPattern.test(t.address)||mints.has(t.address)||!(t.symbol===null||(typeof t.symbol==='string'&&t.symbol.length<=200)))throw new Error('Invalid token identity');
      mints.add(t.address);
      for(const field of ['buy_usd','sell_usd','realized_usd','unrealized_usd'])if(t[field]!==null&&(!numeric(t[field])||(['buy_usd','sell_usd'].includes(field)&&t[field]<0)))throw new Error('Invalid token metric');
      for(const field of ['buy_count','sell_count','last_trade_unix_time'])if(t[field]!==null&&(!Number.isSafeInteger(t[field])||t[field]<0))throw new Error('Invalid token count or time');
    }
  }
  return input;
}
