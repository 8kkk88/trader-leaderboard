const FIELDS = ['spot','futures','tiers','notes'];
const FIELD_LABELS = {spot:'現貨返佣',futures:'合約返佣',tiers:'等級門檻',notes:'分配與結算備註'};
const BRAND_FILES = {binance:'binance.png',okx:'okx.png',bybit:'bybit.ico',bitget:'bitget.png',max:'max.png',bitopro:'bitopro.ico',mexc:'mexc.ico',ourbit:'ourbit.png',gateio:'gateio.svg'};
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function validateReferral(data) {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.baseline_date) || !Array.isArray(data.exchanges) || !data.exchanges.length) throw new Error('Invalid data');
  const ids = new Set();
  for (const item of data.exchanges) {
    if (!/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name || typeof item.verified !== 'boolean') throw new Error('Invalid exchange');
    ids.add(item.id);
    if (FIELDS.some(field => typeof item[field] !== 'string' || !item[field])) throw new Error('Invalid field');
    if (!Array.isArray(item.sources) || (item.verified && !item.sources.length)) throw new Error('Missing sources');
    for (const source of item.sources) {
      const url = new URL(source);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid source');
    }
  }
  return data;
}

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const pending = value => escapeHTML(value).replaceAll('待查證','<span class="referral-pending">待查證</span>');
function rateValue(value) {
  const split = value.indexOf('（');
  return split > 0 ? `<span class="referral-rate-main">${pending(value.slice(0,split))}</span><span class="referral-rate-context">${pending(value.slice(split))}</span>` : pending(value);
}
function brand(item) {
  const file = Object.hasOwn(BRAND_FILES,item.id) ? BRAND_FILES[item.id] : null;
  return `<span class="exchange-logo" aria-hidden="true">${file ? `<img src="./assets/exchanges/${file}" width="32" height="32" alt="">` : `<span>${escapeHTML(item.name.slice(0,1))}</span>`}</span><span class="exchange-name">${escapeHTML(item.name)}</span>`;
}
function sourceButton(item) {
  return `<button class="referral-source-button" type="button" data-source="${escapeHTML(item.id)}" aria-haspopup="dialog" aria-label="${escapeHTML(item.name)}：${item.sources.length ? '查看官方資料' : '查看資料狀態'}">${item.sources.length ? '查看官方資料' : '查看資料狀態'}${icon('right')}</button>`;
}
export function renderRow(item) {
  const cells = FIELDS.map(field => {
    const rate = ['spot','futures'].includes(field);
    return `<td${rate ? ' class="referral-rate"' : ''}><p class="referral-value">${rate ? rateValue(item[field]) : pending(item[field])}</p></td>`;
  }).join('');
  return `<tr data-exchange="${escapeHTML(item.id)}"><th scope="row"><div class="exchange-brand">${brand(item)}</div>${sourceButton(item)}</th>${cells}</tr>`;
}

export function renderCard(item) {
  return `<article class="referral-card"><header class="exchange-brand">${brand(item)}</header><dl class="referral-card-rates">${FIELDS.slice(0,2).map(field => `<div><dt>${FIELD_LABELS[field]}</dt><dd>${rateValue(item[field])}</dd></div>`).join('')}</dl><details class="referral-card-details"><summary>等級門檻與備註 ${icon('down')}</summary><dl>${FIELDS.slice(2).map(field => `<div><dt>${FIELD_LABELS[field]}</dt><dd>${pending(item[field])}</dd></div>`).join('')}</dl></details><footer>${sourceButton(item)}<span>${item.verified ? '附官方來源' : '資料待查證'}</span></footer></article>`;
}

export function renderSources(item,catalog) {
  if (!item.sources.length) return '<div class="referral-source-unavailable">尚未找到可確認的現行推薦人返佣資料，因此保留「待查證」，不推估比例。</div>';
  return `<div class="referral-source-links">${item.sources.map(url => {
    const entry = catalog?.sources?.find(source => source.url === url);
    const title = entry?.label || url;
    const host = new URL(url).hostname;
    return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHTML(title)}（另開分頁）"><span class="referral-document-icon">${icon('book')}</span><span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(host)} · 官方網站</small></span>${icon('external')}</a>`;
  }).join('')}</div>${catalog ? '' : '<p class="referral-catalog-notice">文章名稱暫時無法載入，先顯示完整來源網址。</p>'}`;
}

export function matchesExchange(item,query) {
  return (item.name+' '+item.id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

function mount() {
  window.ResearchShell.mount({active:'referral'});
  const byId = id => document.getElementById(id);
  let current = null;
  let catalog = null;
  let visible = [];
  const mobile = window.matchMedia('(max-width:700px)');
  let view = mobile.matches ? 'cards' : 'table';
  let chosenView = false;
  let sourceTrigger = null;
  function updateScrollHint() {
    const scroller = byId('referral-table-scroll');
    byId('referral-scroll-hint').hidden = view !== 'table' || !visible.length || scroller.scrollWidth <= scroller.clientWidth + 1;
  }
  function applyView() {
    byId('referral-table-scroll').hidden = view !== 'table' || (current && !visible.length);
    byId('referral-cards').hidden = view !== 'cards' || !visible.length;
    updateScrollHint();
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.view === view)));
  }
  function render() {
    if (!current) return;
    visible = current.exchanges.filter(item => matchesExchange(item,byId('exchange-search').value));
    byId('referral-rows').innerHTML = visible.map(renderRow).join('');
    byId('referral-cards').innerHTML = visible.map(renderCard).join('');
    byId('referral-empty').hidden = visible.length > 0;
    byId('referral-count').textContent = `顯示 ${visible.length} / ${current.exchanges.length} 家交易所`;
    applyView();
  }
  function openSources(item,trigger) {
    sourceTrigger = trigger;
    byId('referral-dialog-brand').innerHTML = `<div class="exchange-brand">${brand(item)}</div>`;
    byId('referral-source-title').textContent = `${item.name} 的${item.sources.length ? '官方資料' : '資料狀態'}`;
    byId('referral-source-description').textContent = item.sources.length
      ? '以下文件是這家交易所整列資料的來源。推薦計畫與 Affiliate 合作的適用條件不同，請以原文為準。'
      : '尚未取得足夠的官方資料。以下保留目前的收錄狀態，供你辨識資訊缺口。';
    byId('referral-dialog-links').innerHTML = renderSources(item,catalog);
    byId('referral-dialog-values').innerHTML = FIELDS.map(field => `<div><dt>${FIELD_LABELS[field]}</dt><dd>${pending(item[field])}</dd></div>`).join('');
    byId('referral-dialog-date').textContent = current.baseline_date;
    byId('referral-dialog-date').dateTime = current.baseline_date;
    byId('referral-source-dialog').showModal();
    byId('referral-source-close').focus();
  }
  async function load() {
    byId('referral-error').hidden = true;
    byId('referral-table-scroll').setAttribute('aria-busy','true');
    byId('referral-retry').disabled = true;
    try {
      const [response,sourceCatalog] = await Promise.all([
        fetch('./referral.json',{cache:'no-cache'}),
        fetch('./referral-sources.json',{cache:'no-cache'}).then(response => response.ok ? response.json() : null).catch(() => null)
      ]);
      if (!response.ok) throw new Error('Load failed');
      current = validateReferral(await response.json());
      catalog = sourceCatalog && Array.isArray(sourceCatalog.sources) ? sourceCatalog : null;
      for (const id of ['referral-baseline','referral-footer-date']) {byId(id).textContent = current.baseline_date;byId(id).dateTime = current.baseline_date;}
      byId('referral-total').textContent = current.exchanges.length;
      byId('exchange-search').disabled = false;
      render();
    } catch (_) {
      byId('referral-error').hidden = false;
      byId('referral-count').textContent = '資料尚未載入';
    } finally {
      byId('referral-table-scroll').setAttribute('aria-busy','false');
      byId('referral-retry').disabled = false;
    }
  }
  byId('exchange-search').addEventListener('input',render);
  byId('referral-clear').addEventListener('click',() => {byId('exchange-search').value = '';render();byId('exchange-search').focus();});
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',() => {chosenView = true;view = button.dataset.view;applyView();}));
  mobile.addEventListener('change',() => {if (!chosenView) {view = mobile.matches ? 'cards' : 'table';applyView();}});
  new ResizeObserver(updateScrollHint).observe(byId('referral-table-scroll'));
  byId('referral-comparison').addEventListener('click',event => {
    const trigger = event.target.closest('[data-source]');
    if (!trigger || !current) return;
    const item = current.exchanges.find(item => item.id === trigger.dataset.source);
    if (item) openSources(item,trigger);
  });
  byId('referral-source-close').addEventListener('click',() => byId('referral-source-dialog').close());
  byId('referral-source-dialog').addEventListener('close',() => sourceTrigger?.focus());
  byId('referral-retry').addEventListener('click',load);
  applyView();
  load();
}
if (typeof document !== 'undefined') mount();
