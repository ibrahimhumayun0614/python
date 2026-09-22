# Image Convert & Rename (browser-only)

Convert and rename images **entirely in your browser**. Nothing is uploaded to a server.

## Features

1. Select images (PNG, JPG, WEBP, BMP, GIF)
2. Convert to JPG / PNG / WEBP / BMP (progress + ETA)
3. Optionally rename with a sequence (`001`, `abc_001`, …)
4. Download a ZIP from memory, then clear converted blobs

## Run locally

Double-click `run.bat`, or:

```bash
cd public
# any static server, e.g. Python:
python -m http.server 8080
```

Open http://127.0.0.1:8080

Or open `public/index.html` directly in a browser (some browsers restrict modules/CDN less freely via `file://`; a local server is preferred).

## Deploy to Cloudflare Pages

**Dashboard**

1. Connect this repo
2. Build command: *(leave empty)* or `echo ok`
3. Build output directory: `public`
4. Deploy

**CLI**

```bash
npx wrangler pages deploy public
```

`wrangler.toml` sets `pages_build_output_dir = "public"`.

## Project layout

```
public/
  index.html
  styles.css
  app.js
wrangler.toml
run.bat
```
