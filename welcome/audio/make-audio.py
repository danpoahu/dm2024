#!/usr/bin/env python3
"""Record the welcome-tour narration with macOS `say` (Ava Premium) -> audio/<hash>.m4a.
Run from STAGE/welcome:  python3 audio/make-audio.py
The hash must match clipFor() in index.html (djb2 xor, base36). Lines come from every say:'...'
in index.html plus the device-specific lines of the last scene, for every device."""
import re, subprocess, os, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(HERE, '..', 'index.html'), encoding='utf-8').read()

def js_unescape(t):
    return t.replace("\\'", "'").replace('\\u2019', '’')

lines = [js_unescape(m) for m in re.findall(r"say:'((?:[^'\\]|\\.)*)'", html)]
cs = html[html.index('const CHOOSE_SAY'):html.index('// ---------- scenes')]
for dev in ('iPhone', 'iPad'):
    lines += [js_unescape(m).replace("' + DEV + '", dev) for m in re.findall(r"'((?:[^'\\]|\\.)*?(?:' \+ DEV \+ '(?:[^'\\]|\\.)*)?)'", cs)]
lines = sorted(set(l for l in lines if len(l.split()) > 2))

def clip(text):
    h = 5381
    for ch in text:
        h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
    digits, n = '0123456789abcdefghijklmnopqrstuvwxyz', h
    out = ''
    while True:
        out = digits[n % 36] + out; n //= 36
        if n == 0: return out + '.m4a'

keep = {'silence.m4a'}
for text in lines:
    name = clip(text); keep.add(name)
    out = os.path.join(HERE, name)
    if os.path.exists(out): continue
    with tempfile.TemporaryDirectory() as td:
        aiff = os.path.join(td, 'a.aiff')
        subprocess.run(['say', '-v', 'Ava (Premium)', '-r', '185', '-o', aiff, text.replace('DISC', 'disk')], check=True)
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', aiff, out], check=True)
    print(name, text)
if not os.path.exists(os.path.join(HERE, 'silence.m4a')):
    with tempfile.TemporaryDirectory() as td:
        aiff = os.path.join(td, 's.aiff')
        subprocess.run(['say', '-v', 'Ava (Premium)', '-o', aiff, '[[slnc 200]]'], check=True)
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', aiff, os.path.join(HERE, 'silence.m4a')], check=True)
stale = [f for f in os.listdir(HERE) if f.endswith('.m4a') and f not in keep]
print(len(lines), 'lines;', 'stale (not referenced any more):', stale)
