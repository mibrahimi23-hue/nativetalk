from __future__ import annotations

from pathlib import Path
from typing import Iterable
from uuid import uuid4

from fastapi import HTTPException, UploadFile


CHUNK_SIZE = 1024 * 1024


def upload_root(*parts: str) -> Path:
    root = Path("uploads", *parts).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def safe_upload_path(raw_path: str, root: Path) -> Path:
    path = Path(raw_path).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="File not found.") from exc
    return path


def safe_upload_name(filename: str | None, allowed_extensions: Iterable[str]) -> str:
    original = Path(filename or "upload").name
    suffix = Path(original).suffix.lower()
    allowed = {ext.lower() for ext in allowed_extensions}
    if suffix not in allowed:
        raise HTTPException(status_code=400, detail="File extension is not allowed.")
    return f"{uuid4().hex}{suffix}"


async def save_upload_file(
    file: UploadFile,
    destination_dir: Path,
    *,
    allowed_content_types: set[str],
    allowed_extensions: set[str],
    max_size_bytes: int,
) -> str:
    if file.content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail="File type is not allowed.")

    filename = safe_upload_name(file.filename, allowed_extensions)
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = (destination_dir / filename).resolve()
    destination.relative_to(destination_dir.resolve())

    written = 0
    try:
        with destination.open("wb") as handle:
            while chunk := await file.read(CHUNK_SIZE):
                written += len(chunk)
                if written > max_size_bytes:
                    raise HTTPException(status_code=413, detail="Uploaded file is too large.")
                handle.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    return destination.relative_to(Path.cwd()).as_posix()
