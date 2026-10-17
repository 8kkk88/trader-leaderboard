// Source-time presentation only. These hours describe the existing publication schedule.
globalThis.SnapshotTime = (() => {
  const hour=3600000,day=24*hour,offset=8*hour;
  const format=value=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
  function state(stamp,mode='full',now=Date.now()) {
    const source=Date.parse(stamp);
    if(typeof stamp!=='string'||!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(stamp)||!Number.isFinite(source)||!Number.isFinite(now)||source>now+60000)return {valid:false,pending:false,message:'尚未取得來源時間'};
    const slots=mode==='flash'?[2,14,20]:[8],local=now+offset,start=Math.floor(local/day)*day-offset;
    let expected=start-day+slots.at(-1)*hour;
    for(const h of slots)if(start+h*hour<=now)expected=start+h*hour;
    const pending=source<expected;
    return {valid:true,pending,expected:new Date(expected).toISOString(),asOf:format(source),
      message:pending?`等待 ${format(expected)} 時段更新；排程可能延遲，先顯示最新可用快照。`:'來源時間已涵蓋最近一次應有更新時段。'};
  }
  return Object.freeze({state,format});
})();
