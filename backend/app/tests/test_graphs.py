from fastapi.testclient import TestClient
from starlette.requests import Request

from app.config import Settings, settings
from app.core.auth import _client_id
from app.main import app
from app.services.dataset_registry import registry

client = TestClient(app)
AUTH = {"Authorization": f"Bearer {settings.upload_password}"}


def _slug():
    return registry.register("sample.csv", 1).slug


def test_shared_graphs_round_trip_requires_password():
    slug = _slug()
    url = f"/api/datasets/{slug}/graphs"
    assert client.get(url).json() == {"graphs": None, "updated_at": None}
    graphs = [{"id": 1, "name": "Graph 1", "chartConfig": {"y_columns": ["A"]}}]

    assert client.put(url, json={"graphs": graphs}).status_code == 401
    saved = client.put(url, json={"graphs": graphs}, headers=AUTH)
    assert saved.status_code == 200
    assert client.get(url).json()["graphs"] == graphs


def test_shared_graphs_reject_unknown_dataset_and_oversize(monkeypatch):
    assert client.get("/api/datasets/nope/graphs").status_code == 404
    slug = _slug()
    url = f"/api/datasets/{slug}/graphs"
    monkeypatch.setattr(settings, "max_shared_graphs_bytes", 10)
    response = client.put(url, json={"graphs": [{"name": "x" * 50}]}, headers=AUTH)
    assert response.status_code == 413


def test_production_refuses_default_credentials():
    for overrides in (
        {"upload_password": "changeme", "cors_origins": "https://a.org"},
        {"upload_password": "s3cret-value", "cors_origins": "*"},
    ):
        try:
            Settings.model_validate({"environment": "production", **overrides})
        except ValueError:
            continue
        raise AssertionError(f"{overrides} should be rejected")
    Settings.model_validate(
        {
            "environment": "production",
            "upload_password": "s3cret-value",
            "cors_origins": "https://a.org",
        }
    )


def test_rate_limit_is_per_client_not_global(monkeypatch):
    from app.core import auth

    monkeypatch.setattr(settings, "auth_rate_limit_attempts", 2)
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    auth._attempts.clear()

    def attempt(ip):
        return client.post("/api/upload", headers={"X-Forwarded-For": ip}).json()

    attempt("1.1.1.1")
    attempt("1.1.1.1")
    assert attempt("1.1.1.1")["detail"] == "Too many authentication attempts"
    assert attempt("2.2.2.2")["detail"] != "Too many authentication attempts"
    auth._attempts.clear()


def test_client_id_uses_rightmost_trusted_hop(monkeypatch):
    request = Request(
        {
            "type": "http",
            "headers": [(b"x-forwarded-for", b"6.6.6.6, 2.2.2.2")],
            "client": ("10.0.0.1", 1234),
        }
    )

    assert _client_id(request) == "10.0.0.1"  # not trusted by default
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    assert _client_id(request) == "2.2.2.2"  # spoofed left entry ignored
