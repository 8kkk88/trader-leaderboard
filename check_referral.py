#!/usr/bin/env python3
"""Detect changes to public referral pages. Only the review queue is writable.

The queue embeds a compressed, versioned text baseline in an HTML comment so
comparisons survive clean Actions runners without committing a second state file.
Fetched pages are data: never executed, rendered as HTML, or used as commands.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import difflib
import hashlib
from html import escape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zlib

ROOT = Path(__file__).resolve().parent
QUEUE = ROOT / 'referral-review-queue.md'
TAIPEI = timezone(timedelta(hours=8))
MAX_BODY = 4_000_000
MAX_TEXT = 150_000
STATE_RE = re.compile(r'<!-- referral-check-state:v1\n([A-Za-z0-9+/=]+)\n-->')
HEADER = '''# 返佣來源檢查與待審清單

每日台北 09:00 比對官方公開頁文字。內容變動只代表需要複核，不代表返佣數字已改。
數字仍以人工審核的 referral.json 為準，須由 kk 確認後再更新。
「無法檢查」包含存取受阻、登入／驗證頁及未能取得有效內文；不當作「沒有變動」。
首次成功取得的內容只建立基準。MAX 尚無來源 URL，不在自動檢查涵蓋範圍。
OKX DEX 來源僅供參考，不作 CEX 現貨／合約欄位的數字依據。

檔尾註解保存壓縮後的公開文字與 hash，供下一次比對；請保留。人工審核註記可寫在各筆紀錄下。
'''
BLOCKS = {'p','div','section','article','main','h1','h2','h3','h4','h5','h6','li','tr','br','hr'}
SKIP = {'script','style','noscript','svg','nav','header','footer','form','button','template','iframe'}
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}


class Unavailable(Exception):
    """Expected source access/quality failure; not a workflow infrastructure error."""


class PublicText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parts = {'all': [], 'main': [], 'article': [], 'title': []}

    def add(self, text):
        if any(item[1] for item in self.stack):
            return
        self.parts['all'].append(text)
        for region in ('main','article','title'):
            if any(item[2] == region for item in self.stack):
                self.parts[region].append(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in BLOCKS:
            self.add('\n')
        if tag not in VOID:
            hidden = tag in SKIP or 'hidden' in attrs or attrs.get('aria-hidden') == 'true'
            hidden = hidden or bool(re.search(r'(display\s*:\s*none|visibility\s*:\s*hidden)', attrs.get('style',''), re.I))
            region = 'main' if attrs.get('role') == 'main' else tag
            self.stack.append((tag, hidden, region))

    def handle_endtag(self, tag):
        if tag in BLOCKS:
            self.add('\n')
        for index in range(len(self.stack)-1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.add(data)


def clean_text(parts):
    text = unicodedata.normalize('NFKC', ''.join(parts))
    text = re.sub(r'[\u200b-\u200f\ufeff]', '', text)
    return '\n'.join(line for raw in text.splitlines() if (line := ' '.join(raw.split())))


def extract_text(html):
    parser = PublicText()
    parser.feed(html)
    title = clean_text(parser.parts['title']).lower()
    if any(phrase in title for phrase in ('just a moment','access denied','attention required','security verification','page not found','404 not found','are you a robot')):
        raise Unavailable('驗證、封鎖或錯誤頁')
    texts = {key: clean_text(value) for key, value in parser.parts.items()}
    text = next((texts[key] for key in ('article','main','all') if len(texts[key]) >= 180), texts['all'])
    if len(text) > MAX_TEXT:
        raise Unavailable('內文過長，需人工確認擷取範圍')
    if len(text) < 180 or not re.search(r'(referral|affiliate|推薦|返佣|佣金|返傭)', text, re.I):
        raise Unavailable('未取得有效推薦計畫內文（可能需 JavaScript 或登入）')
    if not re.search(r'(\d\s*%|commission|rebate|佣金|返佣|返傭)', text, re.I):
        raise Unavailable('只有頁面框架，缺少可比對的佣金內文')
    if len(text) < 1500 and re.search(r'(verify you are human|enable javascript and cookies|checking your browser|security verification)', text, re.I):
        raise Unavailable('瀏覽器驗證頁，無法檢查')
    return text


def validate_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None,443):
        raise ValueError('Source must be a public HTTPS URL without credentials')
    if parsed.hostname in {'localhost','localhost.localdomain'} or re.fullmatch(r'[0-9.]+', parsed.hostname) or ':' in parsed.hostname:
        raise ValueError('IP/local source URLs are not supported')
    return parsed


class SameSiteRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, url):
        self.host = validate_url(url).hostname

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        try:
            host = validate_url(newurl).hostname
        except ValueError as exc:
            raise Unavailable('來源重新導向至不允許的位置') from exc
        # A changed destination needs human review; never silently monitor a login
        # service or an unrelated host under the old source's identity.
        if host != self.host:
            raise Unavailable('來源跨網域重新導向，需人工確認')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def fetch_source(source):
    request = urllib.request.Request(source['url'], headers={
        'User-Agent':'ReferralSourceCheck/1.0 (+https://github.com/kkweb3345678/trader-leaderboard)',
        'Accept':'text/html', 'Accept-Language':'en-US,en;q=0.9,zh-TW;q=0.8', 'Accept-Encoding':'identity',
    })
    try:
        opener = urllib.request.build_opener(SameSiteRedirect(source['url']))
        with opener.open(request, timeout=18) as response:
            if response.status != 200:
                raise Unavailable('HTTP '+str(response.status))
            if response.headers.get_content_type() not in {'text/html','application/xhtml+xml'}:
                raise Unavailable('非 HTML 內容，需人工檢查')
            body = response.read(MAX_BODY+1)
            if len(body) > MAX_BODY:
                raise Unavailable('頁面超過大小上限')
            charset = response.headers.get_content_charset() or 'utf-8'
            html = body.decode(charset, errors='strict')
            return {'status':'ok','text':extract_text(html),'final_url':response.geturl()}
    except urllib.error.HTTPError as exc:
        return {'status':'unavailable','reason':'HTTP '+str(exc.code)+'，無法取得內文'}
    except (urllib.error.URLError, TimeoutError, OSError):
        return {'status':'unavailable','reason':'網路連線、TLS 或逾時，未取得內容'}
    except (UnicodeError, LookupError):
        return {'status':'unavailable','reason':'無法解碼來源頁面'}
    except Unavailable as exc:
        return {'status':'unavailable','reason':str(exc)}


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def load_catalog(path):
    catalog = json.loads(path.read_text(encoding='utf-8'))
    sources = catalog['sources']
    seen = set()
    if not isinstance(sources,list) or not sources:
        raise ValueError('Empty sources catalog')
    for source in sources:
        if not re.fullmatch(r'[a-z0-9-]+', source['id']) or source['id'] in seen:
            raise ValueError('Invalid or duplicate source id')
        seen.add(source['id'])
        validate_url(source['url'])
        if not all(isinstance(source.get(key),str) and source[key] for key in ('label','exchange')):
            raise ValueError('Missing source label or exchange')
    return sources


def load_queue(path):
    if not path.exists():
        return HEADER, {'version':1,'sources':{}}
    content = path.read_text(encoding='utf-8')
    markers = list(STATE_RE.finditer(content))
    if not markers:
        # Never reset a damaged/lost baseline and declare old sources unchanged.
        if 'referral-check-state:' in content or '## 檢查 ' in content:
            raise ValueError('Missing or corrupt review queue baseline')
        return content, {'version':1,'sources':{}}
    if len(markers) != 1:
        raise ValueError('Multiple baseline markers')
    compressed = base64.b64decode(markers[0].group(1), validate=True)
    decoder = zlib.decompressobj()
    raw = decoder.decompress(compressed, 3_000_001)
    if len(raw) > 3_000_000 or not decoder.eof or decoder.unused_data:
        raise ValueError('Invalid or oversized baseline')
    state = json.loads(raw)
    if state.get('version') != 1 or not isinstance(state.get('sources'),dict):
        raise ValueError('Unsupported baseline version')
    for item in state['sources'].values():
        if 'text' in item and digest(item['text']) != item.get('sha256'):
            raise ValueError('Baseline hash does not match saved text')
    return STATE_RE.sub('',content).rstrip(), state


def md(text):
    # Untrusted excerpts cannot inject HTML, Markdown links, Actions commands,
    # fenced blocks or a baseline marker into the human-readable review queue.
    return re.sub(r'([\\`*_{}\[\]()#+.!|>~-])', r'\\\1', escape(str(text), quote=True)).replace('\n',' ')


def brief_diff(old, new):
    # Compare tokens, so both single-line articles and paragraph text are useful.
    a = re.findall(r'[\u3400-\u9fff]|[^\W_]+|%|[^\s\w]', old)
    b = re.findall(r'[\u3400-\u9fff]|[^\W_]+|%|[^\s\w]', new)
    removed, added = [], []
    for tag,i,j,k,l in difflib.SequenceMatcher(None,a,b,autojunk=True).get_opcodes():
        if tag != 'equal':
            removed.extend(a[i:j]); added.extend(b[k:l])
    def snippet(tokens):
        return ' '.join(tokens[:10]) + (' …' if len(tokens)>10 else '') if tokens else '（無）'
    return f'移除片段：{md(snippet(removed))}；新增片段：{md(snippet(added))}。節錄只供定位，請開啟原文複核。'


def run_check(sources, content, state, fetcher=fetch_source, now=None, run_id='local'):
    now = now or datetime.now(TAIPEI).isoformat(timespec='seconds')
    if state.get('last_run_id') == run_id and run_id != 'local':
        return None, {'idempotent':True,'run_id':run_id}
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetcher, sources))
    rows, details, report = [], [], []
    updated = json.loads(json.dumps(state))
    for source, result in zip(sources, results):
        old = state['sources'].get(source['id'], {})
        item = dict(old)
        item['checked_at'] = now
        item['status'] = result['status']
        if result['status'] == 'unavailable':
            status = '無法檢查'
            detail = result['reason']+'；保留上次成功基準' if old.get('text') else result['reason']+'；尚未建立基準'
        else:
            text = result['text']
            current_hash = digest(text)
            identity_changed = old.get('url') != source['url'] or old.get('final_url') != result['final_url']
            if not old.get('text') or identity_changed:
                status = '建立基準'
                detail = '首次成功擷取／來源位置變更；未判定數字變更'
            elif current_hash == old.get('sha256'):
                status = '無變動'
                detail = '可取得的正規化內文 hash 相同'
            else:
                status = '待人工複核'
                detail = '內文 hash 變動，請確認是否影響返佣資料'
                details.append(f"### 待審：{md(source['exchange'])} — {md(source['label'])}\n\n"
                               f"- 來源：<{source['url']}>\n- 前次成功：{md(old['last_success'])}\n"
                               f"- SHA-256：`{old['sha256']}` → `{current_hash}`\n"
                               f"- {brief_diff(old['text'],text)}\n- 審核結果：待 kk 確認。\n")
            item.update(url=source['url'],final_url=result['final_url'],text=text,sha256=current_hash,last_success=now)
        updated['sources'][source['id']] = item
        rows.append(f"| {md(source['exchange'])} | [{md(source['label'])}]({source['url']}) | {status} | {md(detail)} |")
        report.append({'id':source['id'],'exchange':source['exchange'],'url':source['url'],'status':status,'detail':detail})
    counts = {label:sum(item['status']==label for item in report) for label in ['建立基準','無變動','待人工複核','無法檢查']}
    updated.update(last_run_id=run_id,last_checked_at=now)
    summary = '；'.join(f'{key} {value}' for key,value in counts.items())
    entry = f'\n\n## 檢查 {now}\n\n{summary}。檢查不等於重新審核數字。\n\n'
    if run_id.isdigit():
        entry += f'[Actions 執行紀錄](https://github.com/kkweb3345678/trader-leaderboard/actions/runs/{run_id})\n\n'
    entry += '| 交易所 | 來源 | 結果 | 說明 |\n|---|---|---|---|\n'+'\n'.join(rows)+'\n'
    entry += '\n'+'\n'.join(details) if details else ''
    encoded = base64.b64encode(zlib.compress(json.dumps(updated,ensure_ascii=False,separators=(',',':')).encode('utf-8'))).decode('ascii')
    output = content.rstrip()+entry+'\n<!-- referral-check-state:v1\n'+encoded+'\n-->\n'
    return output, {'checked_at':now,'run_id':run_id,'counts':counts,'sources':report,'numbers_modified':False}


def atomic_write(path, text):
    with tempfile.NamedTemporaryFile('w',encoding='utf-8',dir=path.parent,prefix='referral-check-',suffix='.tmp',delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(text)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, help='Optional report outside the repository (runner temp)')
    args = parser.parse_args()
    if args.report and (args.report.resolve() == ROOT or ROOT in args.report.resolve().parents):
        parser.error('--report must be outside the repository')
    sources = load_catalog(ROOT / 'referral-sources.json')
    content, state = load_queue(QUEUE)
    result, report = run_check(sources, content, state, run_id=os.environ.get('GITHUB_RUN_ID','local'))
    if result is not None:
        atomic_write(QUEUE,result)
    if args.report:
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({key:report[key] for key in ('checked_at','counts','idempotent') if key in report},ensure_ascii=False))


if __name__ == '__main__':
    main()
