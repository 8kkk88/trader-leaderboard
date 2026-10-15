const FIELDS = ['spot','futures','tiers','notes'];
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

export function renderRow(item) {
  const sourceLinks = item.sources.map((url,index) => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHTML(item.name)} 官方來源${item.sources.length > 1 ? ' '+(index+1) : ''}（另開分頁）">官網${item.sources.length > 1 ? ' '+(index+1) : ''} ↗</a>`).join('');
  const cells = FIELDS.map(field => {
    const value = escapeHTML(item[field]).replaceAll('待查證','<span class="referral-pending">待查證</span>');
    return `<td${['spot','futures'].includes(field) ? ' class="referral-rate"' : ''}><p class="referral-value">${value}</p>${sourceLinks ? `<div class="referral-source-links">${sourceLinks}</div>` : ''}</td>`;
  }).join('');
  return `<tr data-exchange="${escapeHTML(item.id)}"><th scope="row">${escapeHTML(item.name)}${!item.verified ? '<span class="referral-row-status">待查證</span>' : ''}</th>${cells}</tr>`;
}

export function matchesExchange(item,query) {
  return (item.name+' '+item.id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

function mount() {
  window.ResearchShell.mount({active:'referral'});
  const byId = id => document.getElementById(id);
  let current = null;
  function render() {
    const visible = current.exchanges.filter(item => matchesExchange(item,byId('exchange-search').value));
    byId('referral-rows').innerHTML = visible.length ? visible.map(renderRow).join('') : '<tr><td colspan="5">找不到符合的交易所，試試其他名稱。</td></tr>';
    byId('referral-count').textContent = `顯示 ${visible.length} / ${current.exchanges.length} 家交易所`;
  }
  async function load() {
    byId('referral-error').hidden = true;
    byId('referral-table-scroll').setAttribute('aria-busy','true');
    byId('referral-retry').disabled = true;
    try {
      const response = await fetch('./referral.json',{cache:'no-cache'});
      if (!response.ok) throw new Error('Load failed');
      current = validateReferral(await response.json());
      for (const id of ['referral-baseline','referral-footer-date']) {byId(id).textContent = current.baseline_date;byId(id).dateTime = current.baseline_date;}
      byId('referral-lede').textContent = `${current.exchanges.length} 家交易所推薦返佣比例，全部來自官網公開資訊，查不到就標待查證。`;
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
  byId('referral-retry').addEventListener('click',load);
  load();
}
if (typeof document !== 'undefined') mount();
