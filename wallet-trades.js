import {validateTrades} from './trade-data.js?v=1';
export {validateTrades};
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(s));
const money=n=>n===null?'未提供':esc(globalThis.ResearchMoney.format(n));
const tone=n=>n===null||n===0?'zero':n<0?'negative':'positive';
function tokenMarkup(t){
  const count=n=>n===null?'':` · ${n.toLocaleString('zh-TW')} 次`;
  const metric=(label,value,style='')=>`<div><dt>${label}</dt><dd class="${style}">${money(value)}</dd></div>`;
  return `<li class="trade-token"><div class="trade-token-title"><strong><a href="./tokens.html?token=${encodeURIComponent(t.address)}" aria-label="查看 ${esc(t.symbol?.trim()||'未提供名稱')} 的交易錢包">${esc(t.symbol?.trim()||'未提供名稱')} →</a></strong><a href="https://solscan.io/token/${encodeURIComponent(t.address)}" target="_blank" rel="noopener noreferrer" title="${esc(t.address)}" aria-label="在 Solscan 查詢代幣 ${esc(t.symbol||'未命名')}，合約 ${esc(t.address)}">${esc(t.address.slice(0,4)+'…'+t.address.slice(-4))}<span aria-hidden="true"> ↗</span></a></div><dl class="trade-metrics">${metric('買入金額'+count(t.buy_count),t.buy_usd)}${metric('賣出金額'+count(t.sell_count),t.sell_usd)}${metric('已實現損益',t.realized_usd,tone(t.realized_usd))}${metric('未實現損益',t.unrealized_usd,tone(t.unrealized_usd))}</dl></li>`;
}
export function tradesMarkup(snapshot,address,now=Date.now()){
  const w=snapshot.wallets.find(w=>w.address===address);
  const source=`<p class="trade-source">選樣榜單：<time datetime="${esc(snapshot.source_updated_at)}">${fmtDate(snapshot.source_updated_at)}（台北）</time> · 近七日樣本交易量前十名</p>`;
  if(!w)return `<p class="holdings-empty">這個地址未收錄於這期交易幣種摘要。每日只追蹤近七日樣本交易量前十名，未收錄不代表沒有交易。</p>${source}`;
  const stale=now-Date.parse(w.snapshot_date)>36*3600000||now-Date.parse(snapshot.source_updated_at)>36*3600000;
  const meta=`<p class="holdings-meta">摘要更新 <time datetime="${esc(w.snapshot_date)}">${fmtDate(w.snapshot_date)}（台北）</time> · 金額單位 USD</p>`;
  const coverage=w.coverage==='limited'?`<p class="trade-coverage">部分幣種摘要：本次取得 ${w.tokens.length} 筆，來源幣種統計為 ${w.reported_unique_tokens}。最多收錄最近交易的 100 個，未列出不代表沒有交易。</p>`:w.coverage==='count_mismatch'?`<p class="trade-coverage">本次明細 ${w.tokens.length} 筆，來源彙總為 ${w.reported_unique_tokens} 個；兩者統計口徑有差異，保留原始明細，不把彙總當成清單總數。</p>`:`<p class="trade-coverage">本次來源回傳 ${w.tokens.length} 個幣種，依最近交易排序。</p>`;
  const list=w.tokens.length?`<ol class="trade-token-list">${w.tokens.slice(0,5).map(tokenMarkup).join('')}</ol>${w.tokens.length>5?`<details class="trade-more"><summary>查看其餘 ${w.tokens.length-5} 個幣種</summary><ol class="trade-token-list" start="6">${w.tokens.slice(5).map(tokenMarkup).join('')}</ol></details>`:''}`:'<p class="holdings-empty">來源在本次查詢範圍內沒有回傳幣種；不代表沒有其他鏈或範圍外交易。</p>';
  return `${meta}${stale?'<p class="holdings-stale">來源或摘要已超過一天半，請留意標示日期；更新失敗時保留上一份資料。</p>':''}${coverage}${list}${source}<details class="trade-method"><summary>資料範圍與損益怎麼算？</summary><p>查詢窗口為更新當下往回七日，僅含 Solana。這是逐幣彙總，沒有每筆成交的時間與價格，也不等於目前持倉。不同合約即使同名，仍分開列出。</p><p>損益向來源指定 WAC（加權平均成本）、duration_only 口徑；與榜單的來源時間、計算口徑可能不同，不強行對齊加總。未提供的數值保留為「未提供」。</p><a href="https://data.birdeye.so/docs/data-api/wallet-networth-pnl/post-wallet-v2-pnl-details" target="_blank" rel="noopener noreferrer">Birdeye 幣種損益文件 ↗</a></details>`;
}
if(typeof document!=='undefined'){
  const body=document.getElementById('trades-content'),panel=document.getElementById('wallet-trades'),retry=document.getElementById('trades-retry'),dialog=document.getElementById('wallet-dialog');
  const tabs=[...document.querySelectorAll('.wallet-detail-tabs [role="tab"]')];
  let cached=null,pending=null,loadedAt=0,identity=null,version=0;
  function select(tab,focus=false){for(const t of tabs){const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!active;}if(focus)tab.focus();}
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>select(tab));
    tab.addEventListener('keydown',event=>{const target=event.key==='ArrowRight'?tabs[(index+1)%tabs.length]:event.key==='ArrowLeft'?tabs[(index+tabs.length-1)%tabs.length]:event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):null;if(target){event.preventDefault();select(target,true);}});
  });
  async function read(){
    if(cached&&Date.now()-loadedAt<300000)return cached;
    if(pending)return pending;
    pending=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch('./wallet-trades.json?t='+Date.now(),{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error(response.status===404?'pending':'load');cached=validateTrades(await response.json());loadedAt=Date.now();return cached;}finally{clearTimeout(timer);}})();
    try{return await pending;}finally{pending=null;}
  }
  async function show(address){
    identity=address;const current=++version;retry.hidden=true;panel.setAttribute('aria-busy','true');body.innerHTML='<p class="holdings-empty" role="status">正在讀取已發布的交易摘要…</p>';
    try{const snapshot=await read();if(current===version)body.innerHTML=tradesMarkup(snapshot,address);}
    catch(error){if(current!==version)return;body.innerHTML=`<p class="holdings-empty" role="status">${error.message==='pending'?'交易幣種摘要尚未發布。':'暫時無法讀取交易摘要，可以重試或使用上方 Solscan 查詢。'}</p>`;retry.hidden=false;}
    finally{if(current===version)panel.setAttribute('aria-busy','false');}
  }
  document.addEventListener('wallet:opened',event=>{select(document.getElementById(event.detail.view==='trades'?'wallet-tab-trades':'wallet-tab-holdings'));show(event.detail.address);});
  dialog.addEventListener('close',()=>{version++;panel.setAttribute('aria-busy','false');});
  retry.addEventListener('click',()=>{cached=null;show(identity);});
}
