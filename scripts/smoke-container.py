#!/usr/bin/env python3
"""Validate a root-mounted persistent volume and HTTPS reverse-proxy cookies."""
import json
import os
import secrets
import subprocess
import time
import urllib.request
import uuid

name = 'hera-smoke-' + uuid.uuid4().hex[:10]
volume = name + '-data'
env = dict(os.environ, STUDIO_PASSWORD=secrets.token_urlsafe(32))
def docker(*args):
    return subprocess.check_output(['docker', *args], env=env, stderr=subprocess.STDOUT).decode().strip()
def request(route, body=None, cookie=None):
    headers = {'Host': 'hera.example', 'X-Forwarded-Proto': 'https', 'Origin': 'https://hera.example'}
    if cookie:
        headers['Cookie'] = cookie
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request('http://127.0.0.1:3112/api' + route,
        data=json.dumps(body).encode() if body is not None else None, headers=headers)
    return urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=5)
try:
    docker('run', '-d', '--name', name, '--user', '0', '--shm-size=1g',
        '-p', '127.0.0.1:3112:3000', '-v', volume + ':/app/data',
        '-e', 'STUDIO_PASSWORD', '-e', 'COOKIE_SECURE=1', '-e', 'TRUST_PROXY=1', 'hera-video:local')
    for i in range(100):
        try:
            if request('/health').status == 200:
                break
        except Exception:
            time.sleep(.2)
    else:
        raise RuntimeError('El contenedor no arrancó')
    with request('/login', {'password': env['STUDIO_PASSWORD']}) as response:
        cookie = response.headers['Set-Cookie']
        assert all(v in cookie for v in ['HttpOnly', 'Secure', 'SameSite=Strict'])
    cookie = cookie.split(';')[0]
    with request('/status', cookie=cookie) as response:
        assert json.load(response)['openai'] is False
    uid = docker('exec', name, 'sh', '-c', "awk '/^Uid:/{print $2}' /proc/1/status")
    assert uid == '1000', 'El proceso debe ejecutarse sin privilegios'
    docker('restart', name)
    for i in range(100):
        try:
            if request('/projects', cookie=cookie).status == 200:
                break
        except Exception:
            time.sleep(.2)
    else:
        raise RuntimeError('La sesión persistente no se recuperó')
    print('Docker smoke: volumen inicializado, proceso sin privilegios, cookies HTTPS y sesión tras reinicio correctos; OpenAI sin configurar.')
finally:
    subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['docker', 'volume', 'rm', volume], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
