import {escapeHtml,safeUrl,external,renderBlocks} from './learn-render.js?v=2';
import {renderWidget,mountWidgets} from './learn-widgets.js?v=2';
export {escapeHtml,safeUrl};
const STORAGE_KEY = 'research-learning-v1';
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${escapeHtml(name)}"/></svg>`;
export function parseRoute(hash, data) {
  const [part, query = ''] = hash.replace(/^#/, '').split('?');
  const [kind, id] = part.split('/');
  const path = data.paths.find(item => item.id === new URLSearchParams(query).get('path'));
  if (kind === 'lesson') return {view: data.lessons.some(item => item.id === id) ? 'lesson' : 'missing', id, path: path?.lessons.includes(id) ? path.id : null};
  if (kind === 'path') return data.paths.some(item => item.id === id) ? {view:'home', path:id} : {view:'missing'};
  return {view:'home',path:null};
}
export function sanitizeProgress(raw, data) {
  const valid = new Set(data.lessons.map(item => item.id));
  return {done: [...new Set(Array.isArray(raw?.done) ? raw.done.filter(id => valid.has(id)) : [])],last:valid.has(raw?.last) ? raw.last : null};
}
export function selectLessons(data, {query='', category='', path=null}={}) {
  const route = data.paths.find(item => item.id === path);
  const list = route ? route.lessons.map(id => data.lessons.find(item => item.id === id)) : data.lessons;
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return list.filter(item => (!category || item.category === category) && words.every(word => `${item.title} ${item.description} ${item.category} ${item.takeaway} ${item.sections.map(s => s.title + ' ' + (s.text || s.paragraphs.join(' '))).join(' ')}`.toLocaleLowerCase().includes(word)));
}
export function validateContent(data) {
  if (!Array.isArray(data?.lessons) || !data.lessons.length || !Array.isArray(data.paths)) throw new Error('Missing content');
  const ids = new Set();
  for (const item of data.lessons) {
    if (!/^[a-z][a-z0-9-]+$/.test(item.id) || ids.has(item.id) || !item.title || !item.category || !item.sections?.length || !item.sources?.length || !item.tool?.url) throw new Error('Invalid lesson');
    if (item.sections.some(s => !s.title || !Array.isArray(s.paragraphs) || s.paragraphs.some(p => typeof p !== 'string'))) throw new Error('Invalid section');
    ids.add(item.id);
  }
  if (new Set(data.paths.map(p => p.id)).size !== data.paths.length || data.paths.some(p => !/^[a-z-]+$/.test(p.id) || !p.lessons?.length || p.lessons.some(id => !ids.has(id)))) throw new Error('Invalid path');
  return data;
}

async function init() {
  window.ResearchShell.mount({active:'learn'});
  const $ = id => document.getElementById(id);
  document.querySelector('.skip').addEventListener('click',event => {
    event.preventDefault();const main = $('main-content');main.tabIndex = -1;main.focus();main.scrollIntoView({block:'start'});
  });
  $('learn-retry').addEventListener('click', () => location.reload());
  let data;
  try {const response = await fetch('./learn-content.json?v=2');if (!response.ok) throw new Error('Fetch failed');data = validateContent(await response.json());}
  catch { $('learn-loading').hidden = true;$('learn-error').hidden = false;return; }
  let progress, storageAvailable = true;
  try {progress = sanitizeProgress(JSON.parse(localStorage.getItem(STORAGE_KEY)),data);} catch {progress = sanitizeProgress(null,data);storageAvailable = false;}
  let filter = {query:'',category:'',path:null};
  let current = null;
  let homeScroll = 0;
  const save = () => {try {localStorage.setItem(STORAGE_KEY,JSON.stringify(progress));storageAvailable = true;} catch {storageAvailable = false;}};
  const href = (id,path=null) => `#lesson/${id}${path ? '?path='+path : ''}`;
  const lessonLink = (item,path) => `<a class="learn-card" href="${href(item.id,path)}"><span class="learn-card-icon">${icon(item.icon)}</span><div><div class="learn-card-meta"><span>${item.chapter ? `CH. ${item.chapter} · ` : ''}${escapeHtml(item.category)}</span>${progress.done.includes(item.id) ? '<span class="learn-done">✓ 已讀</span>' : ''}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></div>${icon('right')}</a>`;
  function renderCatalog() {
    const list = selectLessons(data,filter);
    $('learn-cards').innerHTML = list.map(item => lessonLink(item,filter.path)).join('');
    $('learn-empty').hidden = Boolean(list.length);
    const path = data.paths.find(item => item.id === filter.path);
    $('learn-result-count').textContent = `${path ? path.title+' · ' : ''}${list.length} 篇文章`;
    $('learn-filters').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(!filter.path && button.dataset.category === filter.category)));
  }
  function renderProgress() {
    $('learn-progress-copy').textContent = `已讀 ${progress.done.length} / ${data.lessons.length} 篇 · ${storageAvailable ? '進度保存在此瀏覽器' : '本次進度無法永久儲存'}`;
    $('learn-progress').max = data.lessons.length;$('learn-progress').value = progress.done.length;
    const next = progress.last && !progress.done.includes(progress.last) ? data.lessons.find(l => l.id === progress.last) : data.lessons.find(l => !progress.done.includes(l.id));
    $('learn-continue').href = next ? href(next.id) : '#catalog';
    $('learn-continue').innerHTML = `${next ? (progress.last || progress.done.length ? '繼續閱讀' : '開始閱讀') : '回顧文章'} <span aria-hidden="true">→</span>`;
  }
  $('learn-course-count').textContent = `${data.lessons.filter(l=>l.chapter).length} 章完整課程 · ${data.lessons.filter(l=>!l.chapter).length} 篇本站指南`;
  $('learn-paths').innerHTML = data.paths.map(path => `<a class="learn-path learn-tone-${escapeHtml(path.tone)}" href="#path/${path.id}"><span class="learn-path-icon">${icon(path.icon)}</span><h3>${escapeHtml(path.title)}</h3><p>${escapeHtml(path.description)}</p><span class="learn-path-footer"><span>${path.lessons.length} 篇建議閱讀 · 依序探索</span>${icon('right')}</span></a>`).join('');
  $('learn-filters').innerHTML = ['全部主題',...new Set(data.lessons.map(l => l.category))].map((label,index) => `<button type="button" data-category="${index ? escapeHtml(label) : ''}" aria-pressed="${!index}">${label}</button>`).join('');
  $('learn-filters').addEventListener('click',event => {const button = event.target.closest('button');if (!button) return;filter.category = button.dataset.category;filter.path = null;history.replaceState(null,'','#catalog');renderCatalog();});
  $('learn-search').addEventListener('input',event => {filter.query = event.target.value;renderCatalog();});
  $('learn-clear').addEventListener('click',() => {filter = {query:'',category:'',path:null};$('learn-search').value = '';history.replaceState(null,'','#catalog');renderCatalog();$('learn-search').focus();});
  function renderReader(route) {
    const item = data.lessons.find(l => l.id === route.id);
    const path = data.paths.find(p => p.id === route.path);
    const sequence = path ? path.lessons.map(id => data.lessons.find(l => l.id === id)) : data.lessons;
    const index = sequence.findIndex(l => l.id === item.id);
    const prev = sequence[index-1], next = sequence[index+1];
    const back = path ? '#path/'+path.id : '#catalog';
    $('learn-reader').innerHTML = `<nav class="learn-breadcrumb" aria-label="閱讀位置"><a href="#catalog">學習中心</a><span aria-hidden="true">/</span><span>${escapeHtml(item.category)}</span></nav><div class="learn-reader-grid"><aside class="learn-sidebar"><h2>${path ? escapeHtml(path.title) : '閱讀目錄'}</h2><nav aria-label="章節目錄">${sequence.map((l,i) => `<a href="${href(l.id,path?.id)}"${l.id === item.id ? ' aria-current="page"' : ''}><span>${progress.done.includes(l.id) ? '✓' : String(i+1).padStart(2,'0')}</span><span>${escapeHtml(l.title)}</span></a>`).join('')}</nav></aside><article class="learn-reader-article"><div class="learn-reader-mobile-nav"><label for="learn-chapter">閱讀目錄</label><select id="learn-chapter">${sequence.map(l => `<option value="${l.id}"${l.id === item.id ? ' selected' : ''}>${escapeHtml(l.title)}</option>`).join('')}</select></div><header class="learn-reader-heading"><p class="learn-eyebrow">${escapeHtml(item.category)} / FIELD NOTES</p><h1 tabindex="-1">${escapeHtml(item.title)}</h1><p>${escapeHtml(item.description)}</p><div class="learn-reader-meta"><span>${escapeHtml(data.editor)} ${item.origin ? '繁中改編' : '原創整理'}</span><span>校閱 <time datetime="${escapeHtml(data.reviewed_at)}">${escapeHtml(data.reviewed_at)}</time></span></div>${item.origin ? `<p class="learn-attribution">授權改編自 <a href="${escapeHtml(safeUrl(item.origin.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.origin.author)} · ${escapeHtml(item.origin.title)} ↗</a></p>` : ''}</header><aside class="learn-takeaway"><strong>先記住這件事</strong><p>${escapeHtml(item.takeaway)}</p></aside><details class="learn-contents"><summary>這篇會讀到</summary><ul>${item.sections.map((s,i) => `<li><a href="${href(item.id,path?.id)}${path ? '&' : '?'}section=${i}">${escapeHtml(s.title)}</a></li>`).join('')}</ul></details>${item.sections.map((section,i) => `<section class="learn-article-section" id="lesson-section-${i}"><h2>${escapeHtml(section.title)}</h2><div class="learn-prose">${section.blocks ? renderBlocks(section.blocks,kind=>renderWidget(kind,data)) : section.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')}</div></section>`).join('')}<aside class="learn-practice"><h2>${icon('note')}讀完，試著做一件事</h2><p>${escapeHtml(item.practice)}</p><a href="${escapeHtml(safeUrl(item.tool.url))}"${external(item.tool.url)}>${escapeHtml(item.tool.label)} ${icon('right')}</a></aside><section class="learn-sources"><h2>來源與延伸閱讀</h2>${item.sources.map(source => `<a href="${escapeHtml(safeUrl(source.url))}"${external(source.url)}><span>${escapeHtml(source.title)}<small>${source.url.startsWith('https://') ? escapeHtml(new URL(source.url).hostname) : '落袋研究室 · 本站資料'}</small></span>${icon('external')}</a>`).join('')}</section><div class="learn-completion"><button class="button primary" id="learn-mark" aria-pressed="${progress.done.includes(item.id)}">${progress.done.includes(item.id) ? '✓ 已標記讀完' : '標記為已讀'}</button><p>${storageAvailable ? '只記錄在此瀏覽器，不需要登入。' : '瀏覽器無法儲存進度，目前只在本次閱讀保留。'}<br>再次點擊可取消已讀。</p></div><nav class="learn-pagination" aria-label="上一篇與下一篇"><a href="${prev ? href(prev.id,path?.id) : back}"><small>← ${prev ? '上一篇' : '返回'}</small>${prev ? escapeHtml(prev.title) : '學習目錄'}</a><a href="${next ? href(next.id,path?.id) : back}"><small>${next ? '下一篇' : '這條路線已到最後'} →</small>${next ? escapeHtml(next.title) : '回目錄，選下一個主題'}</a></nav></article></div>`;
    const diagram = item.illustration;
    if (diagram) {
      const figure = document.createElement('figure');figure.className = 'learn-diagram';
      figure.innerHTML = `<img src="./assets/learn/${diagram.file}.svg" width="600" height="${diagram.height || 448}" alt="${escapeHtml(diagram.alt)}"><figcaption>${escapeHtml(diagram.caption)} · 落袋研究室原創製圖</figcaption><details><summary>閱讀圖解文字</summary><p>${escapeHtml(diagram.alt)}</p></details>`;
      $('learn-reader').querySelector('.learn-takeaway').after(figure);
    }
    if (item.id === 'glossary') {
      const box=document.createElement('div');box.className='learn-glossary-search';
      box.innerHTML='<label for="glossary-search">查一個名詞</label><input id="glossary-search" type="search" placeholder="例如 FDV、Gas、滑價" autocomplete="off"><p id="glossary-status" role="status" aria-live="polite">輸入關鍵字，篩選下方詞條。</p>';
      $('learn-reader').querySelector('.learn-contents').after(box);
    }
    mountWidgets($('learn-reader'),data);
    $('learn-chapter').addEventListener('change',event => {location.hash = href(event.target.value,path?.id);});
    $('learn-mark').addEventListener('click',() => {const done = progress.done.includes(item.id);progress.done = done ? progress.done.filter(id => id !== item.id) : [...progress.done,item.id];save();$('learn-mark').textContent = done ? '標記為已讀' : '✓ 已標記讀完';$('learn-mark').setAttribute('aria-pressed',String(!done));$('learn-announcement').textContent = `${done ? '已取消已讀' : '已記錄閱讀進度'}${storageAvailable ? '' : '，目前僅保留於本次瀏覽'}`;renderProgress();const active=$('learn-reader').querySelector('.learn-sidebar [aria-current=page] span');if(active)active.textContent=done?String(index+1).padStart(2,'0'):'✓';});
    document.title = `${item.title}｜落袋研究室`;
  }
  function navigate(initial=false) {
    const route = parseRoute(location.hash,data);
    if (current?.view === 'home' && route.view !== 'home') homeScroll = window.scrollY;
    $('learn-home').hidden = route.view !== 'home';$('learn-reader').hidden = route.view === 'home';
    if (route.view === 'lesson') {
      const changed = current?.id !== route.id || current?.path !== route.path;
      progress.last = route.id;save();
      if (changed) renderReader(route);
      const section = new URLSearchParams(location.hash.split('?')[1] || '').get('section');
      const target = section !== null && /^\d+$/.test(section) ? document.getElementById('lesson-section-'+section) : null;
      if (target) {target.scrollIntoView({block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
      else if (changed) {window.scrollTo(0,0);if (!initial) $('learn-reader').querySelector('h1').focus({preventScroll:true});}
    } else if (route.view === 'home') {
      if (route.path && current?.path !== route.path) {filter = {query:'',category:'',path:route.path};$('learn-search').value = '';}
      else if (!route.path && filter.path) filter.path = null;
      renderCatalog();renderProgress();document.title = 'Web3 學習中心｜落袋研究室';
      if (location.hash === '#catalog' || route.path) {$('catalog').scrollIntoView({block:'start'});if (!initial && (current?.view === 'lesson' || route.path)) {$('catalog-title').tabIndex = -1;$('catalog-title').focus({preventScroll:true});}}
      else if (current?.view === 'lesson') window.scrollTo(0,homeScroll);
    } else {
      $('learn-reader').innerHTML = '<div class="learn-not-found"><h1 tabindex="-1">這篇文章還不在目錄裡</h1><p>連結可能有誤，回到目錄選一篇繼續閱讀。</p><a class="button primary" href="#catalog">返回學習目錄</a></div>';document.title = '找不到文章｜落袋研究室';window.scrollTo(0,0);if (!initial) $('learn-reader').querySelector('h1').focus();
    }
    current = route;
  }
  window.addEventListener('hashchange',() => navigate());
  $('learn-loading').hidden = true;navigate(true);
}
if (typeof document !== 'undefined') init();
