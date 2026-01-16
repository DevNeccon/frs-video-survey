import os
from pathlib import Path

def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def submission_dir(media_root: str, submission_id: int) -> Path:
    base = Path(media_root) / f"submission_{submission_id}"
    ensure_dir(base)
    ensure_dir(base / "images")
    ensure_dir(base / "segments")
    ensure_dir(base / "videos")
    return base

def save_bytes(path: Path, data: bytes) -> str:
    ensure_dir(path.parent)
    path.write_bytes(data)
    return str(path)
