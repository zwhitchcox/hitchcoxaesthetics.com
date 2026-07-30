# Before/after images: sourcing and processing

How before/after photos get onto a service page, and the rules that keep them
honest. Written up after the Everesse pages were found showing SkinVive and
skin-revitalization photos (2026-07-28).

## How a page picks its images

Two mechanisms, and the first one wins:

1. **`heroImages` in the page's markdown frontmatter** (`content/**/*.md`).
   Explicit list of `{ before, after, caption }`. This is what you should set.
2. **`SLUG_TO_PREFIX` in `app/utils/service-images.ts`** — a deterministic
   fallback that maps a route slug to a filename prefix and scans
   `public/img/before-after/` at import time.

The trap that caused the Everesse bug: a service can have a *plausible looking*
fallback (`everesse: 'skinvive'`) and every one of its pages will happily render
another treatment's photos with no error anywhere. **If you add a service, add
its images or leave the mapping absent — never alias it to a different
treatment.**

## File convention

```
public/img/before-after/<prefix>-<NNN>-before.webp
public/img/before-after/<prefix>-<NNN>-after.webp
```

- `<prefix>` mirrors the route slug with hyphens: `everesse/face` →
  `everesse-face`.
- `<NNN>` is zero-padded, `001` upward.
- **WebP with an alpha channel.** Subject cut out, background transparent. The
  cards render on white, so a cut-out subject reads clean and a leftover clinic
  wall does not.
- Both halves of a pair do **not** need matching dimensions; the display uses
  `aspect-[3/4]` with `object-cover`.

## Processing pipeline

Run it:

```bash
python3 scripts/process-before-after.py <src-dir> <prefix>
```

`<src-dir>` holds the raw pairs named so they sort before, after, before,
after (`01.jpg`, `02.jpg`, …). Output lands in `public/img/before-after/`.
The script prints which images kept their original background and reminds you
to eyeball every pair before wiring it up.

What it does, and why each step exists — tools are Pillow and `rembg`, both
already installed locally:

1. **Trim letterbox bands.** Source photos frequently arrive padded to a fixed
   canvas. Scan inward from each edge, dropping rows/columns whose per-channel
   standard deviation is under ~6 and whose mean is above ~225 (i.e. uniform
   and near-white). Cartessa's set had 50px side bars and 23px bottom strips.
2. **Remove the background** with `rembg`, `isnet-general-use` first.
3. **Validate the cutout — this step is not optional.** Segmentation fails
   badly and silently on tight skin crops, because a close-up of a neck has no
   "salient object" to find; the model dissolves the subject into a translucent
   ghost.

   The reliable tell is **ghosting**: of the pixels still visible, what share
   are only partly transparent. A real cutout is a few percent, all of it edge
   antialiasing. A dissolved subject runs 40–100%. Measured separation on the
   real sets: Everesse neck crops 99.9%, a ghosted Everesse after 93.7%, versus
   Jeuveau 0.9% and Dysport 2.5%. Reject unless:
   - ghosting <15%, **and**
   - the centre half is >65% opaque, **and**
   - >35% of the frame survives at alpha >128.

   Do **not** raise the centre threshold. A head-and-shoulders portrait has
   background either side of the head, so the middle of the frame is
   legitimately part-transparent; an 85% centre rule rejected perfectly good
   Dysport and Jeuveau cutouts and left burnt-in "DAY 0" labels on the page.

   On rejection, retry with `u2net_human_seg`. If that also fails, **keep the
   original image untouched.** A photo with its background intact beats a
   ghost.

4. **Decide per PAIR, not per image.** If either half fails, keep both
   originals. A pair with one half cut out and the other still carrying its
   studio backdrop looks broken side by side.

5. **Pre-crop when the subject is small in a big frame.** Jeuveau's masters are
   2448x1690 with a small centred figure, which starved the segmenter and left
   the "DAY 0"/"DAY 30" labels behind. Cropping to the bright-pixel bounding
   box first (threshold luminance >150, which ignores the dim grey label) made
   the cutout succeed and the label vanish with the background.
6. **Crop to the subject's alpha bounding box** so framing is tight.
7. **Save WebP**, quality 88.

A useful post-check when a pair looks off: measure the fraction of visible
pixels that are semi-transparent (`12 < alpha < 200`). Healthy cutouts sit
under ~10%; the failures measured 44% and 88%.

## Do not use generative AI on these

Background removal is *segmentation* — it decides which pixels are subject and
which are backdrop, and never repaints anything. That is allowed and is what
this pipeline does.

Generative retouching is **not**. Any model that inpaints, upscales by
hallucinating detail, or "enhances" skin will quietly airbrush the *before*
photo, which destroys the comparison and misrepresents the result. The before
must stay exactly as unflattering as it was.

## Curation: reject more than feels comfortable

A technically clean pair can still be a bad advertisement. Reject when:

- **The camera moved.** If the before is straight-on and the after is
  three-quarter, some of the "improvement" is just the angle. One Everesse
  thigh pair failed on this.
- **The after looks worse in the quality you're selling.** Two abdomen pairs
  were slimmer in the after but showed *more* visible striae and looser skin
  texture — backwards for a skin-*tightening* treatment.
- **White balance jumps.** A warm before and a cold grey after reads as a worse
  result even when the anatomy improved.
- **The pair can't be made consistent.** One partner cut out cleanly, the other
  kept a navy backdrop; no processing reconciles that.

Of 15 Everesse pairs pulled, 5 were rejected. That ratio is normal.

## Verify before/after order from evidence, never from position

Do not assume the first image is the before. Look for, in order of trust:

1. **Filenames** containing `before` / `after`.
2. **Explicit labels** in the source markup.
3. **Caption position** — but note this convention can flip between galleries
   on the same page. Cartessa's face slider put the session count on the before
   and "Courtesy of X" on the after; its body slider put "Courtesy of X" on the
   before. Assuming one rule held everywhere would have reversed every body
   pair.

When only positional evidence exists, find a pair in the same gallery whose
filenames are explicit and use it to anchor the order for the rest.

## Attribution and disclosure

Manufacturer clinical photos are **other practices' patients**, not ours. They
are real results for devices and products we actually use, which is why they
are here at all.

Captions previously credited each source practice by name ("courtesy of
Refined Beauty"). Zane had those removed on 2026-07-29 — he did not want
competitors named on our own pages. Captions now carry only the treatment
facts (product, dose, timepoint), plus "actual patient" on the manufacturer
sets.

Be aware of what that trade-off means: with no attribution, a visitor
reasonably reads these as our own patients. Before/after photos in medical
advertising are expected to be of the practice's own patients or else
disclosed, so this is worth revisiting once we have Sarah's own photos — which
should replace the manufacturer sets outright rather than sit beside them.

If a middle ground is ever wanted, a non-naming line such as "Manufacturer
clinical photo" discloses the source without crediting a competitor.

## Current Everesse set

| Prefix | Pairs | Source |
| --- | --- | --- |
| `everesse` | 3 | face, jawline and body sampler for the parent page |
| `everesse-face` | 3 | Cartessa gallery |
| `everesse-jawline` | 3 | Cartessa gallery |
| `everesse-neck` | 2 | Cartessa gallery |
| `everesse-body` | 2 | Cartessa gallery |
| `dysport` | 3 | Galderma, 50 units, 27-33 days |
| `jeuveau` | 3 | Evolus, Day 0 vs Day 30 |
| `filler-nasolabial-folds` | 2 | Restylane Lyft |
| `filler-under-eye-filler` | 3 | Restylane Eyelight |

The two neck images are deliberately **not** background-removed — they are
tight skin crops where segmentation destroyed the subject, so the guard in
step 3 kept the originals.
