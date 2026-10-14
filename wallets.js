'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const gradeLabels = {A:'官方一手', B:'權威第三方', C:'一般第三方'};
  const fallbackHints = {
    solana:'查看是否支援 Solana；不同裝置與功能請展開確認。',
    bridge:'查看內建或整合的跨鏈橋與服務提供方式。',
    staking:'查看內建質押或接入的協議，展開確認限制。',
    hardware:'查看硬體品牌與連線方式；觀察模式不等於直接連接簽名。',
    opensource:'查看開源範圍；部分模組公開不代表整個 App 開源。',
    key_mgmt:'查看助記詞、登入、密鑰管理與恢復方式。'
  };
  let data, tier = 'mainstream', sortKey = null, direction = 1;
  const collator = new Intl.Collator('zh-Hant', {numeric:true});
  function node(tag, text, cls) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  }
  function isUnknown(value) {return /官網未揭露|待查證/.test(value.d);}
  function numericValue(value, key) {
    if (['audit','incidents','rewards','key_mgmt','opensource'].includes(key)) return null;
    const text = value.d.trim();
    if (key === 'swap_fee') {
      if (/目前不收/.test(text)) return 0;
      const range = text.match(/^(\d+(?:\.\d+)?)%[–—-](\d+(?:\.\d+)?)%/);
      if (range) return Number(range[2]);
      const fee = text.match(/^(\d+(?:\.\d+)?)%/);
      return fee ? Number(fee[1]) : null;
    }
    const number = text.match(/^(\d+(?:\.\d+)?)\+?(?:\s*(?:款|家|份報告|選項))?$/);
    return number ? Number(number[1]) : null;
  }
  function compareWallets(a,b) {
    if (!sortKey) return 0;
    const av = a.values[sortKey], bv = b.values[sortKey];
    if (isUnknown(av) !== isUnknown(bv)) return isUnknown(av) ? 1 : -1;
    const an = numericValue(av,sortKey), bn = numericValue(bv,sortKey);
    // Numeric and textual groups stay separate, giving a transitive sort for mixed columns.
    if ((an === null) !== (bn === null)) return an === null ? 1 : -1;
    const order = an !== null ? an-bn : collator.compare(av.d,bv.d);
    return direction*order || collator.compare(a.name,b.name);
  }
  function buildHeader() {
    const row = node('tr');
    const name = node('th','錢包');name.scope = 'col';row.append(name);
    for (const dim of data.dimensions) {
      const th = node('th');th.scope = 'col';th.dataset.key = dim.key;
      const button = node('button',undefined,'sort-button');button.type = 'button';
      button.append(node('span',dim.label),node('span','↕','sort-arrow'));
      button.addEventListener('click',() => {
        direction = sortKey === dim.key ? -direction : 1;sortKey = dim.key;render();
      });
      const hint = dim.hint || fallbackHints[dim.key] || '展開查看公開資料與適用範圍。';
      const help = node('details',undefined,'dim-help');const summary = node('summary','說明 ⓘ');summary.title = hint;
      help.append(summary,node('p',hint));th.append(button,help);row.append(th);
    }
    $('wallet-head').replaceChildren(row);
  }
  function render() {
    const wallets = data.wallets.filter(w => tier === 'all' || w.tier === 1).slice().sort(compareWallets);
    const fragment = document.createDocumentFragment();
    for (const wallet of wallets) {
      const row = node('tr');row.dataset.wallet = wallet.id;
      const heading = node('th');heading.scope = 'row';heading.id = 'wallet-'+wallet.id;
      const name = node('a');name.href = '#wallet-'+wallet.id;name.append(node('strong',wallet.name),node('small',`Tier ${wallet.tier}${wallet.alias ? ' · '+wallet.alias : ''}`));heading.append(name);row.append(heading);
      for (const dim of data.dimensions) {
        const value = wallet.values[dim.key];const cell = node('td');cell.dataset.key = dim.key;
        const details = node('details',undefined,'wallet-cell'+(isUnknown(value) ? ' unknown' : ''));
        const summary = node('summary');summary.setAttribute('aria-label',`${wallet.name}，${dim.label}：${value.d}，展開詳細說明`);
        const grade = node('span',value.g,'grade grade-'+value.g.toLowerCase());grade.title = gradeLabels[value.g];grade.setAttribute('aria-label',gradeLabels[value.g]);
        const plus = node('span','+','cell-expand');plus.setAttribute('aria-hidden','true');
        summary.append(node('span',value.d,'cell-display'),grade,plus);
        details.append(summary,node('p',value.t || '附件未提供補充說明；請以顯示值為準。'));cell.append(details);row.append(cell);
      }
      fragment.append(row);
    }
    $('wallet-rows').replaceChildren(fragment);
    for (const th of $('wallet-head').querySelectorAll('[data-key]')) {
      const active = th.dataset.key === sortKey;
      if (active) th.setAttribute('aria-sort',direction === 1 ? 'ascending' : 'descending');else th.removeAttribute('aria-sort');
      th.querySelector('.sort-arrow').textContent = active ? (direction === 1 ? '↑' : '↓') : '↕';
      th.querySelector('button').setAttribute('aria-label',`${th.querySelector('button span').textContent}，點擊${active && direction === 1 ? '降冪' : '升冪'}排序`);
    }
    $('result-count').textContent = `顯示 ${wallets.length} / ${data.wallets.length} 個錢包`;
    $('sort-status').textContent = sortKey ? `${data.dimensions.find(d => d.key === sortKey).label} · ${direction === 1 ? '升冪' : '降冪'}${['incidents','audit'].includes(sortKey) ? '（文字排序，非安全排名）' : ''}` : '依附件順序顯示';
  }
  function recommend(form) {
    const experience = form.get('experience'), chain = form.get('chain'), hardware = form.get('hardware');
    const candidates = data.wallets.filter(wallet => {
      const values = wallet.values;
      if (chain !== 'evm' && values[chain].d !== '是') return false;
      // Every supplied wallet explicitly lists Ethereum / ETH / EVM in its own data.
      if (chain === 'evm' && !Object.values(values).some(v => /\bETH\b|Ethereum|EVM/.test(v.d+' '+v.t))) return false;
      if (hardware === 'yes' && (/^無|未揭露|待查證/.test(values.hardware.d) || !values.hardware.d)) return false;
      return true;
    }).map(wallet => {
      const values = wallet.values;
      const easierLogin = /社交登入|Google|Apple|MPC/.test(values.key_mgmt.d+' '+values.key_mgmt.t);
      const fullyOpen = /^是/.test(values.opensource.d);
      const score = (experience === 'new' ? (easierLogin ? 3 : 0) : (fullyOpen ? 3 : 0)) + (wallet.tier === 1 ? 1 : 0);
      const parts = [chain === 'evm' ? '附件列有 Ethereum／EVM 使用方式' : `支援 ${chain === 'solana' ? 'Solana' : 'Bitcoin'}`];
      if (experience === 'new' && easierLogin) parts.push(`密鑰／登入方式為「${values.key_mgmt.d}」`);
      else if (experience === 'advanced' && fullyOpen) parts.push(`開源欄標示「${values.opensource.d}」`);
      else parts.push(`密鑰方式為「${values.key_mgmt.d}」`);
      if (hardware === 'yes') parts.push(`硬體支援標示「${values.hardware.d}」，請確認型號與平台`);
      return {wallet,score,reason:parts.join('；')+'。'};
    }).sort((a,b) => b.score-a.score || data.wallets.indexOf(a.wallet)-data.wallets.indexOf(b.wallet)).slice(0,2);
    const result = $('quiz-results');result.replaceChildren();
    if (!candidates.length) {result.append(node('p','目前附件沒有符合所有條件的錢包，請調整需求或查閱對照表。'));return;}
    result.append(node('p','可以先研究這些錢包：','muted'));
    for (const {wallet,reason} of candidates) {
      const article = node('article',undefined,'recommendation');const link = node('a','到表格查看完整資料 →');link.href = '#wallet-'+wallet.id;
      link.addEventListener('click',() => {
        tier = 'all';updateTier();render();
        $('table-scroll').scrollLeft = 0;
      });
      article.append(node('h3',wallet.name),node('p',reason),link);result.append(article);
    }
  }
  function updateTier() {for (const button of document.querySelectorAll('[data-tier]')) button.setAttribute('aria-pressed',String(button.dataset.tier === tier));}
  function validate(raw) {
    if (!raw || !Array.isArray(raw.wallets) || !raw.wallets.length || !Array.isArray(raw.dimensions) || !raw.dimensions.length || !/^\d{4}-\d{2}-\d{2}$/.test(raw.updated_at) || typeof raw.disclaimer !== 'string' || typeof raw.baseline_note !== 'string') throw Error('資料結構不完整');
    const keys = raw.dimensions.map(d => d.key), ids = raw.wallets.map(w => w.id);
    if (new Set(keys).size !== keys.length || new Set(ids).size !== ids.length || raw.dimensions.some(d => typeof d.label !== 'string' || typeof d.hint !== 'string')) throw Error('欄位不完整或重複');
    if (raw.wallets.some(w => !/^[a-z][a-z0-9-]*$/.test(w.id) || typeof w.name !== 'string' || typeof w.alias !== 'string' || ![1,2].includes(w.tier) || keys.some(key => !w.values?.[key] || typeof w.values[key].d !== 'string' || typeof w.values[key].t !== 'string' || !gradeLabels[w.values[key].g]))) throw Error('錢包欄位不完整');
    return raw;
  }
  async function load() {
    $('load-error').hidden = true;$('table-scroll').setAttribute('aria-busy','true');
    try {
      const response = await fetch('./wallets.json', {cache:'no-cache', signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw Error('HTTP '+response.status);
      data = validate(await response.json());
      $('baseline').textContent = data.updated_at;$('baseline').dateTime = data.updated_at;
      $('coverage').textContent = `${data.wallets.length} 個錢包 × ${data.dimensions.length} 個維度`;
      const tiers = [...new Set(data.wallets.map(w => w.tier))].sort();
      document.querySelector('[data-tier="mainstream"]').textContent = `Tier ${tiers[0]} 主流（${data.wallets.filter(w => w.tier === tiers[0]).length}）`;
      document.querySelector('[data-tier="all"]').textContent = `全部（${data.wallets.length}）`;
      $('baseline-note').textContent = data.baseline_note;$('disclaimer').textContent = data.disclaimer;
      buildHeader();render();
      for (const button of document.querySelectorAll('[data-tier], #recommend')) button.disabled = false;
    } catch (error) {
      $('load-error').hidden = false;$('result-count').textContent = '尚未載入資料';
      $('load-error').querySelector('p').textContent = '資料暫時無法讀取或格式不完整，請重新讀取。';
    } finally {$('table-scroll').setAttribute('aria-busy','false');}
  }
  for (const button of document.querySelectorAll('[data-tier]')) button.addEventListener('click',() => {tier = button.dataset.tier;updateTier();render();});
  $('quiz-form').addEventListener('submit',event => {event.preventDefault();if (data) recommend(new FormData(event.target));});
  $('quiz-form').addEventListener('reset',() => $('quiz-results').replaceChildren());
  $('retry').addEventListener('click',load);
  load();
})();
