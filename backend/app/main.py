from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.core.database import engine, async_session_maker, Base
from app.core.auth import hash_password
from app.core.config import settings
from app.models import User, UserRole, UserStatus
from app.api import (
    auth, companies, legal_entities, categories, financials, traffic,
    assortment, regions, offers, company_region_config,
)
from app.api import settings as settings_api
from app.api import scrape_test, site_analysis, dashboard


async def create_superadmin():
    async with async_session_maker() as db:
        result = await db.execute(select(User).where(User.role == UserRole.superadmin))
        if result.scalar_one_or_none():
            return
        db.add(User(
            email=settings.superadmin_email,
            password_hash=hash_password(settings.superadmin_password),
            role=UserRole.superadmin,
            status=UserStatus.active,
        ))
        await db.commit()


async def migrate_add_columns():
    """Add missing columns to existing tables (create_all doesn't alter)."""
    migrations = [
        ("fi_companies", "is_self", "BOOLEAN DEFAULT FALSE"),
        ("fi_companies", "scrape_schedule", "VARCHAR(50)"),
        ("fi_companies", "last_scraped_at", "TIMESTAMP"),
    ]
    async with engine.begin() as conn:
        for table, column, col_type in migrations:
            try:
                await conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
                ))
            except Exception:
                pass  # column already exists or other DB


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await migrate_add_columns()
    await create_superadmin()
    yield
    await engine.dispose()


app = FastAPI(title="Furniture Intelligence API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, settings.frontend_url.rstrip("/")],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(companies.router)
app.include_router(legal_entities.router)
app.include_router(categories.router)
app.include_router(financials.router)
app.include_router(traffic.router)
app.include_router(assortment.router)
app.include_router(regions.router)
app.include_router(offers.router)
app.include_router(settings_api.router)
app.include_router(company_region_config.router)
app.include_router(scrape_test.router)
app.include_router(site_analysis.router)
app.include_router(dashboard.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
