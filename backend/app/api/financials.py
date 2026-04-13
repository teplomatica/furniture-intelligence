from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.legal_entity import LegalEntity
from app.models.competitor_data import CompetitorFinancial, DataSource

router = APIRouter(prefix="/financials", tags=["financials"])


class FinancialOut(BaseModel):
    id: int
    legal_entity_id: int
    year: int
    revenue: Optional[float]
    net_profit: Optional[float]
    ebitda: Optional[float]
    total_assets: Optional[float]
    employee_count: Optional[int]
    source: DataSource

    model_config = {"from_attributes": True}


class FinancialCreate(BaseModel):
    legal_entity_id: int
    year: int
    revenue: Optional[float] = None
    net_profit: Optional[float] = None
    ebitda: Optional[float] = None
    total_assets: Optional[float] = None
    employee_count: Optional[int] = None
    source: DataSource = DataSource.manual


class FinancialUpdate(BaseModel):
    revenue: Optional[float] = None
    net_profit: Optional[float] = None
    ebitda: Optional[float] = None
    total_assets: Optional[float] = None
    employee_count: Optional[int] = None


@router.get("", response_model=list[FinancialOut])
async def list_financials(
    legal_entity_id: Optional[int] = None,
    company_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(CompetitorFinancial).order_by(
        CompetitorFinancial.legal_entity_id, CompetitorFinancial.year.desc()
    )
    if legal_entity_id:
        q = q.where(CompetitorFinancial.legal_entity_id == legal_entity_id)
    if company_id:
        q = q.join(LegalEntity).where(LegalEntity.company_id == company_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=FinancialOut, status_code=201)
async def create_financial(
    body: FinancialCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    le = await db.get(LegalEntity, body.legal_entity_id)
    if not le:
        raise HTTPException(status_code=404, detail="Legal entity not found")
    existing = await db.execute(
        select(CompetitorFinancial).where(
            CompetitorFinancial.legal_entity_id == body.legal_entity_id,
            CompetitorFinancial.year == body.year,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Data for year {body.year} already exists")
    fin = CompetitorFinancial(**body.model_dump())
    db.add(fin)
    await db.commit()
    await db.refresh(fin)
    return fin


@router.patch("/{fin_id}", response_model=FinancialOut)
async def update_financial(
    fin_id: int,
    body: FinancialUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    fin = await db.get(CompetitorFinancial, fin_id)
    if not fin:
        raise HTTPException(status_code=404, detail="Financial record not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(fin, field, value)
    await db.commit()
    await db.refresh(fin)
    return fin


@router.delete("/{fin_id}", status_code=204)
async def delete_financial(
    fin_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    fin = await db.get(CompetitorFinancial, fin_id)
    if not fin:
        raise HTTPException(status_code=404, detail="Financial record not found")
    await db.delete(fin)
    await db.commit()
