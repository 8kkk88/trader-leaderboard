"""Write a readable Actions summary from actual check results."""
import json
import argparse
import os
from pathlib import Path

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--watchlist', action='store_true')
args = parser.parse_args()
if args.watchlist:
    root = root / 'watchlist'
report = json.loads((root / 'check-log.json').read_text(encoding='utf-8'))
queue = json.loads((root / 'review-queue.json').read_text(encoding='utf-8'))
label = 'Observation-only wallet sources (not in the comparison table)' if args.watchlist else 'Official comparison wallet sources'
queue_path = 'wallets-check/watchlist/review-queue.json' if args.watchlist else 'wallets-check/review-queue.json'
lines = ['## ' + label, '',
         'Schedule: `7 * * * *` (UTC; every hour at minute 7).', '',
         f"Last check: `{report['last_check']}`", '',
         '| Successful / configured | Failed | No source | Changed | New baselines | Pending reviews |',
         '| --- | --- | --- | --- | --- | --- |',
         f"| {report['checked']} / {report['configured']} | {report['failed']} | {report['skipped']} | {report['changed']} | {report['baselined']} | {report['pending_reviews']} |", '',
         '**Pipeline success means the check ran and its results were saved; it does not mean every source was readable.**', '',
         f"Reviewed `wallets.json` unchanged: `{report['dataset_unchanged']}`.", '',
         '| Wallet | Dimension | Result |', '| --- | --- | --- |']
for item in report['results']:
    lines.append(f"| {item['wallet_id']} | {item['dimension']} | {item.get('error', item['status'])} |")
lines.extend(['', f"Review queue entries: {len(queue)}.", '',
              f'[Review queue](https://github.com/kkweb3345678/trader-leaderboard/blob/main/{queue_path})', '',
              'Only official source text changes are detected. Numbers require human review.'])
summary = '\n'.join(lines) + '\n'
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as output:
        output.write(summary)
print(summary)
if report['failed'] or report['skipped']:
    print(f"::warning::Partial source coverage: {report['checked']}/{report['configured']} succeeded; {report['failed']} failed; {report['skipped']} without an official text source.")
