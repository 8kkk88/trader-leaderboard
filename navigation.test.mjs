import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./product.js',import.meta.url),'utf8');
function resolve(path){const url=new URL(path,'https://example.com/');const context={location:url,URL,URLSearchParams};vm.createContext(context);vm.runInContext(source,context);return vm.runInContext('viewFromURL()',context);}
test('homepage, explicit workspaces and previously shared section URLs keep distinct destinations',()=>{
  for(const [url,expected] of [['/index.html','home'],['/?view=leaderboard','leaderboard'],['/?view=compare','compare'],['/?view=research','research'],['/?view=guide','guide'],['/?view=tools','tools'],['/#board','leaderboard'],['/#flash-board','leaderboard'],['/#base-board','leaderboard'],['/#wallet-compare','compare'],['/#research','research'],['/#feed','home'],['/#custom','home'],['/#method','home'],['/#home-glossary','tools'],['/?view=leaderboard#home-glossary','tools'],['/?tab=week&sort=volume','leaderboard'],['/?view=invalid','home']])assert.equal(resolve(url),expected,url);
});
test('home and learning links omit wallet research state from the destination',()=>{
  const context={location:new URL('https://example.com/index.html?tab=week&sort=volume&walletA=address'),URL,URLSearchParams};vm.createContext(context);vm.runInContext(source,context);
  assert.equal(vm.runInContext('viewURL("home")',context),'https://example.com/index.html');
  assert.equal(vm.runInContext('viewURL("tools")',context),'https://example.com/index.html?view=tools');
});
