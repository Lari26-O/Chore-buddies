import json, re, base64, os, numpy as np, lameenc
from kokoro_onnx import Kokoro
SP = os.path.dirname(os.path.abspath(__file__)); out = '/home/user/Weeklan/chore-buddies/voice'
def norm(s): return re.sub(r'\s+', ' ', re.sub(r"[^a-z0-9' ]+", ' ', s.lower().replace('’', "'").replace('‘', "'"))).strip()
man = json.load(open(f'{out}/manifest.json')); miss = json.load(open(f'{SP}/vmiss.json'))
# also every single word that appears in a missing sentence, so new combinations can be stitched
words = set()
for s in miss:
    for w in norm(s).split():
        if w not in man['keys']: words.add(w)
todo = {}
for s in miss:
    k = norm(s)
    if k and k not in man['keys']: todo[k] = s
for w in words: todo.setdefault(w, w)
print('recording', len(todo), flush=True)
k = Kokoro(f'{SP}/kmodel/kokoro-v1.0.int8.onnx', f'{SP}/kmodel/voices-v1.0.bin')
pack = {}
for key, text in todo.items():
    say = text if re.search(r'[.!?]$', text) else text + ('.' if len(text.split()) > 2 else '')
    a, sr = k.create(say, voice='af_heart', speed=0.85, lang='en-us'); a = np.asarray(a, dtype=np.float32)
    nz = np.where(np.abs(a) > .012)[0]
    if len(nz): a = a[max(0, nz[0] - int(.03 * sr)): min(len(a), nz[-1] + int(.06 * sr))]
    enc = lameenc.Encoder(); enc.set_bit_rate(32); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    pack[key] = base64.b64encode(enc.encode((np.clip(a, -1, 1) * 32767).astype('<i2').tobytes()) + enc.flush()).decode()
idx = len(man['packs']); fn = f'pack-{idx + 1}.json'
json.dump(pack, open(f'{out}/{fn}', 'w'), separators=(',', ':')); man['packs'].append('voice/' + fn)
for key in pack: man['keys'][key] = idx
json.dump(man, open(f'{out}/manifest.json', 'w'), separators=(',', ':'))
print('DONE', len(pack), 'added; total', len(man['keys']), flush=True)
