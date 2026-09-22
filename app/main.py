from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.jobs import store
from app.services.converter import convert_image, is_supported_image
from app.services.renamer import parse_pattern, preview_names, rename_files

BASE = Path(__file__).resolve().parent

app = FastAPI(title="Image Convert & Rename", version="1.0.0")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=str(BASE / "templates"))

ALLOWED_FORMATS = {"jpg", "jpeg", "png", "webp", "bmp"}


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


def _normalize_format(target_format: str) -> str:
    target = target_format.lower().strip()
    if target not in ALLOWED_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported target format")
    return "jpg" if target == "jpeg" else target


def _save_upload(upload: UploadFile, upload_dir: Path) -> Path:
    name = upload.filename or "unnamed"
    if not is_supported_image(name):
        raise HTTPException(status_code=400, detail=f"Unsupported file: {name}")

    safe_name = Path(name).name
    dest = upload_dir / safe_name
    if dest.exists():
        stem, suffix = dest.stem, dest.suffix
        n = 1
        while dest.exists():
            dest = upload_dir / f"{stem}_{n}{suffix}"
            n += 1
    return dest


@app.post("/api/convert/start")
async def convert_start(target_format: str = Form(...)):
    fmt = _normalize_format(target_format)
    job = store.create()
    job.target_format = fmt
    job.status = "converting"
    return {"job_id": job.id, "target_format": fmt}


@app.post("/api/convert/one")
async def convert_one(
    job_id: str = Form(...),
    file: UploadFile = File(...),
):
    job = store.get(job_id)
    if not job or job.status not in {"converting", "created"}:
        raise HTTPException(status_code=404, detail="Job not found or not accepting files")
    if not job.target_format:
        raise HTTPException(status_code=400, detail="Job has no target format")

    upload_dir = store.upload_dir(job.id)
    output_dir = store.output_dir(job.id)
    dest = _save_upload(file, upload_dir)

    content = await file.read()
    dest.write_bytes(content)
    job.original_names.append(dest.name)

    try:
        out = convert_image(dest, output_dir, job.target_format)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400, detail=f"Failed to convert {dest.name}: {exc}"
        ) from exc

    job.converted_files.append(out.name)
    job.status = "converting"

    return {
        "job_id": job.id,
        "file": out.name,
        "converted_count": len(job.converted_files),
        "target_format": job.target_format,
    }


@app.post("/api/convert/finish")
async def convert_finish(job_id: str = Form(...)):
    job = store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.converted_files:
        store.cleanup(job.id)
        raise HTTPException(status_code=400, detail="No images were converted")

    job.status = "converted"
    return {
        "job_id": job.id,
        "target_format": job.target_format,
        "files": job.converted_files,
        "count": len(job.converted_files),
    }


@app.post("/api/convert")
async def convert(
    files: List[UploadFile] = File(...),
    target_format: str = Form(...),
):
    """Batch convert (kept for compatibility). Prefer /api/convert/one for progress UI."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    fmt = _normalize_format(target_format)
    start = await convert_start(target_format=fmt)
    job_id = start["job_id"]
    errors: list[str] = []

    for upload in files:
        try:
            await convert_one(job_id=job_id, file=upload)
        except HTTPException as exc:
            errors.append(str(exc.detail))

    try:
        result = await convert_finish(job_id=job_id)
    except HTTPException:
        raise HTTPException(
            status_code=400,
            detail=errors[0] if errors else "No images could be converted",
        ) from None

    result["errors"] = errors
    return result


@app.post("/api/preview-rename")
async def preview_rename(
    job_id: str = Form(...),
    pattern: str = Form(...),
):
    job = store.get(job_id)
    if not job or job.status not in {"converted", "renamed"}:
        raise HTTPException(status_code=404, detail="Job not found or not converted yet")

    try:
        parse_pattern(pattern)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ext = Path(job.converted_files[0]).suffix if job.converted_files else ".jpg"
    names = preview_names(pattern, len(job.converted_files), ext)
    return {"preview": names, "count": len(names)}


@app.post("/api/rename")
async def rename(
    job_id: str = Form(...),
    pattern: str = Form(...),
):
    job = store.get(job_id)
    if not job or job.status != "converted":
        raise HTTPException(status_code=404, detail="Job not found or not ready to rename")

    try:
        parse_pattern(pattern)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    output_dir = store.output_dir(job.id)
    renamed_dir = store.renamed_dir(job.id)

    sources = [output_dir / name for name in job.converted_files]
    if any(not p.exists() for p in sources):
        raise HTTPException(status_code=400, detail="Some converted files are missing")

    result = rename_files(sources, pattern, renamed_dir)
    job.renamed_files = [p.name for p in result]
    job.status = "renamed"

    return {
        "job_id": job.id,
        "files": job.renamed_files,
        "count": len(job.renamed_files),
    }


@app.get("/api/download/{job_id}")
async def download(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status == "renamed":
        folder = store.renamed_dir(job.id)
        names = job.renamed_files
        zip_name = f"renamed_{job.id}.zip"
    elif job.status == "converted":
        folder = store.output_dir(job.id)
        names = job.converted_files
        zip_name = f"converted_{job.id}.zip"
    else:
        raise HTTPException(status_code=400, detail="Nothing to download yet")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in names:
            path = folder / name
            if path.exists():
                zf.write(path, arcname=name)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


@app.delete("/api/job/{job_id}")
async def delete_job(job_id: str):
    if not store.get(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    store.cleanup(job_id)
    return {"ok": True}
