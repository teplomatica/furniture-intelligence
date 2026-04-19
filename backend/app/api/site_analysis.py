"""API for LLM-driven site structure analysis."""
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import require_editor
from app.models.user import User
from app.models.company import Company
from app.models.region import Region
from app.models.category import Category
from app.models.company_mapping import (
    CompanyCategoryMapping, CompanyRegionMapping, CompanyScrapeMatrix,
)
from app.models.offer import RegionMethod
from app.services.site_analyzer import analyze_site_events

router = APIRouter(prefix="/companies", tags=["site_analysis"])


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/{company_id}/analyze")
async def analyze_site(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Analyze competitor website structure via LLM. Returns SSE stream."""
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    async def stream():
        async for event in analyze_site_events(company_id, db):
            yield _sse(event)

    return StreamingResponse(stream(), media_type="text/event-stream")


class CategoryMappingItem(BaseModel):
    site_url: str
    site_name: Optional[str] = None
    our_category_id: Optional[int] = None


class CityMappingItem(BaseModel):
    site_value: str
    our_region_id: int


class ApplyAnalysisRequest(BaseModel):
    categories: list[CategoryMappingItem]
    region_method: str
    region_key: Optional[str] = None
    cities: list[CityMappingItem]


@router.post("/{company_id}/apply-analysis")
async def apply_analysis(
    company_id: int,
    body: ApplyAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Apply analysis results: create category mappings, region mappings, and scrape matrix."""
    import logging
    import traceback
    logger = logging.getLogger(__name__)
    try:
        return await _apply_analysis_inner(company_id, body, db)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"apply_analysis failed for company {company_id}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


async def _apply_analysis_inner(
    company_id: int,
    body: ApplyAnalysisRequest,
    db: AsyncSession,
):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    base_url = f"https://{company.website}" if company.website else ""
    method_map = {
        "cookie": RegionMethod.cookie,
        "url_param": RegionMethod.url_param,
        "header": RegionMethod.header,
        "subdomain": RegionMethod.subdomain,
        "none": RegionMethod.none,
    }
    region_method = method_map.get(body.region_method, RegionMethod.none)

    # 1. Create retailer_categories + mappings
    from app.models.retailer_category import RetailerCategory

    cat_created = 0
    mapped_retailer_cat_ids = set()
    for cat in body.categories:
        url = cat.site_url
        if url.startswith("/"):
            url = f"{base_url}{url}"
        site_name = cat.site_name or url.rstrip("/").split("/")[-1] or "Без названия"

        # Find or create retailer_category (flat — no parent for now)
        existing_rc = await db.execute(
            select(RetailerCategory).where(
                RetailerCategory.company_id == company_id,
                RetailerCategory.parent_id.is_(None),
                RetailerCategory.name == site_name,
            )
        )
        rc = existing_rc.scalar_one_or_none()
        if not rc:
            rc = RetailerCategory(company_id=company_id, name=site_name, url=url)
            db.add(rc)
            await db.flush()
        else:
            rc.url = url
        mapped_retailer_cat_ids.add(rc.id)

        # Create or update mapping (retailer_category → our_category)
        our_cat_id = cat.our_category_id
        # Look for any existing mapping: by retailer_category_id OR by URL (legacy)
        existing_map_result = await db.execute(
            select(CompanyCategoryMapping).where(
                CompanyCategoryMapping.company_id == company_id,
                CompanyCategoryMapping.retailer_url == url,
            )
        )
        existing_map = existing_map_result.scalars().first()
        if existing_map:
            existing_map.retailer_category_id = rc.id
            existing_map.retailer_name = site_name
            if our_cat_id:
                existing_map.category_id = our_cat_id
        else:
            db.add(CompanyCategoryMapping(
                company_id=company_id,
                category_id=our_cat_id,
                retailer_category_id=rc.id,
                retailer_name=site_name,
                retailer_url=url,
            ))
            cat_created += 1

    # 2. Create region mappings
    reg_created = 0
    mapped_region_ids = set()
    for city in body.cities:
        region = await db.get(Region, city.our_region_id)
        if not region:
            continue

        mapped_region_ids.add(city.our_region_id)

        existing = await db.execute(
            select(CompanyRegionMapping).where(
                CompanyRegionMapping.company_id == company_id,
                CompanyRegionMapping.region_id == city.our_region_id,
            )
        )
        mapping = existing.scalar_one_or_none()
        if mapping:
            mapping.region_method = region_method
            mapping.region_key = body.region_key
            mapping.region_value = city.site_value
        else:
            db.add(CompanyRegionMapping(
                company_id=company_id,
                region_id=city.our_region_id,
                region_method=region_method,
                region_key=body.region_key,
                region_value=city.site_value,
            ))
            reg_created += 1

    # 3. Create scrape matrix (retailer_category × region)
    matrix_created = 0
    for rc_id in mapped_retailer_cat_ids:
        for reg_id in mapped_region_ids:
            existing = await db.execute(
                select(CompanyScrapeMatrix).where(
                    CompanyScrapeMatrix.company_id == company_id,
                    CompanyScrapeMatrix.retailer_category_id == rc_id,
                    CompanyScrapeMatrix.region_id == reg_id,
                )
            )
            cell = existing.scalar_one_or_none()
            if cell:
                cell.enabled = True
            else:
                db.add(CompanyScrapeMatrix(
                    company_id=company_id,
                    retailer_category_id=rc_id,
                    region_id=reg_id,
                    enabled=True,
                ))
                matrix_created += 1

    await db.commit()
    return {
        "category_mappings_created": cat_created,
        "region_mappings_created": reg_created,
        "matrix_cells_created": matrix_created,
    }
