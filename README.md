# Image Convert & Rename

Personal image converter and sequential file renamer.

## Features

1. Upload images (PNG, JPG, WEBP, BMP, GIF, TIFF)
2. Convert to JPG / PNG / WEBP / BMP
3. Optionally rename with a sequence pattern (`001`, `abc_001`, …)
4. Download results as a ZIP

## Setup

```bash
cd python
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

## Run

From the project root (`python/`):

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000)

## Rename patterns

| Pattern   | Result              |
|-----------|---------------------|
| `001`     | `001.jpg`, `002.jpg` |
| `abc_001` | `abc_001.jpg`, `abc_002.jpg` |
| `photo_01`| `photo_01.webp`, `photo_02.webp` |
