// Pure logic of the guizero renderer and the plot viewer (no DOM): pack rules, grid placement, colours, key names,
// image sizes, the event queue, plot file names.
import { describe, it, expect } from 'vitest';
import { packParams, gridPlacement, isDefaultBg, contrastInk, tkKey, imageSize, svgSize, projectImage, EventQueue } from '../src/formsLogic.js';
import { plotFileName } from '../src/plot.js';

describe('forms layout rules', () => {
  it('packs like guizero: side, fill and expand', () => {
    expect(packParams({ align: null }, {})).toEqual({ side: 'top', fillX: false, fillY: false, expand: false, horizontal: false });
    expect(packParams({ align: 'left' }, { width: 'fill' })).toMatchObject({ side: 'left', fillX: true, expand: true, horizontal: true });
    expect(packParams({ align: null }, { width: 'fill' })).toMatchObject({ fillX: true, expand: false });
    expect(packParams({ align: null }, { height: 'fill' })).toMatchObject({ fillY: true, expand: true });
    expect(packParams({ align: 'left' }, { height: 'fill' })).toMatchObject({ fillY: true, expand: false });
    expect(packParams({ align: 'bottom' }, { width: 'fill', height: 'fill' })).toMatchObject({ side: 'bottom', expand: true });
  });
  it('places grid children with spans and sticky sides', () => {
    expect(gridPlacement({ grid: [1, 2, 2, 1], align: null })).toEqual({ gridColumn: '2 / span 2', gridRow: '3 / span 1', justifySelf: 'center', alignSelf: 'center' });
    expect(gridPlacement({ grid: [0, 0], align: 'left' })).toMatchObject({ justifySelf: 'start', alignSelf: 'center' });
    expect(gridPlacement({ grid: [0, 0], align: 'bottom' })).toMatchObject({ justifySelf: 'center', alignSelf: 'end' });
  });
  it('treats Tk default colours as theme colours and picks a readable ink', () => {
    expect(isDefaultBg('app', '#d9d9d9')).toBe(true);
    expect(isDefaultBg('textbox', '#ffffff')).toBe(true);
    expect(isDefaultBg('text', '#ffffff')).toBe(false);
    expect(contrastInk('#ffff00')).toBe('#000000');
    expect(contrastInk('#1e293b')).toBe('#ffffff');
  });
  it('maps browser keys to Tk keysym and char', () => {
    expect(tkKey('a')).toEqual({ keysym: 'a', char: 'a' });
    expect(tkKey('Enter')).toEqual({ keysym: 'Return', char: '\r' });
    expect(tkKey('ArrowUp')).toEqual({ keysym: 'Up', char: '' });
    expect(tkKey(' ')).toEqual({ keysym: 'space', char: ' ' });
    expect(tkKey('Shift')).toEqual({ keysym: 'Shift_L', char: '' });
    expect(tkKey('.')).toEqual({ keysym: 'period', char: '.' });
  });
});

describe('forms images', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 40, 0, 0, 0, 30, 8, 6, 0, 0, 0]);
  it('reads the size of PNG and GIF headers and SVG text', () => {
    expect(imageSize(png)).toEqual({ width: 40, height: 30 });
    expect(imageSize(new Uint8Array([71, 73, 70, 56, 57, 97, 5, 0, 7, 0, 0, 0]))).toEqual({ width: 5, height: 7 });
    expect(svgSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32">')).toEqual({ width: 64, height: 32 });
    expect(svgSize('<svg width="10px" height="20">')).toEqual({ width: 10, height: 20 });
  });
  it('turns project files (data: URL or SVG text) into pictures', () => {
    const url = 'data:image/png;base64,' + Buffer.from(png).toString('base64');
    expect(projectImage(url)).toEqual({ url, width: 40, height: 30 });
    expect(projectImage('<svg width="8" height="9"></svg>')).toMatchObject({ width: 8, height: 9 });
    expect(projectImage('just text')).toBeNull();
  });
});

describe('forms event queue', () => {
  it('keeps order and coalesces motion of the same widget', () => {
    const q = new EventQueue();
    q.push(['command', 2]);
    q.push(['mouse', 3, 'motion', 1, 1, 0, 0]);
    q.push(['mouse', 3, 'motion', 5, 6, 0, 0]);
    q.push(['mouse', 3, 'press1', 5, 6, 0, 0]);
    expect(q.items.map((e) => e.slice(0, 4))).toEqual([['command', 2], ['mouse', 3, 'motion', 5], ['mouse', 3, 'press1', 5]]);
    expect(q.shift()).toEqual(['command', 2]);
    q.clear();
    expect(q.length).toBe(0);
  });
});

describe('plot file names', () => {
  it('keeps the base name and swaps the extension', () => {
    expect(plotFileName('bilder/kurve.png', 'svg')).toBe('kurve.svg');
    expect(plotFileName('Abbildung 1', 'png')).toBe('Abbildung 1.png');
    expect(plotFileName('', 'svg')).toBe('figure.svg');
  });
});
