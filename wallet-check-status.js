/* Public operational status only; this never changes the reviewed wallet dataset. */
(function () {
  'use strict';
  function describeCheck(raw, currentTime = Date.now()) {
    const unavailable = {state:'unavailable', text:'暫時無法取得檢查紀錄', detail:'資料基準日維持原標示；目前無法確認自動檢查狀態。'};
    if (!raw || raw.schema_version !== 1 || !raw.schedule || typeof raw.schedule.enabled !== 'boolean') return unavailable;
    for (const key of ['checked','configured','expected','failed','skipped','changed']) {
      if (!Number.isInteger(raw[key]) || raw[key] < 0) return unavailable;
    }
    if (raw.checked > raw.configured || raw.checked + raw.failed > raw.configured || raw.configured + raw.skipped !== raw.expected || raw.changed > raw.checked) return unavailable;
    if (raw.last_check === null && raw.status === 'not_started') return {
      state:'pending', text:'自動檢查尚未啟用', detail:'規劃檢查 Swap 抽成與積分／獎勵來源；排程啟用後才會顯示實際檢查時間。'
    };
    const timestamp = Date.parse(raw.last_check);
    if (!Number.isFinite(timestamp) || timestamp > currentTime + 60000 || raw.checked + raw.failed !== raw.configured) return unavailable;
    const formatted = new Intl.DateTimeFormat('zh-TW', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(timestamp));
    const active = raw.schedule.enabled && raw.schedule.interval_minutes === 60;
    const stale = active && currentTime - timestamp > raw.schedule.interval_minutes * 60000 * 2.5;
    const label = !active ? '自動檢查尚未啟用' : stale ? '自動檢查已逾時' : '關鍵欄位每小時檢查';
    const checkedLabel = raw.failed ? '上次嘗試' : active ? '上次檢查' : '最近手動檢查';
    const parts = [`Swap 抽成與積分／獎勵：成功檢查 ${raw.checked} / ${raw.configured} 個來源`];
    if (raw.failed) parts.push(`${raw.failed} 個來源讀取失敗`);
    if (raw.skipped) parts.push(`${raw.skipped} 個欄位尚無可用來源`);
    parts.push('只偵測來源文字變動，資料仍由人工審核後更新');
    return {state:stale ? 'stale' : raw.failed ? 'partial' : active ? 'active' : 'manual', text:`${label} · ${checkedLabel} ${formatted}（台北）`, detail:parts.join('；')+'。'};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {describeCheck};
  if (typeof document === 'undefined') return;
  async function loadCheckStatus() {
    let status;
    try {
      const response = await fetch('./check-log.json', {cache:'no-store',signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw Error('Status unavailable');
      status = describeCheck(await response.json());
    } catch (_) {status = describeCheck(null);}
    const text = document.getElementById('check-freshness');
    text.textContent = status.text;
    text.dataset.state = status.state;
    document.getElementById('check-coverage').textContent = status.detail;
  }
  loadCheckStatus();
}());
