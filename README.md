# XYZ Trading — Homepage Hero — entire project

This project’s pages, files, and uploads as this browser tab had them at export.
Anything left out is listed below.

## Contents

- `Main.dc.html`
- `canvas.json` — the canvas: its pages, where each artboard sits, its notes and shapes
- `assets/` — files uploaded to the design (images, fonts, media)
- `_runtime/` — what runs the pages in a browser; not part of the design

## Uploaded files

Images, fonts and media uploaded to the design are written once each under
`assets/` — 50 in this export — and the exported files refer to them there. A
reference a script puts together while the page runs (for example
`"/_blob/" + id`) is not rewritten and does not load from this folder.

A page in a subfolder may not show an upload that reaches it through a script, a data
file or an imported component, because those files link to `assets/` from a different folder.

## Viewing

To view a page, start a local web server in this folder (for example `python3 -m http.server`), then open an artboard’s `.dc.html` file through it. Opening the file directly may not work, because some browsers block its scripts.

## Left out of this export

The export never includes hidden files (files whose names start with a dot) or
files the editor keeps for its own use.

## GitHub Pages

GitHub Pages runs Jekyll by default, and Jekyll does not publish folders whose
names start with `_`. The original `_runtime/` folder was therefore missing on the
live site, so the page's template (`{{ … }}`, `<sc-for>`, `<sc-if>`) was never
rendered. The runtime now lives in `runtime/`, and an empty `.nojekyll` file turns
Jekyll off. Keep both when you redeploy.

## Mobile performance changes (November 2026)

Images
- The 21 PNG/JPG images the page uses now have WebP copies of the same name in
  `assets/` (alpha kept, each checked against the original for visible quality),
  and the page points at them. The page's image downloads dropped from 6.9 MB to 3.1 MB.
  The original PNG/JPG files are still in `assets/`, untouched, but nothing loads them.
- Below-the-fold images are `loading="lazy"`. A small observer starts each
  section's images ~1.5 screens before it arrives, because the page scrolls inside its own
  container, which native lazy-loading doesn't watch.
- Hero background and hero visual have `fetchpriority="high"`. The three other hero
  visuals load at low priority, and the hero animation no longer waits for them.
- Height-auto images carry `width`/`height` so the browser reserves their space.
- The map highlight in the "global" section uses a pre-tinted copy
  (`9a41e…-light.webp`) instead of a live CSS colour filter. It looks the same and is
  much cheaper to repaint while its light sweep animates.

Scrolling and animation
- Scroll work runs at most once per frame (requestAnimationFrame), reads layout
  before writing, and skips style writes whose value hasn't changed.
- CSS animations pause in sections that are off screen and resume when they come back.
- The asset carousel stops auto-advancing while it is off screen.
- Hero canvases cover only the visible strip of the stage, at a resolution matched
  to the screen's real pixel density. On phones this is ~85% fewer canvas pixels per frame.
- The hero engine skips transform/opacity writes that haven't changed.
- On touch devices the page's inner scroller uses proximity snapping instead of
  mandatory snapping, `overscroll-behavior: contain`, and `100svh` height (iOS Safari).
- Existing `prefers-reduced-motion` rules are unchanged and still apply.

## Deploying

Replace the files in your repository with the contents of this folder
(keep `.nojekyll` and `runtime/`), commit and push. GitHub Pages serves `index.html`
from the repository root. No build step is needed.
