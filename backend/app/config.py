from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_STORAGE = Path(__file__).resolve().parents[1] / "storage"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    upload_password: str = "changeme"
    data_dir: Path = Path(__file__).resolve().parents[2] / "data"
    # Runtime state is untracked; the old tracked file only seeds a fresh state dir.
    registry_path: Path = _STORAGE / "state" / "datasets.json"
    legacy_registry_path: Path = _STORAGE / "datasets.json"
    cors_origins: str = "*"
    max_upload_bytes: int = 1024 * 1024 * 1024
    upload_chunk_bytes: int = 1024 * 1024
    max_preview_rows: int = 200
    max_chart_rows: int = 20000
    auth_rate_limit_window_seconds: int = 60
    auth_rate_limit_attempts: int = 8
    # Number of reverse proxies in front of the API that append to X-Forwarded-For.
    trusted_proxy_hops: int = 0

    @model_validator(mode="after")
    def require_safe_production_settings(self) -> "Settings":
        if self.environment.lower() != "production":
            return self
        problems = []
        if self.upload_password in ("", "changeme", "replace_me"):
            problems.append("UPLOAD_PASSWORD must be set to a non-default value")
        if self.cors_origins.strip() in ("", "*"):
            problems.append("CORS_ORIGINS must list the allowed origins, not '*'")
        if problems:
            raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self


settings = Settings()
