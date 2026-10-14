from pathlib import Path
import tempfile
import unittest

import check
from install_env import validate_proxy


class SentinelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.profile = {'render':'ssr','selector':'article','required':['swap','fee'],'min_chars':20}
        self.url = 'https://support.metamask.io/trade/swap/user-guide-swaps/'
        self.queue = []

    def tearDown(self):
        self.temp.cleanup()

    def compare(self, text):
        return check.compare_snapshot(self.root, 'metamask', 'swap_fee', self.url, self.profile, text, self.queue, check.now())

    def test_baseline_change_and_no_duplicate(self):
        self.assertEqual(self.compare('swap fee is 0.875%'), 'baseline')
        self.assertEqual(self.queue, [])
        self.assertEqual(self.compare('swap fee is 0.875%'), 'unchanged')
        self.assertEqual(self.compare('swap fee is 0.25%'), 'changed')
        self.assertEqual(len(self.queue), 1)
        self.assertIn('-swap fee is 0.875%', self.queue[0]['summary'])
        self.assertIn('+swap fee is 0.25%', self.queue[0]['summary'])
        self.assertEqual(self.compare('swap fee is 0.25%'), 'unchanged')
        self.assertEqual(len(self.queue), 1)

    def test_manual_hash_change_is_detected(self):
        self.compare('swap fee is 0.875%')
        (self.root/'snapshots/metamask_swap_fee.hash').write_text('0'*64)
        self.assertEqual(self.compare('swap fee is 0.875%'), 'changed')
        self.assertIn('snapshot integrity', self.queue[0]['summary'])

    def test_noise_removed_but_deadlines_preserved(self):
        html = '<article><h1>Swap fee campaign</h1><nav>Menu random 123</nav><p>Updated on 2026-10-14T12:00:00Z</p><p>Ends 2026-10-31 23:59 UTC. Fee 0.25%.</p><footer>Random ad</footer></article>'
        normal = check.normalize(html, self.profile)
        self.assertNotIn('Menu', normal)
        self.assertNotIn('Updated on', normal)
        self.assertNotIn('Random ad', normal)
        self.assertIn('2026-10-31 23:59', normal)
        self.assertNotEqual(normal, check.normalize(html.replace('2026-10-31', '2026-11-30'), self.profile))

    def test_invalid_response_never_becomes_baseline(self):
        for html in ('<title>Just a moment...</title><article>swap fee check your browser</article>', '<article>empty</article>', '<div id="root"></div>'):
            with self.assertRaises(check.CheckError):
                check.normalize(html, self.profile)
        self.assertFalse((self.root/'snapshots').exists())

    def test_dataset_destination_blocked(self):
        protected = self.root/'wallets.json'
        protected.write_text('reviewed')
        with self.assertRaises(check.CheckError):
            check.atomic_write(protected, 'changed')
        self.assertEqual(protected.read_text(), 'reviewed')

    def test_config_change_requires_review(self):
        self.compare('swap fee is 0.875%')
        self.profile['min_chars'] = 25
        with self.assertRaises(check.CheckError):
            self.compare('swap fee is 0.25%')
        self.assertEqual(self.queue, [])

    def test_source_hosts_and_proxy_validation(self):
        check.validate_url('metamask', self.url)
        for url in ('http://support.metamask.io/', 'https://metamask.io.attacker.example/', 'https://user:password@metamask.io/'):
            with self.assertRaises(check.CheckError):
                check.validate_url('metamask', url)
        for value in ('', 'http://proxy.example:3128', 'http://user:@proxy.example:3128', 'http://user:pass@proxy.example:3128\nBAD=1'):
            with self.assertRaises(ValueError):
                validate_proxy(value)
        self.assertEqual(validate_proxy('http://user:example@proxy.example:3128'), 'http://user:example@proxy.example:3128')

    def test_failed_request_retains_snapshot_and_real_counts(self):
        sources = {wallet:{dim:None for dim in check.DIMENSIONS} for wallet in check.HOSTS}
        sources['metamask']['swap_fee'] = self.url
        profiles = {'metamask':{'swap_fee':self.profile}}
        source_path, profile_path, status_path = (self.root/name for name in ('sources.json','profiles.json','check-log.json'))
        check.write_json(source_path, sources)
        check.write_json(profile_path, profiles)
        def good(*args):
            return '<article>swap fee explanation with current documented rules</article>', self.url
        first = check.run(source_path, profile_path, self.root/'state', status_path, good, lambda _:None)
        baseline = (self.root/'state/snapshots/metamask_swap_fee.hash').read_bytes()
        def failed(*args):
            raise check.CheckError('http_403')
        second = check.run(source_path, profile_path, self.root/'state', status_path, failed, lambda _:None)
        self.assertEqual((first['checked'], first['failed'], first['skipped']), (1,0,17))
        self.assertEqual((second['checked'], second['failed'], second['changed']), (0,1,0))
        self.assertEqual(second['last_success'], first['last_success'])
        self.assertEqual((self.root/'state/snapshots/metamask_swap_fee.hash').read_bytes(), baseline)
        self.assertEqual(check.read_json(self.root/'state/review-queue.json'), [])
        self.assertTrue(second['dataset_unchanged'])


if __name__ == '__main__':
    unittest.main()
