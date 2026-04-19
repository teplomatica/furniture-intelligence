"""CRUD for company category/region mappings and scrape matrix."""
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
from app.models.region import Region
from app.models.company_mapping import (
    CompanyCategoryMapping, CompanyRegionMapping, CompanyScrapeMatrix,
)
from app.models.offer import RegionMethod

router = APIRouter(tags=["company_mappings"])


# --- Schemas ---

class CategoryMappingOut(BaseModel):
    id: int
    company_id: int
    category_id: Optional[int]
    retailer_category_id: Optional[int] = None
    retailer_name: Optional[str]
    retailer_url: str
    model_config = {"from_attributes": True}


class CategoryMappingCreate(BaseModel):
    category_id: Optional[int] = None
    retailer_category_id: Optional[int] = None
    retailer_name: Optional[str] = None
    retailer_url: str


class RegionMappingOut(BaseModel):
    id: int
    company_id: int
    region_id: int
    region_method: RegionMethod
    region_key: Optional[str]
    region_value: Optional[str]
    model_config = {"from_attributes": True}


class RegionMappingCreate(BaseModel):
    region_id: int
    region_method: RegionMethod = RegionMethod.none
    region_key: Optional[str] = None
    region_value: Optional[str] = None


class RegionMappingUpdate(BaseModel):
    region_method: Optional[RegionMethod] = None
    region_key: Optional[str] = None
    region_value: Optional[str] = None


class ScrapeMatrixItem(BaseModel):
    category_id: Optional[int] = None
    retailer_category_id: Optional[int] = None
    region_id: int
    enabled: bool
    model_config = {"from_attributes": True}


class ScrapeMatrixOut(BaseModel):
    id: int
    company_id: int
    category_id: Optional[int]
    retailer_category_id: Optional[int] = None
    region_id: int
    enabled: bool
    model_config = {"from_attributes": True}


class MatrixBulkUpdate(BaseModel):
    items: list[ScrapeMatrixItem]


# --- Category Mappings ---

@router.get("/companies/{company_id}/category-mappings", response_model=list[CategoryMappingOut])
async def list_category_mappings(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CompanyCategoryMapping)
        .where(CompanyCategoryMapping.company_id == company_id)
        .order_by(CompanyCategoryMapping.category_id)
    )
    return result.scalars().all()


@router.post("/companies/{company_id}/category-mappings", response_model=CategoryMappingOut, status_code=201)
async def create_category_mapping(
    company_id: int,
    body: CategoryMappingCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    if not await db.get(Company, company_id):
        raise HTTPException(status_code=404, detail="Company not found")
    if not await db.get(Category, body.category_id):
        raise HTTPException(status_code=404, detail="Category not found")

    mapping = CompanyCategoryMapping(company_id=company_id, **body.model_dump())
    db.add(mapping)
    await db.commit()
    await db.refresh(mapping)
    return mapping


class CategoryMappingUpdate(BaseModel):
    category_id: Optional[int] = None
    retailer_category_id: Optional[int] = None
    retailer_name: Optional[str] = None
    retailer_url: Optional[str] = None


@router.patch("/company-category-mappings/{mapping_id}", response_model=CategoryMappingOut)
async def update_category_mapping(
    mapping_id: int,
    body: CategoryMappingUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    mapping = await db.get(CompanyCategoryMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(mapping, field, value)
    await db.commit()
    await db.refresh(mapping)
    return mapping


@router.delete("/company-category-mappings/{mapping_id}", status_code=204)
async def delete_category_mapping(
    mapping_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    mapping = await db.get(CompanyCategoryMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    await db.delete(mapping)
    await db.commit()


# --- Region Mappings ---

@router.get("/companies/{company_id}/region-mappings", response_model=list[RegionMappingOut])
async def list_region_mappings(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CompanyRegionMapping)
        .where(CompanyRegionMapping.company_id == company_id)
        .order_by(CompanyRegionMapping.region_id)
    )
    return result.scalars().all()


@router.post("/companies/{company_id}/region-mappings", response_model=RegionMappingOut, status_code=201)
async def create_region_mapping(
    company_id: int,
    body: RegionMappingCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    if not await db.get(Company, company_id):
        raise HTTPException(status_code=404, detail="Company not found")
    if not await db.get(Region, body.region_id):
        raise HTTPException(status_code=404, detail="Region not found")

    existing = await db.execute(
        select(CompanyRegionMapping).where(
            CompanyRegionMapping.company_id == company_id,
            CompanyRegionMapping.region_id == body.region_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Region mapping already exists")

    mapping = CompanyRegionMapping(company_id=company_id, **body.model_dump())
    db.add(mapping)
    await db.commit()
    await db.refresh(mapping)
    return mapping


@router.patch("/company-region-mappings/{mapping_id}", response_model=RegionMappingOut)
async def update_region_mapping(
    mapping_id: int,
    body: RegionMappingUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    mapping = await db.get(CompanyRegionMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(mapping, field, value)
    await db.commit()
    await db.refresh(mapping)
    return mapping


@router.delete("/company-region-mappings/{mapping_id}", status_code=204)
async def delete_region_mapping(
    mapping_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    mapping = await db.get(CompanyRegionMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    await db.delete(mapping)
    await db.commit()


# --- Scrape Matrix ---

@router.get("/companies/{company_id}/scrape-matrix", response_model=list[ScrapeMatrixOut])
async def get_scrape_matrix(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CompanyScrapeMatrix)
        .where(CompanyScrapeMatrix.company_id == company_id)
        .order_by(CompanyScrapeMatrix.category_id, CompanyScrapeMatrix.region_id)
    )
    return result.scalars().all()


@router.patch("/companies/{company_id}/scrape-matrix", response_model=dict)
async def update_scrape_matrix(
    company_id: int,
    body: MatrixBulkUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Bulk upsert matrix cells."""
    updated = 0
    created = 0
    for item in body.items:
        existing = await db.execute(
            select(CompanyScrapeMatrix).where(
                CompanyScrapeMatrix.company_id == company_id,
                CompanyScrapeMatrix.category_id == item.category_id,
                CompanyScrapeMatrix.region_id == item.region_id,
            )
        )
        cell = existing.scalar_one_or_none()
        if cell:
            cell.enabled = item.enabled
            updated += 1
        else:
            db.add(CompanyScrapeMatrix(
                company_id=company_id,
                category_id=item.category_id,
                region_id=item.region_id,
                enabled=item.enabled,
            ))
            created += 1

    await db.commit()
    return {"updated": updated, "created": created}
