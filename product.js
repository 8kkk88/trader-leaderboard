'use strict';

// Query routes work on GitHub Pages without a server rewrite or a framework.
const VIEWS = {
  home:{name:'首頁',title:'鏈上觀察與 Web3 工具',eyebrow:'',description:''},
  tools:{name:'試算與詞典',title:'試算與白話詞典',eyebrow:'學習資源',description:'先理解名詞，再用自己的數字練習。所有試算只在本頁進行。'},
  leaderboard:{name:'排行榜',title:'交易員排行榜',eyebrow:'SOLANA · 資料來源 BIRDEYE · 每日更新',description:'在本批樣本內篩選、排序與對比。',icon:'board'},
  compare:{name:'交易員對比',title:'交易員對比',eyebrow:'同一份快照，兩個視角',description:'並排比較已實現收益、帳面損益與交易紀錄。',icon:'compare'},
  research:{name:'每週研究',title:'每週研究',eyebrow:'把數據變成有依據的觀點',description:'從本週問題開始，查證、記錄，再與其他人討論。',icon:'note'},
  guide:{name:'資料說明',title:'資料與方法',eyebrow:'看懂數據，也看懂限制',description:'了解樣本範圍、計算方式與分享時應保留的證據。',icon:'book'}
};
let currentView = 'home';

function viewFromURL() {
  const hash=location.hash;
  if(['#home-tools','#home-glossary','#home-calculator'].includes(hash))return 'tools';
  if(['#swipe','#custom','#feed','#method','#home-story'].includes(hash))return 'home';
  if(['#board','#leaderboard','#flash-board','#base-board','#lab'].includes(hash))return 'leaderboard';
  const view = new URLSearchParams(location.search).get('view');
  if (Object.hasOwn(VIEWS,view)) return view;
  // Previously shared single-page anchors remain valid entry points.
  if (location.hash === '#wallet-compare') return 'compare';
  if (location.hash === '#research') return 'research';
  return new URLSearchParams(location.search).has('tab')?'leaderboard':'home';
}

function viewURL(view) {
  if(['home','tools'].includes(view))return new URL('./index.html'+(view==='tools'?'?view=tools':''),location.href).href;
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
  document.title = (currentView==='leaderboard'?`Solana ${PERIODS[TAB]}${SORT_NAMES[SORT]}榜`:view.title)+'｜落袋研究室';
  $('page-title').textContent = view.heading || view.title;
  $('page-eyebrow').textContent = view.eyebrow;
  $('page-description').textContent = view.description;
  $('home-v3').hidden=currentView!=='home';
  $('board').hidden=currentView==='home';
  $('workspace-heading').hidden = false;
  $('board').setAttribute('aria-labelledby','page-title');
  $('board').querySelector('.data-status').hidden=['home','tools','guide'].includes(currentView);
  document.querySelector('.board-shortcuts').hidden=currentView!=='leaderboard';
  for (const panel of document.querySelectorAll('[data-view-panel]')) panel.hidden = panel.dataset.viewPanel !== currentView;
  window.ResearchShell.setActive(currentView);
  for (const link of document.querySelectorAll('[data-route]')) {
    const route = link.dataset.route;
    if (!Object.hasOwn(VIEWS,route)) continue;
    link.href = viewURL(route);
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

// Replace only the current entry: reload and section jumps preserve visible controls,
// while the back button still returns to the previous workspace, not every keystroke.
function syncWorkspaceURL() {
  if (!DATA || !['leaderboard','compare','research'].includes(currentView)) return;
  const url = new URL(viewURL(currentView));
  url.hash = location.hash;
  if (url.href === location.href) return;
  history.replaceState({...history.state,scroll:window.scrollY},'',url.href);
  shareParams = new URLSearchParams(url.search);
  renderShareNotice();
}

function setView(view,{push=true,focus=true} = {}) {
  if (!Object.hasOwn(VIEWS,view)) return;
  if (push && (view !== currentView || location.hash)) {
    // Save the current controls and scroll position before leaving this page.
    history.replaceState({scroll:window.scrollY},'',viewURL(currentView));
    history.pushState({scroll:0},'',viewURL(view));
    shareParams = new URLSearchParams(location.search);
  }
  currentView = view;
  $('research-status').textContent = '';
  renderProduct();
  if (DATA) renderShareNotice();
  if (focus) {$(currentView==='home'?'home-title':'page-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}

function revealAnchor() {
  if(!location.hash)return;
  const target=document.getElementById(location.hash.slice(1));if(!target)return;
  for(let parent=target;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'instant'}));
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
  document.querySelector('.skip').addEventListener('click',event => {event.preventDefault();$(currentView==='home'?'home-title':'page-title').focus();window.scrollTo({top:0,behavior:'instant'});});
  window.addEventListener('popstate',() => {
    const scroll = history.state?.scroll || 0;
    shareParams = new URLSearchParams(location.search);restoredShare = false;
    currentView = viewFromURL();
    if (DATA) {restoreResearchShare();syncComparePeriod();render(false,{syncURL:false});}
    setView(viewFromURL(),{push:false,focus:false});
    $(currentView==='home'?'home-title':'page-title').focus({preventScroll:true});window.scrollTo({top:scroll,behavior:'instant'});revealAnchor();
  });
  // Old section links now open a complete page, starting at its heading.
  if (['#research','#wallet-compare'].includes(location.hash)) requestAnimationFrame(() => window.scrollTo(0,0));
  window.addEventListener('hashchange',()=>{setView(viewFromURL(),{push:false,focus:false});revealAnchor();});
  revealAnchor();
}
