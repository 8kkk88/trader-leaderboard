import {calculateRealized,matchingTerms} from './home-tools-data.js?v=1';
const $=id=>document.getElementById(id);
const guide=$('home-onboarding'),key='research-home-guide-v1';
let seen=false;
try {seen=localStorage.getItem(key)==='seen';} catch {}
guide.hidden=seen;
function rememberGuide() {
  try {localStorage.setItem(key,'seen');} catch {$('home-guide-storage').hidden=false;}
}
if(!seen){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){rememberGuide();observer.disconnect();}});observer.observe(guide);}
$('home-guide-replay').hidden=false;
$('home-guide-replay').addEventListener('click',()=>{
  guide.hidden=false;rememberGuide();$('home-guide-title').focus();
});
$('home-guide-dismiss').addEventListener('click',()=>{
  guide.hidden=true;rememberGuide();$('home-guide-replay').focus({preventScroll:true});
});
guide.addEventListener('click',event=>{
  const link=event.target.closest('[data-guide-step]');if(!link)return;
  event.preventDefault();rememberGuide();
  let target;
  if(link.dataset.guideStep==='follow')target=document.querySelector('#home-cards [data-home-follow]') || $('home-cards');
  else target=$(link.dataset.guideStep==='cards'?'home-swipe-title':'home-method-title');
  if(!target)return;
  target.tabIndex=target.tabIndex<0?-1:target.tabIndex;
  target.focus({preventScroll:true});target.scrollIntoView({block:'center',behavior:'instant'});
});

const form=$('home-calculator'),result=$('home-calc-result'),status=$('home-calc-status');
form.querySelector('fieldset').disabled=false;
const format=n=>Math.abs(n)>0&&Math.abs(n)<0.00000001?n.toPrecision(3):n.toLocaleString('zh-TW',{maximumFractionDigits:8});
function clearResult(){result.hidden=true;status.textContent='';form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));}
form.addEventListener('input',clearResult);form.addEventListener('reset',clearResult);
form.addEventListener('submit',event=>{
  event.preventDefault();clearResult();
  try {
    const values=calculateRealized(Object.fromEntries(new FormData(form)));
    $('home-calc-net').textContent=(values.net>0?'+':'')+format(values.net);
    $('home-calc-outcome').textContent=values.net>0?'估算獲利':values.net<0?'估算虧損':'估算損益兩平';
    result.dataset.outcome=values.net<0?'loss':'neutral';
    for(const name of ['cost','proceeds','fees'])$('home-calc-'+name+(name==='fees'?'-result':'')).textContent=format(values[name]);
    result.hidden=false;
    status.textContent=`試算完成：${$('home-calc-outcome').textContent} ${format(Math.abs(values.net))}，與輸入相同報價單位。`;
  } catch(error) {
    status.textContent=error.message;
    if(error.field){const input=form.elements.namedItem(error.field);input.setAttribute('aria-invalid','true');input.focus();}
  }
});
const search=$('home-glossary-search');search.disabled=false;
function filterTerms(){
  const matches=matchingTerms(search.value),terms=new Set(matches.map(item=>item.term));
  document.querySelectorAll('#home-glossary-list details').forEach((entry,i)=>{entry.hidden=!terms.has(entry.dataset.term);entry.open=search.value.trim()? !entry.hidden:i===0;});
  $('home-glossary-empty').hidden=matches.length>0;
  $('home-glossary-status').textContent=`顯示 ${matches.length} 個詞條${matches.length?'':'，試試其他關鍵字。'}`;
}
search.addEventListener('input',filterTerms);
$('home-glossary-clear').addEventListener('click',()=>{search.value='';filterTerms();search.focus();});
filterTerms();
