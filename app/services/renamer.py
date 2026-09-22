from __future__ import annotations

import re
from pathlib import Path


PATTERN_RE = re.compile(r"^(.*?)(\d+)$")


def parse_pattern(pattern: str) -> tuple[str, int, int]:
    """Parse a rename pattern like '001' or 'abc_001'.

    Returns (prefix, start_number, pad_width).
    """
    pattern = pattern.strip()
    if not pattern:
        raise ValueError("Pattern cannot be empty")

    match = PATTERN_RE.match(pattern)
    if not match:
        raise ValueError(
            "Pattern must end with digits, e.g. '001' or 'abc_001'"
        )

    prefix, number_str = match.groups()
    return prefix, int(number_str), len(number_str)


def preview_names(pattern: str, count: int, extension: str) -> list[str]:
    prefix, start, width = parse_pattern(pattern)
    ext = extension if extension.startswith(".") else f".{extension}"
    return [f"{prefix}{str(start + i).zfill(width)}{ext}" for i in range(count)]


def rename_files(files: list[Path], pattern: str, dest_dir: Path) -> list[Path]:
    """Rename files into dest_dir using a sequential pattern.

    Reads all source bytes first so overlapping names cannot destroy inputs.
    """
    if not files:
        return []

    prefix, start, width = parse_pattern(pattern)
    dest_dir.mkdir(parents=True, exist_ok=True)

    payloads: list[tuple[bytes, str]] = []
    for i, src in enumerate(files):
        new_name = f"{prefix}{str(start + i).zfill(width)}{src.suffix.lower()}"
        payloads.append((src.read_bytes(), new_name))

    # Clear destination folder of previous outputs
    for old in dest_dir.iterdir():
        if old.is_file():
            old.unlink()

    renamed: list[Path] = []
    for data, new_name in payloads:
        dest = dest_dir / new_name
        dest.write_bytes(data)
        renamed.append(dest)

    # Remove sources that lived outside dest_dir (or leftover originals in dest)
    for src in files:
        if src.exists() and src.resolve().parent == dest_dir.resolve():
            # Only delete if it was not one of the new output names
            if src.name not in {p.name for p in renamed}:
                src.unlink(missing_ok=True)
        elif src.exists() and src.resolve().parent != dest_dir.resolve():
            # leave originals in convert folder alone when called with copies
            pass

    return renamed
