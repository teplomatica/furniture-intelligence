from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.company import Company
from app.models.region import Region
from app.models.offer import (
    CompanyRegionConfig, RegionMethod, StockFilterMethod,
)

router = APIRouter(prefix="/company-region-configs", tags=["company_region_config"])


class ConfigOut(BaseModel):
    id: int
    company_id: int
    region_id: int
    has_region_selector: bool
    has_stock_filter: bool
    stock_filter_method: StockFilterMethod
    region_method: RegionMethod
    region_key: Optional[str]
    region_value: Optional[str]
    catalog_urls: Optional[list]
    is_active: bool

    model_config = {"from_attributes": True}


class ConfigCreate(BaseModel):
    company_id: int
    region_id: int
    has_region_selector: bool = True
    has_stock_filter: bool = True
    stock_filter_method: StockFilterMethod = StockFilterMethod.visible
    region_method: RegionMethod = RegionMethod.cookie
    region_key: Optional[str] = None
    region_value: Optional[str] = None
    catalog_urls: Optional[list[str]] = None
    is_active: bool = True


class ConfigUpdate(BaseModel):
    has_region_selector: Optional[bool] = None
    has_stock_filter: Optional[bool] = None
    stock_filter_method: Optional[StockFilterMethod] = None
    region_method: Optional[RegionMethod] = None
    region_key: Optional[str] = None
    region_value: Optional[str] = None
    catalog_urls: Optional[list[str]] = None
    is_active: Optional[bool] = None


@router.get("", response_model=list[ConfigOut])
async def list_configs(
    company_id: Optional[int] = None,
    region_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(CompanyRegionConfig).order_by(CompanyRegionConfig.company_id, CompanyRegionConfig.region_id)
    if company_id:
        q = q.where(CompanyRegionConfig.company_id == company_id)
    if region_id:
        q = q.where(CompanyRegionConfig.region_id == region_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=ConfigOut, status_code=201)
async def create_config(
    body: ConfigCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    if not await db.get(Company, body.company_id):
        raise HTTPException(status_code=404, detail="Company not found")
    if not await db.get(Region, body.region_id):
        raise HTTPException(status_code=404, detail="Region not found")

    existing = await db.execute(
        select(CompanyRegionConfig).where(
            CompanyRegionConfig.company_id == body.company_id,
            CompanyRegionConfig.region_id == body.region_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Config for this company+region already exists")

    config = CompanyRegionConfig(**body.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.patch("/{config_id}", response_model=ConfigOut)
async def update_config(
    config_id: int,
    body: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    config = await db.get(CompanyRegionConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/{config_id}", status_code=204)
async def delete_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    config = await db.get(CompanyRegionConfig, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    await db.delete(config)
    await db.commit()


@router.post("/init/{company_id}", response_model=list[ConfigOut])
async def init_configs_for_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Create default configs for all active regions for a company."""
    if not await db.get(Company, company_id):
        raise HTTPException(status_code=404, detail="Company not found")

    regions = await db.execute(select(Region).where(Region.is_active == True))
    created = []
    for region in regions.scalars().all():
        existing = await db.execute(
            select(CompanyRegionConfig).where(
                CompanyRegionConfig.company_id == company_id,
                CompanyRegionConfig.region_id == region.id,
            )
        )
        if existing.scalar_one_or_none():
            continue
        config = CompanyRegionConfig(company_id=company_id, region_id=region.id)
        db.add(config)
        await db.flush()
        await db.refresh(config)
        created.append(config)

    await db.commit()
    return created
