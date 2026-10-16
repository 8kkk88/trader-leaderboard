'use strict';

// Query routes work on GitHub Pages without a server rewrite or a framework.
const VIEWS = {
  leaderboard:{name:'排行榜',title:'交易員排行榜',eyebrow:'SOLANA · 資料來源 BIRDEYE · 每日更新',description:'在本批樣本內篩選、排序與對比。',icon:'board'},
  compare:{name:'交易員對比',title:'交易員對比',eyebrow:'同一份快照，兩個視角',description:'並排比較已實現收益、帳面損益與交易紀錄。',icon:'compare'},
  research:{name:'每週研究',title:'每週研究',eyebrow:'把數據變成有依據的觀點',description:'從本週問題開始，查證、記錄，再與其他人討論。',icon:'note'},
  guide:{name:'資料說明',title:'資料與方法',eyebrow:'看懂數據，也看懂限制',description:'了解樣本範圍、計算方式與分享時應保留的證據。',icon:'book'}
};
let currentView = 'leaderboard';

function viewFromURL() {
  const view = new URLSearchParams(location.search).get('view');
  if (Object.hasOwn(VIEWS,view)) return view;
  // Previously shared single-page anchors remain valid entry points.
  if (location.hash === '#wallet-compare') return 'compare';
  if (location.hash === '#research') return 'research';
  return 'leaderboard';
}

function viewURL(view) {
  let url;
  if (DATA) {
    url = new URL(researchLink({section:view === 'leaderboard' ? 'leaderboard' : view === 'research' ? 'research' : 'wallet-compare'}));
    url.searchParams.set('view',view);
    if (PAGE > 1) url.searchParams.set('page',String(PAGE));
  } else {
    url = new URL(location.href);
    url.searchParams.set('view',view);
  }
  url.hash = '';
  return url.href;
}

function renderProduct() {
  const view = VIEWS[currentView];
  document.documentElement.dataset.view = currentView;
  document.title = (currentView==='leaderboard'?'Solana 已實現收益榜':view.title)+'｜落袋研究室';
  $('page-title').textContent = view.heading || view.title;
  $('page-eyebrow').textContent = view.eyebrow;
  $('page-description').textContent = view.description;
  $('workspace-heading').hidden = currentView === 'leaderboard';
  $('board').setAttribute('aria-labelledby',currentView === 'leaderboard' ? 'home-board-title' : 'page-title');
  for (const link of document.querySelectorAll('[data-home-anchor]')) link.href=currentView==='leaderboard'?'#'+link.dataset.homeAnchor:'./index.html#'+link.dataset.homeAnchor;
  for (const panel of document.querySelectorAll('[data-view-panel]')) panel.hidden = panel.dataset.viewPanel !== currentView;
  for (const link of document.querySelectorAll('[data-route]')) {
    const route = link.dataset.route;
    if (!Object.hasOwn(VIEWS,route)) continue;
    link.href = viewURL(route);
    if (link.closest('.product-navigation') && route === currentView) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  const selected = COMPARE.filter(Boolean).length;
  for (const count of document.querySelectorAll('[data-compare-count]')) {count.textContent = String(selected);count.hidden = selected === 0;}
  $('compare-onboarding').hidden = selected > 0;
  const needsData = !DATA && ['compare','research'].includes(currentView);
  $('product-state').hidden = !needsData;
  if (needsData) $('product-state').innerHTML = refreshFailed ? '<h2>暫時無法讀取資料</h2><p>研究工作區需要有效快照，請稍後重試。</p><button type="button" class="button" data-retry>重新讀取</button>' : '<span class="loading-dot" aria-hidden="true"></span><h2>正在讀取資料快照</h2><p>資料可用後顯示這個工作區。</p>';
  if (needsData) $(currentView+'-view').hidden = true;
  if (DATA && $('guide-insight')) $('guide-insight').textContent = DATA.insight?.[TAB] || '上游未提供本期解讀。';
  if (DATA && $('guide-period')) $('guide-period').textContent = PERIODS[TAB]+'・上游原文僅供對照';
}

function setView(view,{push=true,focus=true} = {}) {
  if (!Object.hasOwn(VIEWS,view)) return;
  if (push && view !== currentView) {
    // Save the current controls and scroll position before leaving this page.
    history.replaceState({scroll:window.scrollY},'',viewURL(currentView));
    history.pushState({scroll:0},'',viewURL(view));
    shareParams = new URLSearchParams(location.search);
  }
  currentView = view;
  $('research-status').textContent = '';
  renderProduct();
  if (DATA) renderShareNotice();
  if (focus) {$(currentView==='leaderboard'?'home-title':'page-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}

function initProduct() {
  window.ResearchShell.mount({active:'leaderboard',localRoutes:true});
  // Reuse the locally-authored method document; never inject API text as HTML.
  const methods = document.querySelector('#method-dialog .method-body').cloneNode(true);
  const insight = methods.querySelector('#source-insight');
  insight.id = 'guide-insight';
  const period = document.createElement('p');period.id = 'guide-period';period.className = 'reading-note';
  insight.before(period);
  $('guide-content').append(methods);
  currentView = viewFromURL();renderProduct();
  document.addEventListener('click',event => {
    const link = event.target.closest('a[data-route]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();setView(link.dataset.route);
  });
  document.querySelector('.skip').addEventListener('click',event => {event.preventDefault();$(currentView==='leaderboard'?'home-title':'page-title').focus();window.scrollTo({top:0,behavior:'instant'});});
  window.addEventListener('popstate',() => {
    const scroll = history.state?.scroll || 0;
    shareParams = new URLSearchParams(location.search);restoredShare = false;
    if (DATA) {restoreResearchShare();syncComparePeriod();render();}
    setView(viewFromURL(),{push:false,focus:false});
    $(currentView==='leaderboard'?'home-title':'page-title').focus({preventScroll:true});window.scrollTo({top:scroll,behavior:'instant'});
  });
  // Old section links now open a complete page, starting at its heading.
  if (['#research','#wallet-compare'].includes(location.hash)) requestAnimationFrame(() => window.scrollTo(0,0));
}
