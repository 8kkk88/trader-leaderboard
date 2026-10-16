import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const app=read('app.js').split("\ndocument.querySelectorAll('[data-period]')")[0];
const research=read('research.js').split('\nfunction initResearch()')[0];
const sample={source:'Birdeye',chain:'solana',updated_at:'2026-10-16T10:52:49+08:00',
  today:[{address:'A'.repeat(32),realized:20,pnl:40,volume:300,trades:2},{address:'B'.repeat(32),realized:30,pnl:50,volume:200,trades:3},{address:'C'.repeat(32),realized:0,pnl:0,volume:0,trades:0},{address:'D'.repeat(32),realized:null,pnl:null,volume:null,trades:null}],
  week:[{address:'A'.repeat(32),realized:100,pnl:150,volume:900,trades:7}]};
function setup(url='https://example.com/index.html?view=leaderboard') {
  const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false,innerHTML:''});return elements.get(id);};
  const context=vm.createContext({URL,URLSearchParams,Intl,console,location:new URL(url),window:{scrollY:123},document:{getElementById:el},sample,selectionButton:()=>''});
  context.history={state:{scroll:0},replaceState(state,_,url){this.state=state;context.location=new URL(url);}};
  vm.runInContext(read('money-format.js'),context);vm.runInContext(app,context);vm.runInContext(read('product.js'),context);
  vm.runInContext('DATA=sample; currentView="leaderboard";',context);
  return {context,el,run:code=>vm.runInContext(code,context)};
}
test('volume and PnL tables put the ranked metric immediately after the wallet',()=>{
  const {run,el}=setup();
  for(const [sort,first] of [['volume','$300.00'],['pnl','$50.00'],['realized','$30.00']]){
    run(`SORT='${sort}'; renderRows(sorted());`);
    const cells=[...el('rows').innerHTML.split('</tr>')[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
    assert.equal(cells.length,7);assert.equal(cells[2][1],first,sort+' primary table value');
    assert.match(el('cards').innerHTML,new RegExp('<dt>'+({volume:'交易量',pnl:'總損益',realized:'已實現收益'}[sort])+' · 目前排序</dt>'));
  }
});
test('real snapshot sorting, zero and missing volume remain distinct',()=>{
  const {run,context}=setup();
  assert.equal(run("sorted('volume').map(w=>w.address[0]).join(',')"),'A,B,C,D');
  context.published=JSON.parse(read('data.json'));
  for(const period of ['today','week']) {
    const expected=[...context.published[period]].sort((a,b)=>(b.volume??-Infinity)-(a.volume??-Infinity)||(b.realized??-Infinity)-(a.realized??-Infinity)||a.address.localeCompare(b.address)).map(w=>w.address);
    assert.deepEqual(JSON.parse(run(`DATA=published;sortedCache=new Map();JSON.stringify(sorted('volume','${period}').map(w=>w.address))`)),expected);
  }
});
test('URL restores the exact board selection after reload, including display fallback',()=>{
  const first=setup();vm.runInContext(research,first.context);
  first.run("TAB='week';SORT='volume';PAGE=3;QUERY='aaa';LAB={positive:true,trades:2};LAYOUT='cards';syncWorkspaceURL();");
  const second=setup(first.context.location.href);vm.runInContext(research,second.context);
  second.run('restoreResearchShare();');
  assert.equal(second.run("JSON.stringify([TAB,SORT,PAGE,QUERY,LAB.positive,LAB.trades,LAYOUT])"),'["week","volume",3,"aaa",true,2,"cards"]');
  assert.equal(first.context.history.state.scroll,123);
});
test('sync does not turn an open homepage into a filtered leaderboard',()=>{
  const {run,context}=setup('https://example.com/index.html');vm.runInContext(research,context);
  run("currentView='home';SORT='volume';syncWorkspaceURL();");
  assert.equal(context.location.search,'');
});
