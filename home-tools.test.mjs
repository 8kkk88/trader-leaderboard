import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateRealized,matchingTerms} from './home-tools-data.js';
test('Realized calculator separates proceeds, cost and fees across gains, losses and zero sale',()=>{
 assert.deepEqual(calculateRealized({buy:'100',sell:'120',quantity:'2',fees:'3'}),{cost:200,proceeds:240,fees:3,net:37});
 assert.equal(calculateRealized({buy:'100',sell:'80',quantity:'2',fees:''}).net,-40);
 assert.equal(calculateRealized({buy:'100',sell:'0',quantity:'2'}).net,-200);
 assert.equal(calculateRealized({buy:'100',sell:'100',quantity:'2'}).net,0);
 assert.equal(calculateRealized({buy:'1,000',sell:'1,020',quantity:'0.5',fees:'2'}).net,8);
 assert.ok(calculateRealized({buy:'0.00000001',sell:'0.00000002',quantity:'0.1'}).net>0);
});
test('Invalid or overflowing calculator inputs cannot silently yield misleading results',()=>{
 for(const bad of ['', 'abc','-2','1,2','1e309','Infinity','NaN','0x20']) assert.throws(()=>calculateRealized({buy:bad,sell:'120',quantity:'2'}));
 for(const key of ['buy','quantity'])assert.throws(()=>calculateRealized({buy:'100',sell:'120',quantity:'2',[key]:'0'}));
 assert.throws(()=>calculateRealized({buy:'1000000000000',sell:'1200000000000',quantity:'1000000000000'}),/範圍/);
 assert.throws(()=>calculateRealized({buy:'1',sell:'2',quantity:'1',fees:'-1'}));
});
test('Glossary searches both plain language and standard terminology',()=>{
 assert.equal(matchingTerms('').length,5);
 assert.ok(matchingTerms('落袋').some(item=>item.term==='已實現損益'));
 assert.equal(matchingTerms(' SNAPSHOT ')[0].term,'快照');
 assert.equal(matchingTerms('不存在的詞').length,0);
});
