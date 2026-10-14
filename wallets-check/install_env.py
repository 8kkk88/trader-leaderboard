#!/usr/bin/env python3
"""Validate runtime proxy credentials without printing or committing them."""
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit


def validate_proxy(value):
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme in ('http', 'https') and parsed.hostname and parsed.username
                 and parsed.password and parsed.port and not any(c in value for c in '\r\n\0'))
    except ValueError:
        valid = False
    if not valid:
        raise ValueError('PROXY_URL must include runtime user:password@host:port credentials.')
    return value


def main():
    try:
        proxy = validate_proxy(os.environ.get('PROXY_URL', ''))
    except ValueError:
        print('Proxy credentials missing or invalid; nothing installed.', file=sys.stderr)
        return 1
    if sys.argv[1:] == ['--validate']:
        return 0
    target = Path('/etc/wallets-check/environment')
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    target.parent.chmod(0o700)
    quoted = '"' + proxy.replace('\\', '\\\\').replace('"', '\\"') + '"'
    # A root-owned file outside the repository; systemd reads it at invocation time.
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as out:
        for name in ('http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY'):
            out.write(name + '=' + quoted + '\n')
    target.chmod(0o600)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
