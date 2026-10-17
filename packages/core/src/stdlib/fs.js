// _fs: a small in-memory file system for programs (open(), os, import of own files). Files are texts; folders are implied
// by the slashes in the names. The host can fill it before the run (VM option `files`) and read it afterwards (vm.fs.files);
// host.fsChanged(path, text | null) is told about every change, so a page can keep the project in its own storage.

import { PyList } from '../values.js';
import { err, params, needStr } from '../args.js';

/** Clean path: no leading ./ or /, no double slashes, .. resolved (never above the root). */
export function normPath(p) {
  const out = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return out.join('/');
}

export class VFS {
  /** @param {Record<string, string>} [files] */
  constructor(files = {}) {
    /** @type {Map<string, string>} */
    this.files = new Map(Object.entries(files).map(([k, v]) => [normPath(k), v]));
    /** @type {Set<string>} folders that exist without files in them */
    this.dirs = new Set();
  }
  isDir(path) {
    if (path === '') return true;
    if (this.dirs.has(path)) return true;
    const prefix = path + '/';
    for (const k of this.files.keys()) if (k.startsWith(prefix)) return true;
    return false;
  }
  list(path) {
    const prefix = path === '' ? '' : path + '/';
    const names = new Set();
    for (const k of [...this.files.keys(), ...this.dirs]) if (k.startsWith(prefix) && k !== path) names.add(k.slice(prefix.length).split('/')[0]);
    return [...names].sort();
  }
}

const fsOf = (vm) => (vm.fs ??= new VFS(vm.opts?.files));
const changed = (vm, path, text) => vm.host.fsChanged?.(path, text);

export const FS_NATIVES = {
  '_fs.read'(ctx, args, kw) {
    const [p] = params('read', args, kw, ['path']);
    const path = normPath(needStr(p, 'path')), fs = fsOf(ctx.vm);
    if (fs.files.has(path)) return fs.files.get(path);
    throw err(fs.isDir(path) ? 'isDir' : 'fileNotFound', { path: p });
  },
  '_fs.write'(ctx, args, kw) {
    const [p, text] = params('write', args, kw, ['path', 'text']);
    const path = normPath(needStr(p, 'path')), fs = fsOf(ctx.vm);
    if (path === '' || fs.isDir(path)) throw err('isDir', { path: p });
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (parent !== '' && fs.files.has(parent)) throw err('notDir', { path: p });
    if (parent !== '' && !fs.isDir(parent)) throw err('fileNotFound', { path: p });
    fs.files.set(path, needStr(text, 'text'));
    changed(ctx.vm, path, text);
    return null;
  },
  '_fs.exists'(ctx, args, kw) { const [p] = params('exists', args, kw, ['path']); const path = normPath(needStr(p, 'path')), fs = fsOf(ctx.vm); return fs.files.has(path) || fs.isDir(path); },
  '_fs.isfile'(ctx, args, kw) { const [p] = params('isfile', args, kw, ['path']); return fsOf(ctx.vm).files.has(normPath(needStr(p, 'path'))); },
  '_fs.isdir'(ctx, args, kw) { const [p] = params('isdir', args, kw, ['path']); return fsOf(ctx.vm).isDir(normPath(needStr(p, 'path'))); },
  '_fs.listdir'(ctx, args, kw) {
    const [p] = params('listdir', args, kw, ['?path']);
    const path = normPath(p === undefined || p === null ? '' : needStr(p, 'path')), fs = fsOf(ctx.vm);
    if (fs.files.has(path)) throw err('notDir', { path: p });
    if (!fs.isDir(path)) throw err('fileNotFound', { path: p });
    return new PyList(fs.list(path));
  },
  '_fs.remove'(ctx, args, kw) {
    const [p] = params('remove', args, kw, ['path']);
    const path = normPath(needStr(p, 'path')), fs = fsOf(ctx.vm);
    if (!fs.files.has(path)) throw err(fs.isDir(path) ? 'isDir' : 'fileNotFound', { path: p });
    fs.files.delete(path);
    changed(ctx.vm, path, null);
    return null;
  },
  '_fs.mkdir'(ctx, args, kw) {
    const [p, parents] = params('mkdir', args, kw, ['path', '?parents']);
    const path = normPath(needStr(p, 'path')), fs = fsOf(ctx.vm);
    if (fs.files.has(path) || fs.isDir(path)) throw err('fileExists', { path: p });
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (!parents && parent !== '' && !fs.isDir(parent)) throw err('fileNotFound', { path: p });
    fs.dirs.add(path);
    return null;
  },
  '_fs.rmdir'(ctx, args, kw) {
    const [p] = params('rmdir', args, kw, ['path']);
    const path = normPath(needStr(p, 'path')), fs = fsOf(ctx.vm);
    if (!fs.isDir(path)) throw err(fs.files.has(path) ? 'notDir' : 'fileNotFound', { path: p });
    if (fs.list(path).length) throw err('fileExists', { path: p });
    fs.dirs.delete(path);
    return null;
  },
  '_fs.rename'(ctx, args, kw) {
    const [a, b] = params('rename', args, kw, ['src', 'dst']);
    const from = normPath(needStr(a, 'src')), to = normPath(needStr(b, 'dst')), fs = fsOf(ctx.vm);
    if (!fs.files.has(from)) throw err('fileNotFound', { path: a });
    fs.files.set(to, fs.files.get(from));
    fs.files.delete(from);
    changed(ctx.vm, from, null);
    changed(ctx.vm, to, fs.files.get(to));
    return null;
  },
  '_fs.norm'(ctx, args, kw) { const [p] = params('norm', args, kw, ['path']); return normPath(needStr(p, 'path')); },
};
export const FS_NAMES = ['read', 'write', 'exists', 'isfile', 'isdir', 'listdir', 'remove', 'mkdir', 'rmdir', 'rename', 'norm'];
