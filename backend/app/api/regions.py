from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.region import Region

router = APIRouter(prefix="/regions", tags=["regions"])


class RegionOut(BaseModel):
    id: int
    name: str
    slug: str
    sort_order: int
    is_active: bool
    city_firecrawl: Optional[str]

    model_config = {"from_attributes": True}


class RegionCreate(BaseModel):
    name: str
    slug: str
    sort_order: int = 0
    city_firecrawl: Optional[str] = None


class RegionUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    city_firecrawl: Optional[str] = None


@router.get("", response_model=list[RegionOut])
async def list_regions(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Region).order_by(Region.sort_order, Region.name)
    if active_only:
        q = q.where(Region.is_active == True)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=RegionOut, status_code=201)
async def create_region(
    body: RegionCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    existing = await db.execute(select(Region).where(Region.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Slug already exists")
    region = Region(**body.model_dump())
    db.add(region)
    await db.commit()
    await db.refresh(region)
    return region


@router.patch("/{region_id}", response_model=RegionOut)
async def update_region(
    region_id: int,
    body: RegionUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    region = await db.get(Region, region_id)
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(region, field, value)
    await db.commit()
    await db.refresh(region)
    return region


@router.delete("/{region_id}", status_code=204)
async def delete_region(
    region_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    region = await db.get(Region, region_id)
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    region.is_active = False
    await db.commit()
