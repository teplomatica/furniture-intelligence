from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.company import Company, SegmentGroup, Positioning
from app.services.refresh import refresh_company_stream

router = APIRouter(prefix="/companies", tags=["companies"])


class CompanyOut(BaseModel):
    id: int
    name: str
    slug: str
    website: Optional[str]
    segment_group: SegmentGroup
    positioning: Optional[Positioning]
    notes: Optional[str]
    is_active: bool

    model_config = {"from_attributes": True}


class CompanyCreate(BaseModel):
    name: str
    slug: str
    website: Optional[str] = None
    segment_group: SegmentGroup
    positioning: Optional[Positioning] = None
    notes: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    website: Optional[str] = None
    segment_group: Optional[SegmentGroup] = None
    positioning: Optional[Positioning] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("", response_model=list[CompanyOut])
async def list_companies(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    active_only: bool = True,
):
    q = select(Company).order_by(Company.segment_group, Company.name)
    if active_only:
        q = q.where(Company.is_active == True)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/by-slug/{slug}", response_model=CompanyOut)
async def get_company_by_slug(slug: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Company).where(Company.slug == slug))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(company_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.post("", response_model=CompanyOut, status_code=201)
async def create_company(body: CompanyCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    existing = await db.execute(select(Company).where(Company.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Slug already exists")
    company = Company(**body.model_dump())
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


@router.patch("/{company_id}", response_model=CompanyOut)
async def update_company(
    company_id: int, body: CompanyUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)
):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(company, field, value)
    await db.commit()
    await db.refresh(company)
    return company


@router.delete("/{company_id}", status_code=204)
async def delete_company(company_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company.is_active = False
    await db.commit()


class RefreshRequest(BaseModel):
    sections: list[str]  # ["legal_entities", "financials", "offers"]
    region_id: int | None = None  # for offer scraping


@router.post("/{company_id}/refresh")
async def refresh_company(
    company_id: int,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return StreamingResponse(
        refresh_company_stream(company_id, body.sections, db, region_id=body.region_id),
        media_type="text/event-stream",
    )
