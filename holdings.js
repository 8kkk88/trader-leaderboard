const addressPattern=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));

export function validateHoldings(input,now=Date.now()){
  if(!input||!date(input.updated_at)||Date.parse(input.updated_at)>now+60000||!Array.isArray(input.wallets)||input.wallets.length!==10)throw new Error('Invalid holdings snapshot');
  const seen=new Set();
  for(const wallet of input.wallets){
    if(!addressPattern.test(wallet.address)||seen.has(wallet.address)||!date(wallet.snapshot_date)||Date.parse(wallet.snapshot_date)>Date.parse(input.updated_at)||!Array.isArray(wallet.tokens)||wallet.tokens.length>5)throw new Error('Invalid wallet snapshot');
    seen.add(wallet.address);let previous=Infinity,sum=0;
    for(const token of wallet.tokens){
      if(typeof token.symbol!=='string'||!token.symbol.trim()||token.symbol.length>100||!finite(token.value_usd)||token.value_usd<0||token.value_usd>previous||!(token.pct===null||(finite(token.pct)&&token.pct>=0&&token.pct<=100)))throw new Error('Invalid token holding');
      previous=token.value_usd;sum+=token.pct||0;
    }
    if(sum>100.0001)throw new Error('Inconsistent percentages');
  }
  return input;
}

const formatDate=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
const percent=value=>value===null?'佔比未知':value>0&&value<0.01?'<0.01%':value.toLocaleString('zh-TW',{maximumFractionDigits:2})+'%';
export function holdingsMarkup(snapshot,address,now=Date.now()){
  const wallet=snapshot.wallets.find(item=>item.address===address);
  if(!wallet)return `<p class="holdings-empty">這個地址未收錄於最近一期近七日已實現收益前十名的持倉快照，不代表沒有持倉。</p><p class="holdings-meta">最近發布 <time datetime="${escape(snapshot.updated_at)}">${formatDate(snapshot.updated_at)}（台北）</time></p>`;
  const stale=now-Date.parse(wallet.snapshot_date)>7*86400000;
  return `<p class="holdings-meta">持倉快照 <time datetime="${escape(wallet.snapshot_date)}">${formatDate(wallet.snapshot_date)}（台北）</time></p>${stale?'<p class="holdings-stale">此快照已超過七天，請以標示日期閱讀。</p>':''}${wallet.tokens.length?`<ol class="holdings-list">${wallet.tokens.map(token=>`<li><div class="holdings-token"><strong>${escape(token.symbol)}</strong><span>${percent(token.pct)}</span></div><div class="holdings-bar" aria-hidden="true"><span style="width:${token.pct??0}%"></span></div><div class="holdings-value">${escape(globalThis.ResearchMoney.format(token.value_usd))}</div></li>`).join('')}</ol>`:'<p class="holdings-empty">本次 API 回傳沒有符合範圍的持倉項目；不代表錢包沒有其他資產。</p>'}<p class="holdings-scope">依持倉估值顯示最多五個幣種；佔比以 API 回傳總值計算，合計可能未滿 100%。來源預設排除低流動性代幣，不涵蓋所有資產。</p>`;
}

if(typeof document!=='undefined'){
  const body=document.getElementById('holdings-content'),panel=document.getElementById('wallet-holdings'),retry=document.getElementById('holdings-retry');
  let cached=null,pending=null,loadedAt=0,identity=null,version=0;
  async function read(){
    if(cached&&Date.now()-loadedAt<300000)return cached;
    if(pending)return pending;
    pending=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
      try{const response=await fetch('./holdings.json?t='+Date.now(),{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error(response.status===404?'pending':'load');const data=validateHoldings(await response.json());cached=data;loadedAt=Date.now();return data;}finally{clearTimeout(timer);}})();
    try{return await pending;}finally{pending=null;}
  }
  async function show(address){
    const current=++version;identity=address;retry.hidden=true;panel.setAttribute('aria-busy','true');body.innerHTML='<p class="holdings-empty" role="status">正在讀取已發布的持倉快照…</p>';
    try{const snapshot=await read();if(current!==version)return;body.innerHTML=holdingsMarkup(snapshot,address);}
    catch(error){if(current!==version)return;body.innerHTML=`<p class="holdings-empty" role="status">${error.message==='pending'?'持倉快照尚未發布。':'暫時無法讀取持倉快照，地址與外部查詢仍可使用。'}</p>`;retry.hidden=false;}
    finally{if(current===version)panel.setAttribute('aria-busy','false');}
  }
  document.addEventListener('wallet:opened',event=>show(event.detail.address));
  document.getElementById('wallet-dialog').addEventListener('close',()=>{version++;panel.setAttribute('aria-busy','false');});
  retry.addEventListener('click',()=>{cached=null;show(identity);});
}
