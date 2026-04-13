from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.company import Company
from app.models.competitor_data import CompetitorTraffic, DataSource

router = APIRouter(prefix="/traffic", tags=["traffic"])


class TrafficOut(BaseModel):
    id: int
    company_id: int
    period: str
    monthly_visits: Optional[int]
    bounce_rate: Optional[float]
    avg_visit_duration_sec: Optional[int]
    pages_per_visit: Optional[float]
    source: DataSource

    model_config = {"from_attributes": True}


class TrafficCreate(BaseModel):
    company_id: int
    period: str  # "2025-01"
    monthly_visits: Optional[int] = None
    bounce_rate: Optional[float] = None
    avg_visit_duration_sec: Optional[int] = None
    pages_per_visit: Optional[float] = None
    source: DataSource = DataSource.manual


class TrafficUpdate(BaseModel):
    monthly_visits: Optional[int] = None
    bounce_rate: Optional[float] = None
    avg_visit_duration_sec: Optional[int] = None
    pages_per_visit: Optional[float] = None


@router.get("", response_model=list[TrafficOut])
async def list_traffic(
    company_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(CompetitorTraffic).order_by(
        CompetitorTraffic.company_id, CompetitorTraffic.period.desc()
    )
    if company_id:
        q = q.where(CompetitorTraffic.company_id == company_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=TrafficOut, status_code=201)
async def create_traffic(
    body: TrafficCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    company = await db.get(Company, body.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    existing = await db.execute(
        select(CompetitorTraffic).where(
            CompetitorTraffic.company_id == body.company_id,
            CompetitorTraffic.period == body.period,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Data for period {body.period} already exists")
    rec = CompetitorTraffic(**body.model_dump())
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return rec


@router.patch("/{traffic_id}", response_model=TrafficOut)
async def update_traffic(
    traffic_id: int,
    body: TrafficUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    rec = await db.get(CompetitorTraffic, traffic_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Traffic record not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rec, field, value)
    await db.commit()
    await db.refresh(rec)
    return rec


@router.delete("/{traffic_id}", status_code=204)
async def delete_traffic(
    traffic_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    rec = await db.get(CompetitorTraffic, traffic_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Traffic record not found")
    await db.delete(rec)
    await db.commit()
