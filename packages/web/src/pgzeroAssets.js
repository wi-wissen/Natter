// Resources of the Pygame Zero host: images, sounds, music and fonts from the project files (images/, sounds/, music/,
// fonts/), from asset packs on the web (packages/assets/<pack>/pack.json, sounds/sounds.json) and from the page
// (addImage, addSound). Everything a program may use is loaded before it starts, because the bridge asks
// synchronously (host.pgz.resource).

import { usedNames, wavSeconds } from './pgzeroMath.js';

const EXT = {
  images: ['png', 'gif', 'jpg', 'jpeg', 'bmp', 'svg', 'webp'],
  sounds: ['wav', 'ogg', 'mp3', 'oga', 'm4a'],
  music: ['ogg', 'mp3', 'wav', 'oga', 'm4a'],
  fonts: ['ttf', 'otf', 'woff', 'woff2'],
};
const MIME = { png: 'image/png', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp',
  wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };

const TEXT = {
  de: {
    image: 'Bild', sound: 'Klang', music: 'Musik', font: 'Schrift',
    missing: (what, name, where) => `${what} „${name}“ nicht gefunden. Gesucht: ${where}.`,
    project: (dir, name, exts) => `${dir}/${name}.${exts[0]} (auch .${exts.slice(1, 4).join(', .')} …) im Projekt`,
    packs: (list) => `in den Paketen ${list}`,
    page: 'bei den Bildern der Seite',
    notLoaded: (pack) => `Es gibt „${pack.name}“ im Paket ${pack.pack}, es wurde aber nicht vorab geladen, weil der Name nicht wörtlich im Programm steht. Schreibe ihn einmal aus, z. B. in einer Liste.`,
    similar: (n) => `Meintest du „${n}“?`,
    failed: (file) => `Die Datei ${file} ließ sich nicht laden.`,
  },
  en: {
    image: 'Image', sound: 'Sound', music: 'Music', font: 'Font',
    missing: (what, name, where) => `${what} '${name}' not found. Looked for: ${where}.`,
    project: (dir, name, exts) => `${dir}/${name}.${exts[0]} (also .${exts.slice(1, 4).join(', .')} …) in the project`,
    packs: (list) => `in the packs ${list}`,
    page: 'among the images of the page',
    notLoaded: (pack) => `'${pack.name}' exists in the pack ${pack.pack} but was not loaded in advance because its name is not written out in the program. Write it out once, e.g. in a list.`,
    similar: (n) => `Did you mean '${n}'?`,
    failed: (file) => `The file ${file} could not be loaded.`,
  },
};
const WHAT = { images: 'image', sounds: 'sound', music: 'music', fonts: 'font' };

/** Value of a project file (data: URL, SVG text, Blob, ArrayBuffer, typed array, { url }) → Blob. */
async function toBlob(v, ext, fetchFn) {
  if (typeof Blob !== 'undefined' && v instanceof Blob) return v;
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return new Blob([v], { type: MIME[ext] });
  if (typeof v === 'string') {
    if (v.startsWith('data:')) return (await fetchFn(v)).blob();
    return new Blob([v], { type: MIME[ext] ?? 'application/octet-stream' });
  }
  if (v && typeof v.url === 'string') return (await fetchFn(v.url)).blob();
  throw new Error('unsupported file value');
}

async function loadImage(blobOrUrl) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try { await img.decode(); } catch {
    await new Promise((res, rej) => { if (img.complete && img.naturalWidth) res(); else { img.onload = res; img.onerror = rej; } });
  }
  return { img, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
}

let decoder = null;
async function decodeAudio(buf) {
  const copy = buf.slice(0);
  try {
    const C = typeof window !== 'undefined' ? window.OfflineAudioContext || /** @type {any} */ (window).webkitOfflineAudioContext : null;
    if (C) {
      decoder ??= new C(1, 1, 44100);
      const b = await decoder.decodeAudioData(buf);
      return { buffer: b, seconds: b.duration };
    }
  } catch { /* fall back to the WAV header */ }
  return { buffer: null, seconds: wavSeconds(copy) ?? 1 };
}

/** Image of the page: canvas, image, bitmap, SVG text or URL → { img, w, h }. */
async function pageImage(src, size) {
  const e = await pageImage0(src);
  return size ? { ...e, w: size[0], h: size[1] } : e;
}
async function pageImage0(src) {
  if (typeof src === 'string') {
    if (src.trimStart().startsWith('<')) return loadImage(new Blob([src], { type: 'image/svg+xml' }));
    return loadImage(src);
  }
  if (src instanceof HTMLImageElement) { if (!src.complete) await src.decode(); return { img: src, w: src.naturalWidth, h: src.naturalHeight }; }
  return { img: src, w: src.width, h: src.height };
}

/** Closest name (case or a typo), for a hint. */
function similar(name, names) {
  const low = name.toLowerCase();
  let best = null, bd = 3;
  for (const n of names) {
    if (n.toLowerCase() === low) return n;
    const d = lev(low, n.toLowerCase());
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * @param {{
 *   assets?: { baseUrl: string, packs: string[] } | { baseUrl: string, packs: string[] }[],
 *   preload?: 'used'|'all',
 *   lang?: 'de'|'en',
 *   fetch?: typeof fetch,
 * }} [opts]
 */
export function createAssets(opts = {}) {
  const fetchFn = opts.fetch ?? ((...a) => fetch(...a));
  const sources = opts.assets ? (Array.isArray(opts.assets) ? opts.assets : [opts.assets]) : [];
  const T = TEXT[opts.lang ?? 'de'] ?? TEXT.en;
  /** @type {Map<string, Promise<any>>} loaded files by URL (kept across runs) */
  const cache = new Map();
  /** @type {Promise<any[]>|null} the pack lists */
  let packList = null;
  /** Images and sounds of the page (fallbacks: the project and the packs come first). */
  const page = { images: new Map(), sounds: new Map() };
  /** What the current run can use: kind → Map(name → entry). */
  let ready = { images: new Map(), sounds: new Map(), music: new Map(), fonts: new Map() };
  /** Names in the packs that were not loaded: name → { pack, name, kind } */
  let unloaded = new Map();
  const families = {};
  let fontId = 0;

  function cached(key, fn) {
    if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; }));
    return cache.get(key);
  }

  /** Read the lists of all packs once: [{ kind, name, url, pack }]. */
  function packs() {
    packList ??= Promise.all(sources.flatMap((s) => s.packs.map(async (pack) => {
      const base = s.baseUrl.endsWith('/') ? s.baseUrl : s.baseUrl + '/';
      for (const file of ['pack.json', `${pack}.json`]) {
        try {
          const r = await fetchFn(base + pack + '/' + file);
          if (!r.ok) continue;
          const j = await r.json();
          const out = [];
          for (const [key, kind] of [['assets', 'images'], ['images', 'images'], ['sounds', 'sounds'], ['music', 'music']]) {
            for (const a of j[key] ?? []) if (a?.name && a?.file) out.push({ kind, name: a.name, url: base + pack + '/' + a.file, pack });
          }
          return out;
        } catch { /* try the next name */ }
      }
      console.warn(`[natter pgzero] asset pack '${pack}' not found at ${base}`);
      return [];
    }))).then((l) => l.flat());
    return packList;
  }

  const assets = {
    families,
    /**
     * Register an image of the page (canvas, image, ImageBitmap, SVG text or URL), used when the project and the packs
     * do not have it. size: [w, h] in game pixels (default: the size of the source; a canvas drawn at 2x passes its half size).
     */
    addImage(name, src, size) { page.images.set(name, pageImage(src, size)); return assets; },
    /** Register a sound of the page (AudioBuffer or URL). */
    addSound(name, src) {
      page.sounds.set(name, src instanceof (globalThis.AudioBuffer ?? class {}) ? Promise.resolve({ buffer: src, seconds: src.duration })
        : fetchFn(src).then((r) => r.arrayBuffer()).then(decodeAudio));
      return assets;
    },

    /**
     * Load what a program may use: all resource files of the project, the pack files whose names occur in the
     * program (or all with preload 'all'), and the page's images. Returns the problems (files that failed).
     * @param {string[]} texts  the program and the other .py files of the project
     * @param {Record<string, any>} files  the project files (path → content)
     */
    async prepare(texts, files = {}) {
      const next = { images: new Map(), sounds: new Map(), music: new Map(), fonts: new Map() };
      const problems = [];
      const jobs = [];
      const add = (kind, name, p, file) => jobs.push(p.then((e) => { if (!next[kind].has(name)) next[kind].set(name, { ...e, file }); })
        .catch(() => problems.push(T.failed(file))));
      // the project
      for (const [path0, v] of Object.entries(files)) {
        const path = path0.replace(/^\.?\//, '');
        const m = /^(images|sounds|music|fonts)\/(.+)\.([a-z0-9]+)$/i.exec(path);
        if (!m) continue;
        const kind = m[1].toLowerCase(), name = m[2], ext = m[3].toLowerCase();
        if (!EXT[kind].includes(ext)) continue;
        const blob = () => toBlob(v, ext, fetchFn);
        if (kind === 'images') add(kind, name, blob().then(loadImage), path);
        else if (kind === 'fonts') add(kind, name, blob().then((b) => b.arrayBuffer()).then(async (buf) => {
          const family = `natter-pgz-font-${++fontId}`;
          const face = new FontFace(family, buf);
          await face.load();
          document.fonts.add(face);
          families[name] = family;
          return { family };
        }), path);
        else add(kind, name, blob().then((b) => b.arrayBuffer()).then(decodeAudio), path);
      }
      // the packs
      const list = await packs();
      const want = opts.preload === 'all' ? new Set(list.map((a) => a.name)) : new Set(usedNames(texts, list.map((a) => a.name)));
      unloaded = new Map();
      for (const a of list) {
        if (!want.has(a.name)) { unloaded.set(a.name, a); continue; }
        const load = a.kind === 'images' ? () => fetchFn(a.url).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(loadImage)
          : () => fetchFn(a.url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(decodeAudio);
        add(a.kind, a.name, cached(a.url, load), a.url);
      }
      await Promise.all(jobs);
      // the page (only where nothing else has the name)
      for (const kind of ['images', 'sounds']) {
        for (const [name, p] of page[kind]) {
          if (next[kind].has(name)) continue;
          try { next[kind].set(name, { ...(await p), file: 'page' }); } catch { problems.push(T.failed(name)); }
        }
      }
      ready = next;
      return problems;
    },

    /** Answer of host.pgz.resource: [w, h] for images, seconds for sounds, true for music and fonts, null if missing. */
    resource(kind, name) {
      const e = ready[kind]?.get(name);
      if (!e) return null;
      if (kind === 'images') return [e.w, e.h];
      if (kind === 'sounds') return e.seconds;
      return true;
    },
    image(name) { return ready.images.get(name) ?? null; },
    buffer(kind, name) { return ready[kind]?.get(name)?.buffer ?? null; },
    names(kind) { return [...(ready[kind]?.keys() ?? [])]; },

    /** Friendly text for a resource that is missing: where it was looked for, and what may be meant. */
    describeMissing(kind, name) {
      const dir = kind;
      const where = [T.project(dir, name, EXT[kind] ?? ['?'])];
      const packNames = [...new Set(sources.flatMap((s) => s.packs))];
      if (packNames.length && kind !== 'fonts') where.push(T.packs(packNames.join(', ')));
      if (page[kind]?.size) where.push(T.page);
      let text = T.missing(T[WHAT[kind]] ?? kind, name, where.join(', '));
      const u = unloaded.get(name);
      if (u && u.kind === kind) text += ' ' + T.notLoaded(u);
      else {
        const s = similar(name, [...(ready[kind]?.keys() ?? []), ...[...unloaded.values()].filter((a) => a.kind === kind).map((a) => a.name)]);
        if (s) text += ' ' + T.similar(s);
      }
      return text;
    },
  };
  return assets;
}
