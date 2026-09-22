from __future__ import annotations

from pathlib import Path

from PIL import Image

SUPPORTED_INPUT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".tif"}
FORMAT_MAP = {
    "jpg": ("JPEG", ".jpg"),
    "jpeg": ("JPEG", ".jpg"),
    "png": ("PNG", ".png"),
    "webp": ("WEBP", ".webp"),
    "bmp": ("BMP", ".bmp"),
}
JPEG_QUALITY = 90


def is_supported_image(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_INPUT


def convert_image(src: Path, dest_dir: Path, target_format: str) -> Path:
    fmt = target_format.lower().strip()
    if fmt not in FORMAT_MAP:
        raise ValueError(f"Unsupported format: {target_format}")

    pil_format, ext = FORMAT_MAP[fmt]
    dest = dest_dir / f"{src.stem}{ext}"

    with Image.open(src) as img:
        if pil_format == "JPEG":
            if img.mode in ("RGBA", "LA", "P"):
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                alpha = img.split()[-1] if img.mode in ("RGBA", "LA") else None
                if alpha is not None:
                    background.paste(img, mask=alpha)
                else:
                    background.paste(img)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")
            img.save(dest, format=pil_format, quality=JPEG_QUALITY, optimize=True)
        else:
            if pil_format == "BMP" and img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")
            img.save(dest, format=pil_format)

    return dest
