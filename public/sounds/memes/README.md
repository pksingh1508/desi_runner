# Local meme reactions

DESI RUN ships three licensed comic cues: `bounce.mp3` for slide/near-miss
reactions, `fail.mp3` for crashes, and `fanfare.mp3` for new records.
Their creators, original sources and licenses are in [ASSETS.md](../../../ASSETS.md)
and [audio credits](../credits.html). These are short sound effects; remaining
catchphrases use device speech or the existing synthesized vocal effect.

## Add or replace clips

1. Verify reuse rights and document the creator, source, license and edits in
   `ASSETS.md` and `public/sounds/credits.html`.
2. Copy the file here. Supported: `mp3`, `ogg`, `wav`, `m4a`, `aac`, `webm`,
   `opus`, `flac` (browser codec support varies). Use a plain filename with
   letters, digits, spaces, `- _ . ( )`. Maximum 3 MB and 8 seconds per clip.
3. Map it to an event in `manifest.json`. Each event accepts a filename, an
   object, or an array of up to four playable variants:

```json
{
  "crash": { "file": "fail.mp3", "caption": "AREY YAAR! 😭", "sub": "one more try?", "gain": 0.65 },
  "newRecord": "fanfare.mp3",
  "nearMiss": ["bounce.mp3", { "file": "another.mp3", "gain": 0.5 }]
}
```

Optional `caption` and `sub` replace the built-in text (80/100 characters max).
`gain` defaults to 0.8 and is clamped to 0.05–1. Variants avoid immediate repeats.
Events: `start`, `slide`, `nearMiss`, `rocket`, `rocketLand`, `danger`,
`speedBoost`, `crash`, `revive`, `newRecord`, `coinStorm`.

Clips load after the first user gesture, decode once per URL, and play through
the existing voice channel. MEMES and master mute apply; cooldowns, chances,
priorities and music ducking remain active. Pause, restart and leaving a run
stop current/queued reactions. Missing or invalid files fall back to the
built-in speech/synth cue; `{}` selects only those fallbacks.

Movement and pickup effects use `src/game/config/audioSamples.ts` and the SFX
channel. They share the same decoded-file cache, have short fades and voice
limits, and fall back to synthesized effects while loading or on failure.
The original desi soundtrack remains beat-synchronized with TAAL.
