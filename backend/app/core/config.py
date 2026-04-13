from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    jwt_secret: str
    frontend_url: str = "http://localhost:3000"
    superadmin_email: str
    superadmin_password: str

    datanewton_api_key: Optional[str] = None
    datanewton_base_url: str = "https://api.datanewton.ru/v1"
    firecrawl_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_db_url(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        # asyncpg понимает только ssl — убираем все лишние параметры
        parsed = urlparse(v)
        params = parse_qs(parsed.query)
        clean = {}
        if "sslmode" in params:
            clean["ssl"] = params["sslmode"][0]
        elif "ssl" in params:
            clean["ssl"] = params["ssl"][0]
        new_query = urlencode(clean) if clean else ""
        v = urlunparse(parsed._replace(query=new_query))
        return v


settings = Settings()
