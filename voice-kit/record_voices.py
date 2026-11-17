#!/usr/bin/env python3
"""Free, offline, natural-sounding voice clips for a web app (no paid API).

Uses Kokoro, an open-source text-to-speech model (Apache 2.0, free for any use).
It records every sentence ahead of time and packs the clips into small JSON files
the app downloads and plays. Run it again after adding sentences: it only records
what is new.

Setup (once):
  pip install kokoro-onnx numpy lameenc
  download these two files next to this script, into a folder called kmodel/:
    https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
    https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

Use:
  python3 record_voices.py phrases.txt ../voice            (one sentence per line)
  python3 record_voices.py phrases.txt ../voice --voice af_heart --speed 0.85
Voices: af_heart (warm, kind - used in Chore Buddies), af_bella, af_nicole, af_sky,
        am_michael, am_adam, bf_emma (British), bm_george (British) ...
"""
import argparse, base64, json, os, re, sys
import numpy as np, lameenc
from kokoro_onnx import Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
def norm(s):  # the same key the web player uses
    return re.sub(r'\s+', ' ', re.sub(r"[^a-z0-9' ]+", ' ', s.lower().replace('’', "'").replace('‘', "'"))).strip()
def sentences(t):
    return [x.strip() for x in re.split(r'(?<=[.!?])\s+', t) if x.strip()]

ap = argparse.ArgumentParser()
ap.add_argument('phrases'); ap.add_argument('out')
ap.add_argument('--voice', default='af_heart'); ap.add_argument('--speed', type=float, default=0.85)
ap.add_argument('--lang', default='en-us'); ap.add_argument('--pack-mb', type=float, default=3)
ap.add_argument('--no-words', action='store_true', help='do not also record single words')
a = ap.parse_args()

os.makedirs(a.out, exist_ok=True)
man_path = os.path.join(a.out, 'manifest.json')
man = json.load(open(man_path)) if os.path.exists(man_path) else {'packs': [], 'keys': {}}
text = open(a.phrases, encoding='utf-8').read()
lines = json.loads(text) if a.phrases.endswith('.json') else text.splitlines()
todo = {}
for line in lines:
    for s in sentences(str(line)):
        k = norm(s)
        if k and k not in man['keys']: todo.setdefault(k, s)
        if not a.no_words:  # single words let the player stitch new sentences together
            for w in k.split():
                if w not in man['keys']: todo.setdefault(w, w)
print('to record:', len(todo), flush=True)
if not todo: sys.exit(0)

tts = Kokoro(os.path.join(HERE, 'kmodel', 'kokoro-v1.0.int8.onnx'), os.path.join(HERE, 'kmodel', 'voices-v1.0.bin'))
pack, size, limit = {}, 0, a.pack_mb * 1024 * 1024
def flush():
    global pack, size
    if not pack: return
    idx = len(man['packs']); name = f'pack-{idx + 1}.json'
    json.dump(pack, open(os.path.join(a.out, name), 'w'), separators=(',', ':'))
    man['packs'].append(os.path.basename(a.out.rstrip('/')) + '/' + name)
    for k in pack: man['keys'][k] = idx
    json.dump(man, open(man_path, 'w'), separators=(',', ':'))
    print('wrote', name, len(pack), 'clips', flush=True); pack, size = {}, 0
for n, (key, s) in enumerate(todo.items(), 1):
    say = s if re.search(r'[.!?]$', s) else s + ('.' if len(s.split()) > 2 else '')
    audio, sr = tts.create(say, voice=a.voice, speed=a.speed, lang=a.lang)
    audio = np.asarray(audio, dtype=np.float32)
    nz = np.where(np.abs(audio) > .012)[0]  # trim silence so stitched words flow
    if len(nz): audio = audio[max(0, nz[0] - int(.03 * sr)): min(len(audio), nz[-1] + int(.06 * sr))]
    enc = lameenc.Encoder(); enc.set_bit_rate(32); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    mp3 = enc.encode((np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()) + enc.flush()
    pack[key] = base64.b64encode(mp3).decode(); size += len(pack[key])
    if size > limit: flush()
    if n % 50 == 0: print(n, '/', len(todo), flush=True)
flush(); print('done. total clips:', len(man['keys']))
