#!/usr/bin/env python3
"""Build with optional cloud proxy/CA secrets; no credential values are logged."""
import os
import socket
import subprocess
from urllib.parse import urlsplit

args = ['docker', '--config', '/tmp/hera-docker', 'build', '--network=host']
proxy = os.environ.get('HTTPS_PROXY')
if proxy:
    host = urlsplit(proxy).hostname
    address = socket.gethostbyname(host)
    args += ['--add-host', f'{host}:{address}', '--secret', 'id=build_proxy,env=HTTPS_PROXY']
certificate = os.environ.get('NODE_EXTRA_CA_CERTS')
if certificate:
    args += ['--secret', f'id=build_ca,src={certificate}']
args += ['-t', 'hera-video:local', '.']
raise SystemExit(subprocess.call(args))
