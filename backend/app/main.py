from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.core.database import engine, async_session_maker, Base
from app.core.auth import hash_password
from app.core.config import settings
from app.models import User, UserRole, UserStatus
from app.api import (
    auth, companies, legal_entities, categories, financials, traffic,
    assortment, regions, offers, settings, company_region_config,
)


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
app.include_router(settings.router)
app.include_router(company_region_config.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
