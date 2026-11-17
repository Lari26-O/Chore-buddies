# Free natural voices for a web app (Kokoro)

This is how Chore Buddies talks, for free. No paid voice service, no API key, no cost per use.

1. **Kokoro** is a free, open-source voice model (Apache 2.0 license, OK for any app). It runs on a normal computer or a cloud coding session.
2. **`record_voices.py`** reads a list of sentences, records each one with Kokoro (voice `af_heart`, speed 0.85), and saves them as small MP3 clips packed into `voice/pack-N.json` files, plus `voice/manifest.json`. It also records each single word, so new sentences can be stitched together from words.
3. **`voice-player.js`** goes in the app. `VoicePlayer.say('text')` plays the recorded clip. If a sentence wasn't recorded it stitches it from words, and if that isn't possible it falls back to the device's built-in voice.
4. When you add new sentences to the app, run the script again. It only records the new ones.

```
pip install kokoro-onnx numpy lameenc
mkdir kmodel   # then download the two model files listed at the top of record_voices.py into it
python3 record_voices.py phrases.txt ../voice --voice af_heart --speed 0.85
```

Sizes: each clip is about 5 to 15 KB (32 kbps mono MP3). About 1,000 sentences is about 8 MB.
Tip: play voices only after a tap. iPhone and iPad block sound until the person touches the screen.
