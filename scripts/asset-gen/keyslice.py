"""Key a magenta background to alpha and cut a sheet into aligned frames.
python3 keyslice.py sheet.png outdir prefix [height=128] [expected_frames]"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

def key(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    d = np.sqrt((a[..., 0] - 255) ** 2 + a[..., 1] ** 2 + (a[..., 2] - 255) ** 2)
    alpha = np.clip((d - 70) / 80, 0, 1)
    # despill: take the magenta share out of semi-transparent edge pixels
    rgb = a.copy()
    edge = (alpha > 0) & (alpha < 1)
    key = np.array([255, 0, 255], np.float32)
    safe = np.where(alpha[..., None] > 0.05, alpha[..., None], 1)
    rgb[edge] = np.clip((a[edge] - (1 - safe[edge]) * key) / safe[edge], 0, 255)
    return np.dstack([rgb, alpha * 255]).astype(np.uint8)

def frames(rgba, expected=None):
    alpha = rgba[..., 3] > 128
    grown = ndimage.binary_dilation(alpha, iterations=6)
    lab, n = ndimage.label(grown)
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        area = (lab[sl] == i).sum()
        if area > 2500: boxes.append((sl, i))
    # reading order: rows by y centre, then x
    cy = [(s[0].start + s[0].stop) / 2 for s, _ in boxes]
    h = np.median([s[0].stop - s[0].start for s, _ in boxes])
    order = sorted(range(len(boxes)), key=lambda k: (round(cy[k] / (h * 0.8)), boxes[k][0][1].start))
    out = []
    for k in order:
        sl, i = boxes[k]
        crop = rgba[sl].copy()
        mask = ndimage.binary_dilation(lab[sl] == i, iterations=2)
        crop[..., 3] = np.where(mask, crop[..., 3], 0)
        out.append(Image.fromarray(crop, 'RGBA'))
    return out

def align(imgs, height):
    scale = height / max(i.height for i in imgs)
    w = int(max(i.width for i in imgs) * scale) + 8
    res = []
    for im in imgs:
        im2 = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        a = np.asarray(im2)[..., 3].astype(np.float32)
        cx = (a.sum(0) * np.arange(a.shape[1])).sum() / max(a.sum(), 1)
        canvas = Image.new('RGBA', (w, height + 4), (0, 0, 0, 0))
        canvas.paste(im2, (int(round(w / 2 - cx)), height + 4 - im2.height - 2), im2)
        res.append(canvas)
    return res

if __name__ == '__main__':
    src, outdir, prefix = sys.argv[1:4]
    height = int(sys.argv[4]) if len(sys.argv) > 4 else 128
    os.makedirs(outdir, exist_ok=True)
    rgba = key(Image.open(src))
    fr = align(frames(rgba), height)
    for n, im in enumerate(fr, 1):
        im.save(os.path.join(outdir, f'{prefix}_{n}.png'))
    print(len(fr), 'frames', fr[0].size)


def cut_items(src, names, long_side=96, outdir='.', pad=2, min_area=1500):
    """Cut a sheet of different objects into named, tightly cropped PNGs (reading order = order of `names`).
    Objects are scaled by ONE factor per call so that the largest one has `long_side` pixels on its long side
    (use long_side per object kind: call once per sheet). Returns the list of files; raises if the count is wrong."""
    rgba = key(Image.open(src))
    alpha = rgba[..., 3] > 128
    grown = ndimage.binary_dilation(alpha, iterations=8)
    lab, n = ndimage.label(grown)
    comps = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if (lab[sl] == i).sum() >= min_area:
            comps.append((sl, i))
    if len(comps) != len(names):
        raise ValueError(f'{src}: found {len(comps)} objects, expected {len(names)}')
    cy = [(s[0].start + s[0].stop) / 2 for s, _ in comps]
    h = np.median([s[0].stop - s[0].start for s, _ in comps])
    order = sorted(range(len(comps)), key=lambda k: (round(cy[k] / (h * 0.9)), comps[k][0][1].start))
    crops = []
    for k in order:
        sl, i = comps[k]
        crop = rgba[sl].copy()
        crop[..., 3] = np.where(ndimage.binary_dilation(lab[sl] == i, iterations=2), crop[..., 3], 0)
        crops.append(Image.fromarray(crop, 'RGBA'))
    scale = long_side / max(max(c.width, c.height) for c in crops)
    os.makedirs(outdir, exist_ok=True)
    files = []
    for name, im in zip(names, crops):
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        canvas = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        canvas.paste(im, (pad, pad), im)
        path = os.path.join(outdir, name + '.png')
        canvas.save(path, optimize=True)
        files.append(path)
    return files
