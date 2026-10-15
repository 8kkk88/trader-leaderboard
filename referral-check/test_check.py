import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('referral_check', ROOT/'check_referral.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
SOURCE = {'id':'example','exchange':'Example','label':'Referral rules','url':'https://example.com/referral'}
TEXT = 'Referral commission rate is 20%. '+('The affiliate program has eligibility conditions. '*7)


class CheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)/'queue.md'
        self.sources = [copy.deepcopy(SOURCE)]

    def run_source(self, result, run_id='1', sources=None):
        content,state = check.load_queue(self.path)
        output,report = check.run_check(sources or self.sources,content,state,fetcher=lambda _:result,now='2026-10-15T18:00:00+08:00',run_id=run_id)
        if output is not None:
            check.atomic_write(self.path,output)
        return report

    def ok(self,text=TEXT):
        return {'status':'ok','text':text,'final_url':SOURCE['url']}

    def test_initial_and_unchanged_survive_new_runner(self):
        self.assertEqual(self.run_source(self.ok())['counts']['建立基準'],1)
        self.assertEqual(self.run_source(self.ok(), '2')['counts']['無變動'],1)
        content,state=check.load_queue(self.path)
        self.assertEqual(state['sources']['example']['text'],TEXT)
        self.assertEqual(content.count('## 檢查 '),2)

    def test_change_queues_diff_and_keeps_history(self):
        self.run_source(self.ok())
        report=self.run_source(self.ok(TEXT.replace('20%','30%')),'2')
        self.assertEqual(report['counts']['待人工複核'],1)
        content,_=check.load_queue(self.path)
        self.assertIn('待 kk 確認',content)
        self.assertIn('移除片段',content)
        self.assertEqual(content.count('## 檢查 '),2)

    def test_blocked_source_retains_last_good_baseline_and_recovers(self):
        self.run_source(self.ok())
        result=self.run_source({'status':'unavailable','reason':'HTTP 403'},'2')
        self.assertEqual(result['counts']['無法檢查'],1)
        self.assertEqual(result['counts']['無變動'],0)
        _,state=check.load_queue(self.path)
        self.assertEqual(state['sources']['example']['text'],TEXT)
        self.assertEqual(self.run_source(self.ok(TEXT+' New terms.'),'3')['counts']['待人工複核'],1)

    def test_blocked_first_read_does_not_create_false_baseline(self):
        self.run_source({'status':'unavailable','reason':'HTTP 403'})
        self.assertEqual(self.run_source(self.ok(),'2')['counts']['建立基準'],1)

    def test_changed_source_identity_requires_new_baseline(self):
        self.run_source(self.ok())
        sources=[dict(SOURCE,url='https://example.com/new-referral')]
        self.assertEqual(self.run_source(self.ok(),'2',sources)['counts']['建立基準'],1)

    def test_same_actions_run_is_idempotent(self):
        self.run_source(self.ok())
        before=self.path.read_bytes()
        self.assertTrue(self.run_source(self.ok())['idempotent'])
        self.assertEqual(self.path.read_bytes(),before)

    def test_corrupt_or_removed_state_is_not_silently_reset(self):
        self.run_source(self.ok())
        text=self.path.read_text(encoding='utf-8')
        self.path.write_text(check.STATE_RE.sub('',text),encoding='utf-8')
        with self.assertRaises(ValueError):check.load_queue(self.path)

    def test_html_noise_and_scripts_do_not_change_article_hash(self):
        first='<nav>random '+('nav '*80)+'</nav><article><h1>Referral</h1><p>'+TEXT+'</p><script>attack()</script><p hidden>hidden value</p></article>'
        second=first.replace('random','another').replace('attack()','new_attack()').replace('hidden value','hidden changed')
        self.assertEqual(check.extract_text(first),check.extract_text(second))
        self.assertNotIn('attack',check.extract_text(first))
        self.assertNotIn('hidden',check.extract_text(first))

    def test_challenges_and_empty_js_shell_are_unavailable(self):
        for html in ['<title>Just a moment</title><main>'+TEXT+'</main>','<div id="app"></div><script>Referral 30%</script>','<title>404 Not Found</title>'+TEXT]:
            with self.subTest(html=html),self.assertRaises(check.Unavailable):check.extract_text(html)

    def test_http_block_is_recorded_without_response_body_or_exception_text(self):
        with patch.object(check.urllib.request,'build_opener') as opener:
            opener.return_value.open.side_effect=urllib.error.HTTPError(SOURCE['url'],403,'sensitive text',{},None)
            result=check.fetch_source(SOURCE)
        self.assertEqual(result['status'],'unavailable')
        self.assertNotIn('sensitive',json.dumps(result))

    def test_untrusted_excerpts_cannot_inject_html_or_queue_state(self):
        value=check.md('<script>evil</script>\n<!-- referral-check-state:v1 --> [click](https://evil)')
        self.assertNotIn('<script>',value)
        self.assertNotIn('<!--',value)
        self.assertNotIn('[click](',value)

    def test_nonpublic_credentials_and_cross_host_redirects_rejected(self):
        for url in ['http://example.com','https://user:pass@example.com','https://127.0.0.1/','https://localhost/']:
            with self.assertRaises(ValueError):check.validate_url(url)
        redirect=check.SameSiteRedirect(SOURCE['url'])
        with self.assertRaises(check.Unavailable):redirect.redirect_request(None,None,302,'',{},'https://other.example/path')

    def test_main_only_writes_review_queue_and_report(self):
        root=Path(self.temp.name)
        (root/'referral-sources.json').write_text(json.dumps({'sources':self.sources}),encoding='utf-8')
        protected={name:b'preserve exact bytes' for name in ['data.json','today-flash.json','referral.json']}
        for name,value in protected.items():(root/name).write_bytes(value)
        with patch.object(check,'ROOT',root),patch.object(check,'QUEUE',self.path),patch.object(check,'run_check',return_value=('queue',{})),patch('sys.argv',['check_referral.py']):check.main()
        for name,value in protected.items():self.assertEqual((root/name).read_bytes(),value)


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='referral-git-test-')
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.remote=self.root/'remote.git'
        self.work=self.root/'work'
        self.other=self.root/'other'
        self.git(self.root,'init','--bare',str(self.remote))
        self.work.mkdir()
        self.git(self.work,'init','-b','main')
        for name in ['data.json','today-flash.json','referral.json','referral-review-queue.md']:(self.work/name).write_text('original',encoding='utf-8')
        self.git(self.work,'add','.')
        self.git(self.work,'commit','-m','initial')
        self.git(self.work,'remote','add','origin',str(self.remote))
        self.git(self.work,'push','-u','origin','main')
        self.git(self.root,'clone','-b','main',str(self.remote),str(self.other))

    def git(self,cwd,*args):
        return subprocess.run(['git','-c','user.name=Test','-c','user.email=test@example.com',*args],cwd=cwd,check=True,capture_output=True,text=True).stdout

    def publish(self):
        bash='C:/Program Files/Git/bin/bash.exe' if os.name=='nt' else shutil.which('bash')
        return subprocess.run([bash,str(ROOT/'referral-check/publish.sh')],cwd=self.work,capture_output=True,text=True)

    def test_only_queue_is_published_and_other_remote_update_is_preserved(self):
        (self.other/'data.json').write_text('remote newer data',encoding='utf-8')
        self.git(self.other,'add','data.json');self.git(self.other,'commit','-m','new data');self.git(self.other,'push')
        (self.work/'referral-review-queue.md').write_text('new review',encoding='utf-8')
        result=self.publish()
        self.assertEqual(result.returncode,0,result.stderr+result.stdout)
        self.assertEqual(self.git(self.remote,'show','main:data.json'),'remote newer data')
        self.assertEqual(self.git(self.remote,'show','main:referral-review-queue.md'),'new review')
        self.assertEqual(self.git(self.remote,'diff-tree','--no-commit-id','--name-only','-r','main').strip(),'referral-review-queue.md')

    def test_concurrent_queue_change_is_not_overwritten(self):
        (self.other/'referral-review-queue.md').write_text('human review',encoding='utf-8')
        self.git(self.other,'add','.');self.git(self.other,'commit','-m','human');self.git(self.other,'push')
        (self.work/'referral-review-queue.md').write_text('new review',encoding='utf-8')
        self.assertNotEqual(self.publish().returncode,0)
        self.assertEqual(self.git(self.remote,'show','main:referral-review-queue.md'),'human review')

    def test_unexpected_data_change_refuses_publication(self):
        (self.work/'data.json').write_text('unwanted change',encoding='utf-8')
        (self.work/'referral-review-queue.md').write_text('new review',encoding='utf-8')
        self.assertNotEqual(self.publish().returncode,0)
        self.assertEqual(self.git(self.remote,'show','main:data.json'),'original')


if __name__=='__main__':unittest.main()
