import copy
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import tempfile
import unittest
from core import Invalid, PARAMETERS, candidate, digest, encode, normalize, top_ten, auto_due
from run import restore_candidate

NOW = datetime(2026, 10, 17, 2, tzinfo=timezone.utc)
DATE = NOW.isoformat()
ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def addr(i):
    return 'A' * 30 + ALPHABET[i // 58] + ALPHABET[i % 58]
def data():
    return {'source':'Birdeye','chain':'solana','updated_at':DATE,
            'week':[{'address':addr(i), 'volume':100-i, 'realized':0} for i in range(100)]}
def response(wallet=None):
    return {'data':{'meta':{'address':wallet or addr(0),'currency':'usd','time':DATE},
        'summary':{'unique_tokens':1},'tokens':[{'address':addr(101),'symbol':'TEST',
        'counts':{'total_buy':'2','total_sell':0},'cashflow_usd':{'total_invested':'1.5','total_sold':0},
        'pnl':{'realized_profit_usd':-1,'unrealized_usd':None}}]}}

class CoreTests(unittest.TestCase):
    def test_volume_selection_and_tie(self):
        d=data(); d['week'][40]['volume']=1000
        self.assertEqual(top_ten(d,NOW)[0]['address'],addr(40))
        d['week'][41]['volume']=1000;d['week'][41]['realized']=1
        self.assertEqual(top_ten(d,NOW)[0]['address'],addr(41))
    def test_source_guards(self):
        for change in [lambda d:d['week'].pop(),lambda d:d['week'].__setitem__(1,d['week'][0]),lambda d:d.update(updated_at=(NOW-timedelta(hours=37)).isoformat()),lambda d:d['week'][0].update(volume=-1)]:
            d=data();change(d)
            with self.assertRaises(Invalid):top_ten(d,NOW)
    def test_normalization_keeps_null_zero_and_loss(self):
        w=normalize(response(),addr(0),NOW)
        self.assertEqual(w['tokens'][0]['buy_usd'],1.5)
        self.assertEqual(w['tokens'][0]['sell_usd'],0)
        self.assertEqual(w['tokens'][0]['realized_usd'],-1)
        self.assertIsNone(w['tokens'][0]['unrealized_usd'])
    def test_identity_dates_duplicates_and_numeric_guards(self):
        for change in [lambda r:r.update(success=False),lambda r:r['data']['meta'].update(address=addr(1)),lambda r:r['data']['meta'].update(time=(NOW+timedelta(minutes=1)).isoformat()),lambda r:r['data']['tokens'][0]['counts'].update(total_buy=-1),lambda r:r['data']['tokens'][0]['pnl'].update(realized_profit_usd='NaN'),lambda r:r['data']['tokens'].append(r['data']['tokens'][0])]:
            r=response();change(r)
            with self.assertRaises(Invalid):normalize(r,addr(0),NOW)
    def test_empty_and_capped_pages(self):
        r=response();r['data']['tokens']=[];r['data']['summary']['unique_tokens']=0
        self.assertEqual(normalize(r,addr(0),NOW)['tokens'],[])
        r=response();r['data']['summary']['unique_tokens']=169
        self.assertEqual(normalize(r,addr(0),NOW)['coverage'],'limited')
    def test_summary_count_discrepancy_is_preserved(self):
        r=response();r['data']['summary']['unique_tokens']=0
        w=normalize(r,addr(0),NOW)
        self.assertEqual(w['reported_unique_tokens'],0)
        self.assertEqual(len(w['tokens']),1)
        self.assertEqual(w['coverage'],'count_mismatch')
        r['data']['tokens']=[dict(r['data']['tokens'][0],address=addr(i+100)) for i in range(100)]
        r['data']['summary']['unique_tokens']=100
        self.assertEqual(normalize(r,addr(0),NOW)['coverage'],'limited')
    def test_daily_trigger_and_duplicate_protection(self):
        event={'workflow_run':{'conclusion':'success','head_branch':'main','head_repository':{'full_name':'kkweb3345678/trader-leaderboard'},'event':'schedule','display_title':'Leaderboard publish · 0 0 * * *','created_at':DATE}}
        self.assertTrue(auto_due(event,data(),None,NOW,True))
        self.assertFalse(auto_due(event,data(),None,NOW,False))
        self.assertFalse(auto_due(event,data(),{'source_updated_at':DATE},NOW,True))
        event['workflow_run']['display_title']='Leaderboard publish · 0 6,12,18 * * *'
        self.assertFalse(auto_due(event,data(),None,NOW,True))
    def test_saved_publication_rebuilds_from_raw_without_api(self):
        source=encode(data()); responses=[response(w['address']) for w in top_ten(data(),NOW)]
        result=candidate(responses,source,'a'*40,NOW);raw=encode(result)
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            (folder/'baseline-data.json').write_bytes(source)
            (folder/'wallet-trades.json').write_bytes(raw)
            (folder/'report.json').write_bytes(encode({'status':'validated','mode':'validate','source_sha256':digest(source),'baseline_sha256':None,'candidate_sha256':digest(raw)}))
            for i,r in enumerate(responses,1):(folder/f'response-{i}.json').write_bytes(encode(r))
            self.assertEqual(restore_candidate(folder,source,None,NOW)[0],raw)
            with self.assertRaises(Invalid):restore_candidate(folder,source,b'changed',NOW)
            with self.assertRaises(Invalid):restore_candidate(folder,source,None,NOW+timedelta(hours=7))
            responses[0]['data']['tokens'][0]['symbol']='tampered'
            (folder/'response-1.json').write_bytes(encode(responses[0]))
            with self.assertRaises(Invalid):restore_candidate(folder,source,None,NOW)

if __name__=='__main__':unittest.main()
