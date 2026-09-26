# Meme voice clips (optional)

DESI RUN ships **no audio files**. Its built-in meme lines are license-free
recreations made at runtime:

- **"FAAAH!"** (crash) is synthesized live with formant synthesis
  (a synthetic glottal pulse shaped into an "f" + open "aaa" vowel).
- The catchphrases ("Arre bhai bhai bhai!", "Paisa hi paisa hoga!",
  "Picture abhi baaki hai, mere dost!", "Mogambo khush hua!",
  "How's the josh?" / "High sir!", "Bahut hard!", "Udd gaya!",
  "Chalo, bhaago!", "Jugaad!") are spoken by the player's own device
  through the browser's Web Speech API (Hindi voice when available,
  otherwise Indian-English / English).

No film audio, songs or recordings are included or streamed.

## Using your own clips

If you have the **rights to use** a recording (you made it, or its license
allows it), you can make the game play it instead of the built-in version:

1. Copy the audio file into this folder (`public/sounds/memes/`).
   Supported: `mp3`, `ogg`, `wav`, `m4a`, `aac`, `webm`, `opus`, `flac`.
   Plain file names only (letters, digits, spaces, `- _ . ( )`), max 3 MB.
2. List it in `manifest.json` under the gameplay moment it belongs to.
   A value can be one file name or a list (up to 4; one is picked at
   random, never the same twice in a row):

```json
{
  "crash": ["faaah.mp3"],
  "nearMiss": "arre-bhai.ogg",
  "newRecord": ["record-1.mp3", "record-2.mp3"]
}
```

Moments: `start`, `crash`, `nearMiss`, `coinStreak`, `coinStorm`, `revive`,
`newRecord`, `overdrive`, `rocket`, `powerup`, `combo`.

Clips play on the voice channel, so the **Voice lines** and **Mute**
settings apply, and the game's cooldowns/chances still decide when a line
plays. Missing files or invalid JSON are ignored silently — the built-in
recreations are used instead.

Keep `manifest.json` as `{}` to use only the built-in recreations. If you
commit clips to the repository, document their source and license in
`ASSETS.md` first.
