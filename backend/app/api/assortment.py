from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.company import Company
from app.models.category import Category
from app.models.competitor_data import CompetitorAssortment, DataSource

router = APIRouter(prefix="/assortment", tags=["assortment"])


class AssortmentOut(BaseModel):
    id: int
    company_id: int
    category_id: int
    price_segment_id: Optional[int]
    sku_count: Optional[int]
    availability_pct: Optional[float]
    price_min: Optional[int]
    price_max: Optional[int]
    price_median: Optional[int]
    source: DataSource

    model_config = {"from_attributes": True}


class AssortmentCreate(BaseModel):
    company_id: int
    category_id: int
    price_segment_id: Optional[int] = None
    sku_count: Optional[int] = None
    availability_pct: Optional[float] = None
    price_min: Optional[int] = None
    price_max: Optional[int] = None
    price_median: Optional[int] = None
    source: DataSource = DataSource.manual


class AssortmentUpdate(BaseModel):
    price_segment_id: Optional[int] = None
    sku_count: Optional[int] = None
    availability_pct: Optional[float] = None
    price_min: Optional[int] = None
    price_max: Optional[int] = None
    price_median: Optional[int] = None


@router.get("", response_model=list[AssortmentOut])
async def list_assortment(
    company_id: Optional[int] = None,
    category_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(CompetitorAssortment).order_by(
        CompetitorAssortment.company_id, CompetitorAssortment.category_id
    )
    if company_id:
        q = q.where(CompetitorAssortment.company_id == company_id)
    if category_id:
        q = q.where(CompetitorAssortment.category_id == category_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=AssortmentOut, status_code=201)
async def create_assortment(
    body: AssortmentCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    company = await db.get(Company, body.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    category = await db.get(Category, body.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    existing = await db.execute(
        select(CompetitorAssortment).where(
            CompetitorAssortment.company_id == body.company_id,
            CompetitorAssortment.category_id == body.category_id,
            CompetitorAssortment.price_segment_id == body.price_segment_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Record for this company/category/segment already exists")
    rec = CompetitorAssortment(**body.model_dump())
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return rec


@router.patch("/{assortment_id}", response_model=AssortmentOut)
async def update_assortment(
    assortment_id: int,
    body: AssortmentUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    rec = await db.get(CompetitorAssortment, assortment_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Assortment record not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rec, field, value)
    await db.commit()
    await db.refresh(rec)
    return rec


@router.delete("/{assortment_id}", status_code=204)
async def delete_assortment(
    assortment_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    rec = await db.get(CompetitorAssortment, assortment_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Assortment record not found")
    await db.delete(rec)
    await db.commit()
