// Read-only homepage calculations. No data producer or ranking UI depends on this module.
import './money-format.js?v=1';
export const DEFAULT_MODULES = Object.freeze({board:true,trend:true,wallet:false,rebate:false});
export const isAddress = value => typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const shortAddress = value => value.slice(0,6)+'…'+value.slice(-4);
export function signedMoney(value) {
  return globalThis.ResearchMoney.format(value,{signed:true});
}
export const timeLabel = value => new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value))+'（台北）';
export const dayKey = value => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function rankToday(rows=[]) {
  const compare=(a,b,key)=>!finite(a[key]) ? (!finite(b[key])?0:1) : !finite(b[key]) ? -1 : b[key]-a[key];
  return [...rows].sort((a,b)=>compare(a,b,'realized')||compare(a,b,'pnl')||a.address.localeCompare(b.address));
}
export function readModules(raw) {
  try {const value=JSON.parse(raw);return Object.fromEntries(Object.entries(DEFAULT_MODULES).map(([key,fallback])=>[key,typeof value?.[key]==='boolean'?value[key]:fallback]));} catch {return {...DEFAULT_MODULES};}
}
export function readFollow(raw) {
  try {const value=JSON.parse(raw);return Array.isArray(value)?[...new Set(value.filter(isAddress))].slice(0,500):[];} catch {return [];}
}
export function snapshotFiles(paths,cutoff=Infinity) {
  if (!Array.isArray(paths)) throw new Error('Invalid archive index');
  const unique=new Map();
  for (const path of paths.slice().sort()) {
    const match=String(path).match(/^(?:\/?snapshots\/)?(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)--([a-f0-9]{12})\.json$/);
    if (!match) continue;
    const stamp=match[1].replace(/T(\d{2})-(\d{2})-(\d{2})Z/,'T$1:$2:$3Z');
    if (!Number.isFinite(Date.parse(stamp)) || Date.parse(stamp)>cutoff) continue;
    unique.set(stamp,{path:'snapshots/'+match[1]+'--'+match[2]+'.json',stamp});
  }
  return [...unique.values()].sort((a,b)=>Date.parse(b.stamp)-Date.parse(a.stamp));
}
export function readArchive(raw,entry) {
  const data=raw?.data;
  if (raw?.schema_version!==1 || data?.source!=='Birdeye' || data?.chain!=='solana' || !Array.isArray(data.today) || !Array.isArray(data.week) || Date.parse(data.updated_at)!==Date.parse(entry.stamp) || Date.parse(raw.data_updated_at)!==Date.parse(entry.stamp)) throw new Error('Invalid archive');
  for (const rows of [data.today,data.week]) {
    const addresses=new Set();
    for (const row of rows) {
      if (!row || !isAddress(row.address) || addresses.has(row.address)) throw new Error('Invalid archive address');
      addresses.add(row.address);
      for (const key of ['realized','pnl','trades']) if (row[key]!=null && !finite(row[key])) throw new Error('Invalid archive metric');
    }
  }
  return {...entry,data,full:data.today.length===100 && data.week.length===100};
}
export function compareSnapshots(latest,previous) {
  if (!latest?.full || !previous?.full || Date.parse(latest.stamp)<=Date.parse(previous.stamp)) return null;
  const current=rankToday(latest.data.today), prior=rankToday(previous.data.today);
  // An unknown realized value cannot produce an honest numeric rank delta.
  if (current.some(w=>!finite(w.realized)) || prior.some(w=>!finite(w.realized))) return null;
  const old=new Map(prior.map((row,index)=>[row.address,{row,rank:index+1}]));
  const gains=current.map((row,index)=>({row,rank:index+1,previousRank:old.get(row.address)?.rank,gain:(old.get(row.address)?.rank??0)-(index+1)})).filter(x=>x.gain>0).sort((a,b)=>b.gain-a.gain||a.rank-b.rank);
  return {latest,previous,current,prior,old,commonCount:current.filter(row=>old.has(row.address)).length,biggest:gains[0]??null,newcomers:current.filter(row=>!old.has(row.address))};
}
export function followChange(address,pair) {
  if (!pair) return {status:'pending'};
  const latest=pair.current.find(w=>w.address===address), previous=pair.old.get(address)?.row;
  if (!latest) return {status:'absent'};
  if (!previous) return {status:'new',latest};
  if (!finite(latest.realized)||!finite(previous.realized)) return {status:'missing'};
  const delta=latest.realized-previous.realized;
  return finite(delta)?{status:'delta',delta,latest,previous}:{status:'missing'};
}
