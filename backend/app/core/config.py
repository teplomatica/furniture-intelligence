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

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_db_url(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        if v.startswith("postgresql://"):
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        # asyncpg не понимает sslmode — заменяем на ssl=require
        v = v.replace("?sslmode=require", "?ssl=require")
        v = v.replace("&sslmode=require", "&ssl=require")
        return v


settings = Settings()
