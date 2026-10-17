// Sounds, music and tones of the Pygame Zero host with Web Audio. Browsers allow sound only after a user interaction:
// until unlock() is called from a click or key press, commands are dropped (music is remembered and starts then) and
// onLocked() asks the page to show a hint.

import { toneEnvelope } from './pgzeroMath.js';

/**
 * @param {{
 *   volume?: number, muted?: boolean,
 *   buffer: (kind: 'sounds'|'music', name: string) => AudioBuffer|null,
 *   onMusicEnd?: () => void,
 *   onLocked?: () => void,
 *   onUnlocked?: () => void,
 * }} opts
 */
export function createAudio(opts) {
  /** @type {AudioContext|null} */
  let ac = null;
  let master = null, musicGain = null;
  let volume = opts.volume ?? 1, muted = !!opts.muted;
  /** @type {Map<string, Set<{ src: AudioBufferSourceNode, gain: GainNode }>>} playing sounds by name */
  const playing = new Map();
  /** @type {Map<string, number>} volume per sound name */
  const soundVolume = new Map();
  let music = null; // { name, loop, src, startedAt, offset, paused, ending }
  let queued = null, musicVol = 1, wanted = false;
  /** Calls for the tests and for debugging: [name, ...args] of every command that made sound. */
  const log = [];

  const Ctx = () => (typeof window !== 'undefined' ? window.AudioContext || /** @type {any} */ (window).webkitAudioContext : null);

  const audio = {
    get unlocked() { return !!ac; },
    get volume() { return volume; },
    set volume(v) { volume = Math.max(0, Math.min(1, Number(v) || 0)); apply(); },
    get muted() { return muted; },
    set muted(m) { muted = !!m; apply(); },
    log,

    /** Call from a user interaction: creates (or resumes) the AudioContext. */
    unlock() {
      if (ac) { if (ac.state === 'suspended' && !hidden) ac.resume?.(); return; }
      const C = Ctx();
      if (!C) return;
      try { ac = new C(); } catch { ac = null; return; }
      master = ac.createGain();
      master.connect(ac.destination);
      musicGain = ac.createGain();
      musicGain.connect(master);
      apply();
      ac.resume?.();
      opts.onUnlocked?.();
      if (music && !music.src && !music.paused) startMusic(music.offset ?? 0);
    },

    /** Execute a sound command of the bridge; returns false if it is not one. */
    cmd(name, a) {
      switch (name) {
        case 'sound_play': if (want()) playSound(a[0], a[1] | 0, a[2] | 0, a[3] | 0, a[4] ?? 1); return true;
        case 'sound_stop': for (const p of playing.get(a[0]) ?? []) stopNode(p.src); return true;
        case 'sound_fadeout': {
          for (const p of playing.get(a[0]) ?? []) fade(p.gain, p.src, a[1]);
          return true;
        }
        case 'sound_volume': {
          soundVolume.set(a[0], a[1]);
          for (const p of playing.get(a[0]) ?? []) p.gain.gain.value = a[1];
          return true;
        }
        case 'music_play': {
          stopMusic(false);
          music = { name: a[0], loop: a[1] === -1, src: null, offset: 0, paused: false };
          queued = null;
          if (want()) startMusic(0);
          return true;
        }
        case 'music_queue': if (music) queued = a[0]; else { music = { name: a[0], loop: false, src: null, offset: 0, paused: false }; if (want()) startMusic(0); } return true;
        case 'music_stop': stopMusic(true); return true;
        case 'music_pause': if (music && !music.paused) { music.offset = position(); halt(); music.paused = true; } return true;
        case 'music_unpause': if (music?.paused) { music.paused = false; if (ac) startMusic(music.offset); } return true;
        case 'music_rewind': if (music && !music.paused) { halt(); if (ac) startMusic(0); } else if (music) music.offset = 0; return true;
        case 'music_set_pos': if (music) { const p = Number(a[0]) || 0; if (music.paused) music.offset = p; else { halt(); if (ac) startMusic(p); } } return true;
        case 'music_fadeout': {
          if (!music) return true;
          if (!music.src || !ac) { stopMusic(true); return true; }
          const m = music;
          const t = ac.currentTime, s = Math.max(0, a[0]) / 1000;
          m.gain.gain.cancelScheduledValues?.(t);
          m.gain.gain.setValueAtTime(m.gain.gain.value, t);
          m.gain.gain.linearRampToValueAtTime(0, t + s);
          m.ending = setTimeout(() => { if (music === m) stopMusic(true); }, s * 1000);
          return true;
        }
        case 'music_volume': musicVol = a[0]; if (musicGain) musicGain.gain.value = musicVol; return true;
        case 'tone': if (want()) playTone(a[0], a[1], a[2] ?? 1); return true;
        default: return false;
      }
    },

    /** The tab is hidden: stop the clock of the sound (and go on later). */
    suspend() { hidden = true; ac?.suspend?.(); },
    resume() { hidden = false; if (ac?.state === 'suspended') ac.resume?.(); },
    /** The game ended: silence. */
    stopAll() {
      for (const set of playing.values()) for (const p of set) stopNode(p.src);
      playing.clear();
      stopMusic(false);
      music = null; queued = null; wanted = false;
      soundVolume.clear();
      musicVol = 1;
      if (musicGain) musicGain.gain.value = 1;
    },
  };
  let hidden = false;

  function apply() { if (master) master.gain.value = muted ? 0 : volume; }

  /** Sound is wanted: false (and a hint for the page) while the browser does not allow it yet. */
  function want() {
    if (ac) return true;
    if (!wanted) { wanted = true; opts.onLocked?.(); }
    return false;
  }

  function stopNode(src) { try { src.onended = null; src.stop(); } catch { /* not started */ } }

  function fade(gain, src, ms) {
    const t = ac.currentTime, s = Math.max(0, ms) / 1000;
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + s);
    try { src.stop(t + s); } catch { /* ignore */ }
  }

  function playSound(name, loops, maxtime, fadeMs, vol) {
    const buf = opts.buffer('sounds', name);
    if (!buf) return;
    let count = 0;
    for (const s of playing.values()) count += s.size;
    if (count >= 16) return; // like a full mixer: no free channel
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    const v = soundVolume.get(name) ?? vol;
    const t = ac.currentTime;
    if (fadeMs > 0) { gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(v, t + fadeMs / 1000); } else gain.gain.value = v;
    src.connect(gain);
    gain.connect(master);
    let stopAt = 0;
    if (loops !== 0) { src.loop = true; if (loops > 0) stopAt = (loops + 1) * buf.duration; }
    if (maxtime > 0) stopAt = stopAt ? Math.min(stopAt, maxtime / 1000) : maxtime / 1000;
    const entry = { src, gain };
    if (!playing.has(name)) playing.set(name, new Set());
    playing.get(name).add(entry);
    src.onended = () => playing.get(name)?.delete(entry);
    src.start(t);
    if (stopAt) src.stop(t + stopAt);
    log.push(['sound', name, loops, maxtime, fadeMs, v]);
  }

  function playTone(hz, samples, vol) {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const gain = ac.createGain();
    const env = toneEnvelope(samples);
    gain.gain.setValueAtTime(0, t);
    for (const [s, g] of env.slice(1)) gain.gain.linearRampToValueAtTime(g * vol * 0.5, t + s);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + env[env.length - 1][0] + 0.01);
    log.push(['tone', hz, samples, vol]);
  }

  function position() {
    if (!music || !music.src || !ac) return music?.offset ?? 0;
    const d = music.src.buffer.duration || 1;
    const p = music.offset + (ac.currentTime - music.startedAt);
    return music.loop ? p % d : Math.min(p, d);
  }

  function startMusic(offset) {
    const m = music;
    const buf = opts.buffer('music', m.name);
    if (!buf || !ac) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = m.loop;
    const gain = ac.createGain();
    gain.connect(musicGain);
    src.connect(gain);
    m.src = src; m.gain = gain; m.offset = offset; m.startedAt = ac.currentTime;
    src.onended = () => {
      if (music !== m || m.src !== src) return;
      m.src = null;
      if (queued) { const q = queued; queued = null; music = { name: q, loop: false, src: null, offset: 0, paused: false }; startMusic(0); }
      else music = null;
      opts.onMusicEnd?.();
    };
    src.start(ac.currentTime, Math.max(0, Math.min(offset, buf.duration)));
    log.push(['music', m.name, m.loop ? -1 : 0, offset]);
  }

  /** Stop the playing source without ending the track (pause, rewind). */
  function halt() {
    if (!music?.src) return;
    const s = music.src;
    music.src = null;
    stopNode(s);
    music.gain?.disconnect?.();
  }

  function stopMusic(report) {
    if (!music) return;
    clearTimeout(music.ending);
    const was = !!music;
    halt();
    music = null;
    queued = null;
    if (report && was) opts.onMusicEnd?.();
  }

  return audio;
}
