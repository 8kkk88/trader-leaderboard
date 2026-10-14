"""Small, explicit HTML article extractor using only Python's standard library.

Selectors support only the tag, ID, class and attribute forms used by our
reviewed source profiles. Unsupported forms fail closed instead of guessing.
"""
from html.parser import HTMLParser
import re

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
DROP_TAGS = {'script', 'style', 'noscript', 'nav', 'footer', 'aside', 'form', 'button', 'svg', 'iframe'}
DROP_CLASSES = {'cookie-banner', 'advertisement', 'article-votes', 'article-relatives'}


class Node:
    def __init__(self, tag, attrs=(), parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def matches(self, selector):
        selector = selector.strip()
        if selector.startswith('#'):
            return self.attrs.get('id') == selector[1:]
        if selector.startswith('.'):
            return selector[1:] in (self.attrs.get('class') or '').split()
        attr = re.fullmatch(r"\[([\w-]+)(?:(\*?=)['\"]?([^'\"]*)['\"]?)?\]", selector)
        if attr:
            name, op, value = attr.groups()
            actual = self.attrs.get(name)
            if not op:
                return name in self.attrs
            return actual is not None and (value in actual if op == '*=' else actual == value)
        if re.fullmatch('[a-z][a-z0-9-]*', selector):
            return self.tag == selector
        raise ValueError('unsupported_article_selector')

    def under_id(self, node_id):
        parent = self.parent
        while parent:
            if parent.attrs.get('id') == node_id:
                return True
            parent = parent.parent
        return False

    def text(self, exclude=(), clean=True):
        if clean and (self.tag in DROP_TAGS or 'hidden' in self.attrs
                      or self.attrs.get('aria-hidden') == 'true'
                      or self.attrs.get('role') in ('navigation', 'banner')
                      or DROP_CLASSES.intersection((self.attrs.get('class') or '').split())
                      or any(self.matches(selector) for selector in exclude)):
            return ''
        pieces = []
        for child in self.children:
            value = child.text(exclude, clean) if isinstance(child, Node) else child
            if value.strip():
                pieces.append(value.strip())
        return '\n'.join(pieces)


class Document(HTMLParser):
    def __init__(self, body):
        super().__init__(convert_charrefs=True)
        self.root = Node('document')
        self.stack = [self.root]
        self.count = 0
        self.feed(body)
        self.close()

    def handle_starttag(self, tag, attrs):
        self.count += 1
        if self.count > 100000 or len(self.stack) > 250:
            raise ValueError('article_structure_too_large')
        node = Node(tag, attrs, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)

    def title(self):
        return next((node.text(clean=False) for node in self.root.walk() if node.tag == 'title'), '')

    def article(self, profile):
        selectors = profile['selector'].split(',')
        exclude = profile.get('exclude', '').split(',') if profile.get('exclude') else []
        candidates = []
        for node in self.root.walk():
            if not any(node.matches(selector) for selector in selectors):
                continue
            if profile.get('within_id') and not node.under_id(profile['within_id']):
                continue
            if profile.get('has_child') and not any(isinstance(child, Node) and child.tag == profile['has_child'] for child in node.children):
                continue
            candidates.append(node.text(exclude))
        if not candidates:
            raise ValueError('missing_article_or_csr')
        return max(candidates, key=len)
