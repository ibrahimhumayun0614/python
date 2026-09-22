from __future__ import annotations

import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
OUTPUTS_DIR = DATA_DIR / "outputs"
RENAMED_DIR = DATA_DIR / "renamed"


@dataclass
class Job:
    id: str
    original_names: list[str] = field(default_factory=list)
    converted_files: list[str] = field(default_factory=list)
    renamed_files: list[str] = field(default_factory=list)
    target_format: Optional[str] = None
    status: str = "created"  # created | converting | converted | renamed


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        for d in (UPLOADS_DIR, OUTPUTS_DIR, RENAMED_DIR):
            d.mkdir(parents=True, exist_ok=True)

    def create(self) -> Job:
        job_id = uuid.uuid4().hex[:12]
        job = Job(id=job_id)
        self._jobs[job_id] = job
        (UPLOADS_DIR / job_id).mkdir(parents=True, exist_ok=True)
        (OUTPUTS_DIR / job_id).mkdir(parents=True, exist_ok=True)
        (RENAMED_DIR / job_id).mkdir(parents=True, exist_ok=True)
        return job

    def get(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def upload_dir(self, job_id: str) -> Path:
        return UPLOADS_DIR / job_id

    def output_dir(self, job_id: str) -> Path:
        return OUTPUTS_DIR / job_id

    def renamed_dir(self, job_id: str) -> Path:
        return RENAMED_DIR / job_id

    def cleanup(self, job_id: str) -> None:
        for root in (UPLOADS_DIR, OUTPUTS_DIR, RENAMED_DIR):
            path = root / job_id
            if path.exists():
                shutil.rmtree(path, ignore_errors=True)
        self._jobs.pop(job_id, None)


store = JobStore()
