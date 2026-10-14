"""Extract the same public official articles from their credential-free APIs."""
from html import unescape
import json

from article import Document, DROP_TAGS


def binance_text(root):
    """Read only the CMS article tree, never related articles or counters."""
    remaining = 20000

    def walk(node, depth=0):
        nonlocal remaining
        remaining -= 1
        if remaining < 0 or depth > 100 or not isinstance(node, dict):
            raise ValueError('invalid_cms_article_tree')
        kind = node.get('node')
        if kind == 'text' and isinstance(node.get('text'), str):
            return unescape(node['text'])
        if kind not in ('root', 'element'):
            raise ValueError('unknown_cms_article_node')
        # Binance also wraps fee TABLES in figure, so only drop image nodes.
        if node.get('tag') in DROP_TAGS | {'img'}:
            return ''
        children = node.get('child', [])
        if not isinstance(children, list):
            raise ValueError('invalid_cms_article_children')
        return '\n'.join(walk(child, depth + 1) for child in children)

    if not isinstance(root, dict) or root.get('node') != 'root':
        raise ValueError('invalid_cms_article_root')
    return walk(root)


def extract_api_article(body, profile):
    payload = json.loads(body)
    if not isinstance(payload, dict):
        raise ValueError('invalid_article_api_response')
    if profile['format'] == 'zendesk-json':
        article = payload.get('article')
        if (not isinstance(article, dict)
                or str(article.get('id')) != profile['article_id']
                or article.get('locale') != profile['locale']
                or article.get('html_url') != profile['article_url']
                or article.get('draft') is not False):
            raise ValueError('unexpected_zendesk_article')
        content = article.get('body')
        if not isinstance(content, str) or not content.strip():
            raise ValueError('missing_api_article_body')
        text = Document(content).root.text()
    elif profile['format'] == 'binance-json':
        article = payload.get('data')
        if (payload.get('success') is not True or payload.get('code') != '000000'
                or not isinstance(article, dict)
                or article.get('code') != profile['article_id']):
            raise ValueError('unexpected_binance_article')
        content = article.get('body')
        if not isinstance(content, str) or not content.strip():
            raise ValueError('missing_api_article_body')
        text = binance_text(json.loads(content))
    else:
        raise ValueError('unsupported_api_article_format')
    title = article.get('title')
    if not isinstance(title, str) or not title.strip() or not text.strip():
        raise ValueError('missing_api_article_content')
    return title + '\n' + text
