const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');

// Compile the focused browser-audio modules using the project's existing TS dependency.
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
const { AudioClipLibrary } = require('../src/game/audio/AudioClipLibrary.ts');
const { SampledSfx } = require('../src/game/audio/SampledSfx.ts');
const { MemeClips } = require('../src/game/audio/MemeClips.ts');
const { MemeVoice } = require('../src/game/audio/MemeVoice.ts');
const { AUDIO_CLIP_LIMITS } = require('../src/game/config/audioSamples.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));

function graph() {
  const sources = [];
  const gains = [];
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, disconnected: false, disconnect() { this.disconnected = true; } });
  const ctx = {
    currentTime: 10,
    createBufferSource() {
      const s = { ...node(), buffer: null, playbackRate: param(), onended: null, stopped: false,
        start(...args) { this.started = args; }, stop() { this.stopped = true; } };
      sources.push(s); return s;
    },
    createGain() { const g = { ...node(), gain: param() }; gains.push(g); return g; },
  };
  return { ctx, sfxBus: {}, voiceBus: {}, sources, gains };
}

test('one fetch/decode is shared; unavailable, oversized and long clips fall back', async t => {
  let fetched = 0, decoded = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetched++; return new Response(new Uint8Array(16)); });
  const library = new AudioClipLibrary();
  const ctx = { async decodeAudioData() { decoded++; return { duration: 1 }; } };
  const a = library.load(ctx, '/same.mp3'), b = library.load(ctx, '/same.mp3');
  assert.equal(a, b); assert.equal((await a).duration, 1);
  assert.equal(fetched, 1); assert.equal(decoded, 1);
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  assert.equal(await library.load(ctx, '/missing.mp3'), null);
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(AUDIO_CLIP_LIMITS.maxBytes + 1)));
  assert.equal(await library.load(ctx, '/large.mp3'), null);
  assert.equal(decoded, 1);
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(16)));
  assert.equal(await library.load({ decodeAudioData: async () => ({ duration: 99 }) }, '/long.mp3'), null);
  assert.equal(await library.load({ decodeAudioData: async () => { throw Error('bad mp3'); } }, '/bad.mp3'), null);
  library.dispose();
});

test('dispose aborts requests and discards an in-progress decode', async t => {
  let signal, resolveDecode;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    signal = options.signal; return new Response(new Uint8Array(8));
  });
  const library = new AudioClipLibrary();
  const task = library.load({ decodeAudioData: () => new Promise(r => { resolveDecode = r; }) }, '/late.mp3');
  await flush(); library.dispose();
  assert.equal(signal.aborted, true);
  resolveDecode({ duration: 1 });
  assert.equal(await task, null);
  assert.equal(await library.load({}, '/after-dispose.mp3'), null);
});

test('sample cooldowns, voice limits, mute and teardown prevent overlapping/stale audio', async () => {
  const g = graph();
  const samples = new SampledSfx(g, { load: async () => ({ duration: 1 }) });
  assert.equal(samples.play('coin'), false, 'not loaded: synth fallback');
  await flush();
  assert.equal(samples.play('coin'), true);
  samples.play('coin'); assert.equal(g.sources.length, 1, 'rapid coins are throttled');
  for (let i = 0; i < 8; i++) { g.ctx.currentTime += 0.1; samples.play('coin'); }
  assert.equal(g.sources.length, 4, 'coin voices are bounded');
  g.sources[0].onended();
  g.ctx.currentTime += 0.1; samples.play('coin');
  assert.equal(g.sources.length, 5, 'ended source frees its slot');
  samples.setEnabled(false);
  assert(g.sources.slice(1).every(s => s.stopped && s.disconnected));
  assert(g.gains.every(gain => gain.disconnected));
  samples.play('jump'); assert.equal(g.sources.length, 5);
  samples.setEnabled(true); samples.play('slide');
  assert.equal(g.sources.at(-1).started[2], 0.5, 'slide excerpt is bounded');
  assert.equal(g.sources.at(-1).playbackRate.value, 1.2);
  samples.dispose(); assert(g.sources.at(-1).stopped);
  samples.play('slide'); assert.equal(g.sources.length, 6);
});

test('failed samples request synth fallback; late loads cannot revive a disposed player', async () => {
  const missing = new SampledSfx(graph(), { load: async () => null });
  await flush(); assert.equal(missing.play('coin'), false); missing.dispose();
  const g = graph(); const pending = [];
  const samples = new SampledSfx(g, { load: () => new Promise(r => pending.push(r)) });
  samples.dispose(); pending.forEach(r => r({ duration: 1 })); await flush();
  samples.play('jump'); assert.equal(g.sources.length, 0);
});

test('manifest supports old filenames and metadata, rejects paths and avoids repeat variants', async t => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    crash: ['one.mp3', { file: 'two.mp3', caption: '  OOPS!  ', sub: ' try again ', gain: 9 }, '../escape.mp3'],
    newRecord: { file: 'win.mp3', gain: 'invalid' },
  }));
  const clips = new MemeClips({ load: async (_ctx, url) => { urls.push(url); return { duration: 1 }; } });
  clips.load({}); await flush();
  assert.equal(clips.count, 3);
  assert(urls.every(url => !url.includes('escape')));
  t.mock.method(Math, 'random', () => 0);
  assert.equal(clips.pick('crash').gain, 0.8);
  assert.deepEqual(clips.pick('crash'), { buffer: { duration: 1 }, caption: 'OOPS!', sub: 'try again', gain: 1 });
  assert.equal(clips.pick('crash').gain, 0.8);
  assert.equal(clips.pick('newRecord').gain, 0.8);
  clips.dispose(); assert.equal(clips.pick('crash'), null);
});

test('disposing during manifest loading drops decoded results', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ crash: 'late.mp3' }));
  let resolveClip;
  const clips = new MemeClips({ load: () => new Promise(r => { resolveClip = r; }) });
  clips.load({}); await flush(); clips.dispose();
  resolveClip({ duration: 1 }); await flush(); assert.equal(clips.count, 0);
});

test('pause, mute, disable and restart cancel both current reactions and queued timers', t => {
  const timers = new Map(); let id = 0;
  globalThis.window = {
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); },
  };
  t.after(() => { delete globalThis.window; });
  t.mock.method(Math, 'random', () => 0);
  for (const mode of ['pause', 'mute', 'disable', 'restart']) {
    const g = graph(), captions = [], duck = [];
    const clip = { buffer: { duration: 1 }, caption: 'LOCAL CLIP', gain: 0.6 };
    const voice = new MemeVoice(g, { stinger() { assert.fail('sample must replace the synth stinger'); } }, {},
      { pick: () => clip }, on => duck.push(on));
    voice.onCaption = (...args) => captions.push(args);
    assert.equal(voice.play('rocket'), true);
    assert.equal(voice.play('rocketLand'), true, 'high-priority follow-up queues');
    assert.deepEqual(captions[0], ['LOCAL CLIP', undefined]);
    if (mode === 'pause') voice.freeze(true);
    if (mode === 'mute') voice.setMuted(true);
    if (mode === 'disable') voice.setEnabled(false);
    if (mode === 'restart') voice.reset();
    assert.equal(g.sources[0].stopped, true);
    assert.equal(timers.size, 0, mode);
    g.sources[0].onended(); assert.equal(g.sources.length, 1, 'no stale queued playback');
    assert.equal(duck.at(-1), false);
    if (mode === 'pause') { assert.equal(voice.play('crash'), false); voice.freeze(false); }
    if (mode === 'mute') voice.setMuted(false);
    if (mode === 'disable') voice.setEnabled(true);
    voice.reset(); assert.equal(voice.play('rocket'), true, 'new run clears cooldown');
    voice.dispose(); assert.equal(timers.size, 0);
  }
});
