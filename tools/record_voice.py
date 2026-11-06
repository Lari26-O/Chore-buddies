import json, re, sys, base64, time, numpy as np, lameenc, os
from kokoro_onnx import Kokoro
SP = os.path.dirname(os.path.abspath(__file__))
app = open('/home/user/Weeklan/chore-buddies/app.html').read()
cat = json.load(open(f'{SP}/voice_catalog.json'))
def norm(s): return re.sub(r'\s+', ' ', re.sub(r"[^a-z0-9' ]+", ' ', s.lower().replace('’', "'").replace('‘', "'"))).strip()
def split(t): return [x.strip() for x in re.split(r'(?<=[.!?])\s+', t) if x.strip()]
items = {}
def add(text):
    for s in split(text):
        k = norm(s)
        if k and k not in items: items[k] = s
for t in cat['catalog'] + cat['crawled']: add(t)
# template pieces from the question generators
g0 = app.index('const GEN = {'); g1 = app.index('const MORE = {', g0)
for lit in re.findall(r'`([^`]*)`', app[g0:g1], flags=re.S):
    for piece in re.split(r'\$\{[^}]*\}', lit):
        piece = piece.strip(' ,.;:')
        if len(norm(piece)) > 0: add(piece)
for lit in re.findall(r"'([^'\\]{2,90})'", app[g0:g1]):
    if re.search(r'[a-zA-Z]', lit) and not re.match(r'^[a-z]+$', lit): add(lit)
print('clips to record:', len(items), flush=True)
k = Kokoro(f'{SP}/kmodel/kokoro-v1.0.int8.onnx', f'{SP}/kmodel/voices-v1.0.bin')
packs, cur, size, keys = [], {}, 0, {}
t0 = time.time(); total_audio = 0
for n, (key, text) in enumerate(items.items()):
    say = text if re.search(r'[.!?]$', text) else text + ('.' if len(text.split()) > 2 else '')
    try:
        a, sr = k.create(say, voice='af_heart', speed=0.85, lang='en-us')
    except Exception as e:
        print('skip', repr(text), e, flush=True); continue
    a = np.asarray(a, dtype=np.float32); thr = 0.012
    nz = np.where(np.abs(a) > thr)[0]
    if len(nz): a = a[max(0, nz[0] - int(.03 * sr)): min(len(a), nz[-1] + int(.06 * sr))]
    total_audio += len(a) / sr
    enc = lameenc.Encoder(); enc.set_bit_rate(32); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    pcm = (np.clip(a, -1, 1) * 32767).astype('<i2').tobytes()
    mp3 = enc.encode(pcm) + enc.flush()
    b64 = base64.b64encode(mp3).decode()
    cur[key] = b64; size += len(b64); keys[key] = len(packs)
    if size > 3_500_000: packs.append(cur); cur, size = {}, 0
    if n % 100 == 0: print(f'{n}/{len(items)} {time.time()-t0:.0f}s audio {total_audio:.0f}s', flush=True)
if cur: packs.append(cur)
out = '/home/user/Weeklan/chore-buddies/voice'; os.makedirs(out, exist_ok=True)
for f in os.listdir(out): os.remove(os.path.join(out, f))
names = []
for i, p in enumerate(packs):
    fn = f'pack-{i + 1}.json'; json.dump(p, open(f'{out}/{fn}', 'w'), separators=(',', ':')); names.append('voice/' + fn)
json.dump({'voice': 'Kokoro af_heart', 'packs': names, 'keys': keys}, open(f'{out}/manifest.json', 'w'), separators=(',', ':'))
print('DONE', len(keys), 'clips', f'{total_audio:.0f}s audio', len(packs), 'packs', f'{time.time()-t0:.0f}s', flush=True)
