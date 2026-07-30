#!/usr/bin/env python3
"""
Turn raw before/after source photos into site-ready WebP assets.

Implements the pipeline documented in docs/before-after-images.md: trim
letterbox padding, cut out the background, validate that the cutout did not
eat the subject, crop to the subject, save WebP with alpha.

    python3 scripts/process-before-after.py <src-dir> <prefix> [--start 1]

<src-dir> holds the raw pairs named so they sort in before,after,before,after
order (01.jpg, 02.jpg, ...). Output lands in public/img/before-after/ as
<prefix>-NNN-before.webp / <prefix>-NNN-after.webp.

Requires: pillow, rembg. Both already installed locally.

IMPORTANT: this only does segmentation. It never repaints or "enhances" a
photo - that would airbrush the before and misrepresent the result. See the
doc for why, and for the curation rules (reject angle changes, white-balance
jumps, and pairs whose after looks worse in the quality being sold).
"""
import sys, os, glob, json
import numpy as np
from PIL import Image

DEST = os.path.join(os.path.dirname(__file__), '..', 'public', 'img', 'before-after')

# A uniform edge row/column is one with near-zero colour variation that is
# also near-white - i.e. letterbox padding, not content.
FLAT_STD = 6
WHITE_MEAN = 225


def trim(im):
    a = np.asarray(im.convert('RGB')).astype(int)
    h, w, _ = a.shape

    def run(it, axis):
        n = 0
        for k in it:
            line = a[k, :, :] if axis == 0 else a[:, k, :]
            if line.std(axis=0).mean() < FLAT_STD and line.mean() > WHITE_MEAN:
                n += 1
            else:
                break
        return n

    t = run(range(h), 0)
    b = run(range(h - 1, -1, -1), 0)
    l = run(range(w), 1)
    r = run(range(w - 1, -1, -1), 1)
    return im.crop((l, t, w - r, h - b))


def survived(out):
    """Reject a cutout that dissolved the subject.

    Tight skin crops (a neck, an abdomen) have no salient object, so the model
    happily returns a translucent ghost of the whole frame.

    The reliable tell is GHOSTING: of the pixels still visible, what share are
    only partly transparent? A real cutout is crisp - a few percent, all of it
    edge antialiasing. A dissolved subject runs 40-90%.

    Centre opacity alone is a bad test. A head-and-shoulders portrait has
    background either side of the head, so the middle of the frame is
    legitimately part transparent; an 85% centre rule rejected perfectly good
    Dysport and Jeuveau cutouts.
    """
    a = np.asarray(out)
    h, w, _ = a.shape
    alpha = a[:, :, 3]
    visible = alpha > 12
    if not visible.any():
        return False
    ghosting = ((alpha > 12) & (alpha < 200)).sum() / visible.sum()
    ch, cw = h // 4, w // 4
    centre = alpha[ch:h - ch, cw:w - cw]
    return (
        ghosting < 0.15
        and (centre > 128).mean() > 0.65
        and (alpha > 128).mean() > 0.35
    )


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, prefix = sys.argv[1], sys.argv[2]
    start = int(sys.argv[sys.argv.index('--start') + 1]) if '--start' in sys.argv else 1

    from rembg import remove, new_session
    sessions = {}

    def sess(name):
        if name not in sessions:
            sessions[name] = new_session(name)
        return sessions[name]

    files = sorted(glob.glob(os.path.join(src, '*')))
    files = [f for f in files if os.path.splitext(f)[1].lower() in
             ('.jpg', '.jpeg', '.png', '.webp')]
    if len(files) % 2:
        print(f"WARNING: {len(files)} files is odd - pairs must be before,after")

    report = []
    for idx in range(0, len(files) - 1, 2):
        num = f"{start + idx // 2:03d}"
        pair = (('before', files[idx]), ('after', files[idx + 1]))

        # Decide for the PAIR, not per image. A pair where one half is cut out
        # and the other still carries its studio backdrop looks broken side by
        # side, so if either half fails segmentation both keep their original.
        cut = {}
        for role, f in pair:
            im = trim(Image.open(f))
            chosen = None
            for model in ('isnet-general-use', 'u2net_human_seg'):
                try:
                    out = remove(im, session=sess(model))
                except Exception:
                    continue
                if survived(out):
                    chosen = out
                    break
            cut[role] = (im, chosen)

        both_cut = all(c is not None for _, c in cut.values())
        how = 'cutout' if both_cut else 'kept-original (pair)'

        for role, f in pair:
            im, out = cut[role]
            chosen = out if both_cut else im.convert('RGBA')
            a = np.asarray(chosen)
            ys, xs = np.where(a[:, :, 3] > 12)
            if len(ys):
                chosen = chosen.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
            dest = os.path.abspath(os.path.join(DEST, f"{prefix}-{num}-{role}.webp"))
            chosen.save(dest, 'WEBP', quality=88, method=4)
            report.append({'src': os.path.basename(f), 'out': os.path.basename(dest),
                           'model': how, 'size': chosen.size})
            print(f"{os.path.basename(f):24} -> {prefix}-{num}-{role}.webp  "
                  f"{how:22} {chosen.size}")

    kept = [r for r in report if r['model'] == 'kept-original']
    if kept:
        print(f"\n{len(kept)} image(s) kept their original background because "
              f"segmentation would have destroyed the subject:")
        for r in kept:
            print(f"  {r['out']}")
    print("\nNow eyeball every pair before wiring it up. Reject any pair where the "
          "camera angle moved, the white balance jumped, or the after looks worse "
          "in the quality you are selling.")
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
