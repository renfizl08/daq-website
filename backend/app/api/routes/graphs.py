import json
import os
import threading
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.config import settings
from app.core.auth import require_upload_password
from app.core.errors import payload_too_large
from app.services.dataset_registry import registry

router = APIRouter(prefix="/api/datasets", tags=["graphs"])
_lock = threading.Lock()


class SharedGraphs(BaseModel):
    graphs: list[dict[str, Any]] = Field(max_length=settings.max_shared_graphs)


def _path(slug: str):
    registry.get(slug)  # 404s for unknown slugs, so the filename is always safe
    return settings.graphs_dir / f"{slug}.json"


@router.get("/{slug}/graphs")
def get_shared_graphs(slug: str) -> dict:
    path = _path(slug)
    if not path.exists():
        return {"graphs": None, "updated_at": None}
    return json.loads(path.read_text(encoding="utf-8"))


@router.put("/{slug}/graphs")
def put_shared_graphs(
    slug: str, payload: SharedGraphs, _: None = Depends(require_upload_password)
) -> dict:
    path = _path(slug)
    body = {
        "graphs": payload.graphs,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    text = json.dumps(body)
    if len(text.encode()) > settings.max_shared_graphs_bytes:
        raise payload_too_large("Saved graphs exceed the size limit")
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)
    return body
