'use strict';

// Research uses only the already-loaded data.json. No additional API calls.
let LAB = {positive:false, trades:0};
let COMPARE = ['', ''];
let restoredShare = false;
let researchData = null;
let comparisonKey = '';
let draftWeek = '';
let shareOpener = null;
let missingSharedWallets = false;
const draftKey = 'trader-leaderboard-research-draft';
let shareParams = new URLSearchParams(location.search);
const validAddress = address => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
const labEnabled = () => LAB.positive || LAB.trades > 0;
const passesLab = w => (!LAB.positive || (metric(w,'realized') !== null && w.realized > 0)) && (!LAB.trades || (metric(w,'trades') !== null && w.trades >= LAB.trades));
const compareReady = () => COMPARE.every(address => DATA?.[TAB].some(w => w.address === address));

function restoreResearchShare() {
  if (restoredShare) return;
  restoredShare = true;
  const period = shareParams.get('tab'), order = shareParams.get('sort');
  TAB = Object.hasOwn(PERIODS,period) ? period : 'today';
  SORT = Object.hasOwn(SORT_NAMES,order) ? order : 'realized';
  LAYOUT = ['table','cards'].includes(shareParams.get('layout')) ? shareParams.get('layout') : 'auto';
  LAB = {positive:false,trades:0};
  PAGE = /^\d{1,5}$/.test(shareParams.get('page') || '') ? Math.max(1,Number(shareParams.get('page'))) : 1;
  const minimum = shareParams.get('minTrades');
  if (minimum !== null && /^\d{1,9}$/.test(minimum) && Number(minimum) <= 100000000) LAB.trades = Number(minimum);
  LAB.positive = shareParams.get('positive') === '1';
  QUERY = (shareParams.get('q') || '').slice(0,64).trim().toLowerCase();
  $('wallet-search').value = QUERY;
  $('lab-positive').checked = LAB.positive;
  $('lab-trades').value = String(LAB.trades);
  const requested = [...new Set((shareParams.get('compare') || '').split(',').filter(validAddress))].slice(0,2);
  const available = requested.filter(address => DATA[TAB].some(w => w.address === address));
  COMPARE = [available[0] || '',available[1] || ''];
  missingSharedWallets = requested.length > available.length;
  renderShareNotice();
}

function renderShareNotice() {
  const notes = [];
  const snapshot = shareParams.get('snapshot');
  if (snapshot && Number.isFinite(Date.parse(snapshot)) && Date.parse(snapshot) !== Date.parse(DATA.updated_at)) notes.push(`分享時快照為 ${snapshot}；目前顯示 ${DATA.updated_at} 的最新數值，無法還原舊快照。`);
  if (missingSharedWallets) notes.push('部分分享錢包未收錄在目前期間的本批樣本，已移除，沒有以其他錢包替代。');
  $('shared-notice').textContent = notes.join(' '); $('shared-notice').hidden = notes.length === 0;
}

function researchLink({tab=TAB, addresses=COMPARE, section='wallet-compare', filters=true} = {}) {
  const url = new URL(location.pathname,location.origin);
  url.searchParams.set('tab',tab);
  url.searchParams.set('sort',filters ? SORT : 'realized');
  if (LAYOUT !== 'auto') url.searchParams.set('layout',LAYOUT);
  if (filters && LAB.positive) url.searchParams.set('positive','1');
  if (filters && LAB.trades) url.searchParams.set('minTrades',String(LAB.trades));
  if (filters && QUERY) url.searchParams.set('q',QUERY);
  const present = addresses.filter(address => address && DATA[tab].some(w => w.address === address));
  if (present.length) url.searchParams.set('compare',present.join(','));
  url.searchParams.set('snapshot',DATA.updated_at);
  url.searchParams.set('view',section === 'leaderboard' ? 'leaderboard' : section === 'research' ? 'research' : 'compare');
  url.hash = '';
  return url.href;
}

function setLab() {
  const input = $('lab-trades');
  if (!input.checkValidity() || input.value.trim() === '' || !Number.isSafeInteger(Number(input.value))) {
    input.setAttribute('aria-invalid','true');
    $('lab-error').textContent = '請輸入零到一億之間的整數；目前仍使用上一個有效條件。';
    return;
  }
  input.removeAttribute('aria-invalid'); $('lab-error').textContent = '';
  LAB = {positive:$('lab-positive').checked,trades:Number(input.value)};
  PAGE = 1; render();
}

function resetLab() {
  LAB = {positive:false,trades:0};
  $('lab-positive').checked = false; $('lab-trades').value = '0';
  $('lab-trades').removeAttribute('aria-invalid'); $('lab-error').textContent = '';
  PAGE = 1; render();
}

function renderLab() {
  $('lab-trades').closest('.trade-filter').dataset.active = String(LAB.trades > 0);
  const count = DATA[TAB].filter(passesLab).length;
  const conditions = [LAB.positive ? '已實現 > 0' : '', LAB.trades ? `交易 ≥ ${integer.format(LAB.trades)} 筆` : ''].filter(Boolean);
  $('lab-active').hidden = !conditions.length;
  $('lab-active').textContent = String(conditions.length);
  $('lab-summary').textContent = `${PERIODS[TAB]}・${conditions.join('、') || '未加條件'}：${integer.format(count)} / ${integer.format(DATA[TAB].length)} 個錢包符合。地址搜尋另行套用；缺值不符合已啟用的條件。`;
}

function syncComparePeriod() {
  const removed = COMPARE.filter(address => address && !DATA[TAB].some(w => w.address === address)).length;
  COMPARE = COMPARE.map(address => DATA[TAB].some(w => w.address === address) ? address : '');
  if (removed) researchStatus(`${removed} 個對比錢包不在目前期間的本批樣本，已清除。請重新選擇。`);
}

function selectionButton(w) {
  const selected = COMPARE.includes(w.address);
  return `<button type="button" class="select-wallet" data-select-wallet="${esc(w.address)}" aria-pressed="${selected}" aria-label="${selected ? '移除對比錢包' : '加入對比錢包'} ${esc(w.address)}">${selected ? '已選對比 ✓' : '加入對比 +'}</button>`;
}

function toggleCompare(address,button) {
  if (!DATA?.[TAB].some(w => w.address === address)) return;
  const current = COMPARE.indexOf(address), empty = COMPARE.indexOf('');
  if (current >= 0) COMPARE[current] = '';
  else if (empty >= 0) COMPARE[empty] = address;
  else {
    researchStatus('對比已選滿，請先移除其中一個錢包，再加入新的。');
    announce('對比已選滿。可前往錢包對比更換或移除。');
    return;
  }
  const container = button.closest('tr') ? 'rows' : 'cards';
  render();
  $(container).querySelector(`[data-select-wallet="${address}"]`)?.focus({preventScroll:true});
  const message = `已選 ${COMPARE.filter(Boolean).length} 個錢包，可到錢包研究室查看對比。`;
  researchStatus(message); announce(message);
}

function pairLeaders(tab) {
  const total = sorted('pnl',tab).find(w => metric(w,'pnl') !== null);
  const realized = sorted('realized',tab).find(w => metric(w,'realized') !== null);
  if (!total || !realized) return {wallets:[],same:false};
  const same = total.address === realized.address;
  const next = same ? sorted('realized',tab).find(w => w.address !== total.address && metric(w,'realized') !== null) : realized;
  return {wallets:[total,next].filter(Boolean),same};
}

function compareCard(index) {
  const address = COMPARE[index], w = DATA[TAB].find(row => row.address === address);
  const options = sorted('realized').map((row,rank) => `<option value="${esc(row.address)}" ${row.address === address ? 'selected' : ''} ${row.address === COMPARE[1-index] ? 'disabled' : ''}>#${rank+1} ${esc(short(row.address))} · ${esc(fmt(metric(row,'realized')))}</option>`).join('');
  const label = index === 0 ? 'A' : 'B';
  const select = `<label class="field-label" for="compare-${index}">錢包 ${label}<span>依已實現收益列出本批樣本</span></label><select id="compare-${index}" data-compare-slot="${index}" ${!DATA[TAB].length ? 'disabled' : ''}><option value="">選擇錢包</option>${options}</select>`;
  if (!w) return `<div class="compare-card empty">${select}<div class="compare-empty"><p>加入一個想研究的錢包</p><span>可從排行榜按「加入對比」，或在上方選擇。</span></div></div>`;
  const realized = metric(w,'realized');
  const ranks = ['realized','pnl'].map(key => sorted(key).findIndex(row => row.address === address)+1);
  return `<div class="compare-card">${select}<div class="compare-address">${walletActions(w)}<button type="button" class="text-button" data-remove-slot="${index}" aria-label="移除對比錢包 ${label}">移除</button></div><dl class="compare-primary"><dt>已實現收益</dt><dd class="${tone(realized)}">${moneyHTML(realized)}</dd></dl><dl class="compare-metrics"><div><dt>總損益</dt><dd class="${tone(metric(w,'pnl'))}">${moneyHTML(metric(w,'pnl'))}</dd></div><div><dt>落袋比例</dt><dd>${ratioMarkup(w)}</dd></div><div><dt>交易次數</dt><dd>${metric(w,'trades') === null ? '—' : integer.format(w.trades)}</dd></div><div><dt>成交量</dt><dd>${moneyHTML(metric(w,'volume'))}</dd></div></dl><p class="reading-note">本批已實現排名 #${ranks[0]} · 總損益排名 #${ranks[1]}</p></div>`;
}

function renderWalletCompare() {
  const key = `${TAB}:${SORT}:${LAB.positive}:${LAB.trades}:${QUERY}:${COMPARE.join(',')}`;
  if (comparisonKey === key && researchData === DATA) return;
  comparisonKey = key;
  const focused = document.activeElement?.id;
  $('compare-grid').innerHTML = [compareCard(0),compareCard(1)].join('');
  if (['compare-0','compare-1'].includes(focused)) $(focused).focus({preventScroll:true});
  const count = COMPARE.filter(Boolean).length, ready = compareReady();
  $('selection-count').hidden = !count; $('selection-count').textContent = String(count);
  $('compare-context').textContent = `${PERIODS[TAB]}・本批 ${DATA[TAB].length} 個錢包・不受條件與搜尋影響`;
  const pair = pairLeaders(TAB);
  $('compare-leaders').disabled = pair.wallets.length < 2;
  $('compare-leaders').textContent = pair.same ? '比較已實現前兩名' : '比較兩種榜首';
  $('compare-clear').disabled = count === 0;
  for (const id of ['compare-copy','compare-link']) $(id).disabled = !ready;
  $('compare-x').hidden = !ready;
  if (!ready) $('compare-difference').textContent = '選好兩個錢包後，從落袋、帳面與交易紀錄找出差異。';
  else {
    const [a,b] = COMPARE.map(address => DATA[TAB].find(w => w.address === address));
    const x = metric(a,'realized'), y = metric(b,'realized');
    $('compare-difference').textContent = x === null || y === null ? '部分已實現收益未提供，無法比較差額。' : x === y ? '這兩個錢包的已實現收益相同；可以再比較交易次數與總損益。' : `錢包 ${x > y ? 'A' : 'B'} 的已實現收益較高，差額 ${fmt(Math.abs(x-y))}。金額差異不代表交易能力高低。`;
    $('compare-x').href = xIntent(`我在比較兩個 Solana 錢包（${PERIODS[TAB]}）：\nA ${short(a.address)}：已實現 ${fmt(x)}\nB ${short(b.address)}：已實現 ${fmt(y)}\n你會再查哪些證據？\n資料 Birdeye @kkweb3345678`,researchLink());
  }
}

function weeklyTopic() {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(DATA.updated_at));
  const part = name => parts.find(p => p.type === name).value;
  const monday = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay()+6)%7);
  const week = monday.toISOString().slice(0,10);
  const leaders = pairLeaders('week');
  const rows = DATA.week;
  const busy = [...rows].filter(w => metric(w,'trades') !== null).sort((a,b) => b.trades-a.trades || a.address.localeCompare(b.address))[0];
  const ratioLeader = [...rows].filter(w => ratio(w) !== null && ratio(w) > 100).sort((a,b) => ratio(b)-ratio(a) || a.address.localeCompare(b.address))[0];
  const otherThan = row => sorted('realized','week').find(w => w.address !== row?.address && metric(w,'realized') !== null);
  const topics = [
    {title:'換個排序，你會研究誰？',wallets:leaders.wallets,question:'名次差異來自哪個欄位？還需要哪些交易證據？',note:leaders.same ? '兩種榜首相同，本題改比較已實現前兩名。' : '把總損益榜首與已實現榜首放在一起看。'},
    {title:'交易多，落袋也多嗎？',wallets:[busy,otherThan(busy)].filter(Boolean),question:'交易次數能解釋收益嗎？哪些資訊仍然缺少？',note:'比較交易次數最高者與另一個已實現收益領先的錢包，不能據此認定機器人。'},
    {title:'落袋比例超過百分之百，發生什麼事？',wallets:[ratioLeader,otherThan(ratioLeader)].filter(Boolean),question:'已實現收益與總損益如何同時成立？比例能代表勝率嗎？',note:'比例為已實現收益除以正的總損益；超過百分之百不等於勝率。'}
  ];
  let topic = topics[((Math.floor(monday.getTime()/604800000)%topics.length)+topics.length)%topics.length];
  if (topic.wallets.length !== 2 || topic.wallets[0]?.address === topic.wallets[1]?.address || (topic === topics[2] && !ratioLeader)) topic = topics[0];
  return {...topic,week};
}

function renderWeeklyTopic() {
  if (researchData === DATA) return;
  const topic = weeklyTopic(), ready = topic.wallets.length === 2;
  $('topic-week').textContent = `・${topic.week} 起`;
  $('weekly-title').textContent = ready ? topic.title : '本批近七日樣本不足，暫無研究配對。';
  $('weekly-facts').textContent = ready ? topic.note : '近七日資料可用後，才會產生可核對的研究配對。';
  $('topic-question').textContent = ready ? topic.question : '目前沒有足夠樣本，請稍後重新讀取。';
  $('topic-evidence').innerHTML = ready ? topic.wallets.map((w,index) => `<article class="evidence-card"><div class="evidence-head"><span>${index ? 'B' : 'A'}</span>${walletActions(w,'week')}</div><dl class="evidence-metrics"><div><dt>近七日已實現收益</dt><dd class="${tone(metric(w,'realized'))}">${moneyHTML(metric(w,'realized'))}</dd></div><div><dt>交易次數</dt><dd>${metric(w,'trades') === null ? '—' : integer.format(w.trades)}</dd></div></dl></article>`).join('') : '';
  for (const id of ['topic-start','topic-copy','research-note']) $(id).disabled = !ready;
  $('topic-x').hidden = !ready;
  if (draftWeek !== topic.week) {
    draftWeek = topic.week;
    $('research-note').value = '';
    try { const saved = JSON.parse(localStorage.getItem(draftKey)); if (saved?.week === draftWeek && typeof saved.text === 'string') $('research-note').value = saved.text.slice(0,600); } catch (_) {}
  }
  updateTopicIntent();
}

function renderResearch() {
  renderShareNotice(); renderLab(); renderWalletCompare(); renderWeeklyTopic(); researchData = DATA;
}

function researchStatus(message) { $('research-status').textContent = message; }
function xIntent(text,url) { const intent = new URL('https://x.com/intent/post'); intent.searchParams.set('text',text); intent.searchParams.set('url',url); return intent.href; }
function updateTopicIntent() {
  if (!DATA) return;
  const topic = weeklyTopic();
  if (topic.wallets.length !== 2) return;
  // The full draft stays in the copied evidence; X starts with a short excerpt.
  const draft = Array.from($('research-note').value.trim()).slice(0,60).join('');
  $('topic-x').href = xIntent(`本週研究：${topic.title}\n${draft || topic.question}\n近七日樣本・資料 Birdeye @kkweb3345678`,researchLink({tab:'week',addresses:topic.wallets.map(w => w.address),section:'research',filters:false}));
}

function walletEvidence(w,label,tab) {
  const raw = key => metric(w,key) === null ? '未提供' : String(w[key]);
  return `${label}：${w.address}\nhttps://solscan.io/account/${w.address}\n已實現 USD ${raw('realized')}；總損益 USD ${raw('pnl')}\n交易次數 ${raw('trades')}；成交量 USD ${raw('volume')}\n落袋比例 ${ratioLabel(ratio(w))}（realized / pnl；非勝率）\n本批已實現排名 #${sorted('realized',tab).findIndex(row => row.address === w.address)+1}`;
}

function evidenceText(topicMode=false) {
  if (!DATA) return '';
  const topic = weeklyTopic();
  const tab = topicMode ? 'week' : TAB;
  const wallets = topicMode ? topic.wallets : COMPARE.map(address => DATA[TAB].find(w => w.address === address)).filter(Boolean);
  if (wallets.length !== 2) return '';
  const draft = topicMode ? $('research-note').value.trim() : '';
  return `${topicMode ? '本週研究：'+topic.title : 'Solana 錢包對比'}\n資料來源 Birdeye；期間 ${PERIODS[tab]}\n快照時間 ${DATA.updated_at}\n\n${wallets.map((w,i) => walletEvidence(w,i ? 'B' : 'A',tab)).join('\n\n')}\n\n${topicMode ? '研究問題：'+topic.question+'\n我的分析：'+(draft || '（尚未填寫）')+'\n\n' : ''}本批總損益取樣，非全鏈排名；不能由交易次數推定身份。缺值可能已被上游補零。\n分享連結將讀取最新快照；以上文字保留當時數值。\n${researchLink({tab,addresses:wallets.map(w => w.address),section:topicMode ? 'research' : 'wallet-compare',filters:!topicMode})}\n@kkweb3345678`;
}

async function copyResearch(text,button) {
  if (!text) return;
  button.disabled = true;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    researchStatus('已複製，可貼給其他人一起研究。'); announce('已複製分享內容。');
    button.dataset.copyOriginal = button.dataset.copyOriginal || button.textContent;
    button.textContent = '已複製 ✓';
    clearTimeout(button.copyTimer);
    button.copyTimer = setTimeout(() => {button.textContent = button.dataset.copyOriginal;},2000);
  } catch (_) {
    shareOpener = button; $('share-text').value = text; $('share-dialog').showModal(); $('share-text').focus(); $('share-text').select();
  } finally {button.disabled = false;}
}

function initResearch() {
$('lab-form').addEventListener('submit',event => {event.preventDefault();setLab();});
$('lab-positive').addEventListener('change',setLab);
$('lab-trades').addEventListener('input',setLab);
$('lab-reset').addEventListener('click',resetLab);
$('lab-preset').addEventListener('click',() => {$('lab-positive').checked = true; $('lab-trades').value = '10';setLab();});
$('lab-share').addEventListener('click',event => {if (DATA) copyResearch(researchLink({addresses:[],section:'leaderboard'}),event.currentTarget);});
$('compare-clear').addEventListener('click',() => {COMPARE = ['',''];render();$('compare-0').focus({preventScroll:true});researchStatus('已清除對比。');});
$('compare-leaders').addEventListener('click',() => {const pair = pairLeaders(TAB);if (pair.wallets.length === 2) {COMPARE = pair.wallets.map(w => w.address);render();researchStatus('已加入同期間的比較錢包。');}});
$('compare-copy').addEventListener('click',event => copyResearch(evidenceText(),event.currentTarget));
$('compare-link').addEventListener('click',event => {if (compareReady()) copyResearch(researchLink(),event.currentTarget);});
$('topic-copy').addEventListener('click',event => copyResearch(evidenceText(true),event.currentTarget));
$('topic-start').addEventListener('click',() => {
  if (!DATA) return;
  const topic = weeklyTopic();if (topic.wallets.length !== 2) return;
  TAB = 'week';PAGE = 1;COMPARE = topic.wallets.map(w => w.address);render();
  setView('compare');
  $('compare-0').focus({preventScroll:true});researchStatus('本題使用近七日完整樣本；排行榜條件保留，不影響對比數值。');
});
$('research-note').addEventListener('input',() => {
  try {localStorage.setItem(draftKey,JSON.stringify({week:draftWeek,text:$('research-note').value}));$('draft-status').textContent = '草稿已儲存在此瀏覽器，尚未公開；分享至 X 前可再編輯。';}
  catch (_) {$('draft-status').textContent = '瀏覽器無法儲存草稿，請先複製分析內容；尚未公開。';}
  updateTopicIntent();
});
$('share-dialog').addEventListener('close',() => {if (shareOpener?.isConnected) shareOpener.focus({preventScroll:true});});
document.addEventListener('change',event => {
  if (!event.target.matches('[data-compare-slot]')) return;
  const slot = Number(event.target.dataset.compareSlot), address = event.target.value;
  if (address && (!DATA[TAB].some(w => w.address === address) || COMPARE[1-slot] === address)) return;
  COMPARE[slot] = address;render();
});
document.addEventListener('click',event => {
  const select = event.target.closest('[data-select-wallet]');if (select) toggleCompare(select.dataset.selectWallet,select);
  const remove = event.target.closest('[data-remove-slot]');
  if (remove) {const slot = Number(remove.dataset.removeSlot);COMPARE[slot] = '';render();$('compare-'+slot).focus({preventScroll:true});researchStatus('已移除對比錢包。');}
  if (event.target.closest('[data-reset-lab]')) {resetLab();$('lab-positive').focus({preventScroll:true});}
});
}
