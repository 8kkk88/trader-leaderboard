import unittest
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs
from validate import load_collector, validate_raw, ValidationError

class PageTests(unittest.TestCase):
    def test_requested_rows_fit_one_call(self):
        collector=load_collector()
        for count in (20,100):
            with patch.object(collector,'get',return_value={'data':{'items':[{}]*count}}) as get, patch.object(collector.time,'sleep'):
                self.assertEqual(len(collector.fetch_top('1W','test','solana',count)),count)
                self.assertEqual(get.call_count,1)
                self.assertEqual(parse_qs(urlparse(get.call_args.args[0]).query)['limit'],[str(count)])
    def test_short_page_still_fails_publication_validation(self):
        with self.assertRaises(ValidationError):validate_raw([{}]*34,100)

if __name__=='__main__':unittest.main()
