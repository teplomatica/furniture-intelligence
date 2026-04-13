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
from app.models.offer import CompanyRegionConfig, RegionMethod
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


class CategoryMapping(BaseModel):
    site_url: str
    our_category_id: Optional[int] = None


class CityMapping(BaseModel):
    site_value: str
    our_region_id: int


class ApplyAnalysisRequest(BaseModel):
    categories: list[CategoryMapping]  # catalog URLs to scrape
    region_method: str  # cookie, url_param, header, none
    region_key: Optional[str] = None
    cities: list[CityMapping]  # region mappings


@router.post("/{company_id}/apply-analysis")
async def apply_analysis(
    company_id: int,
    body: ApplyAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Apply analysis results: create CompanyRegionConfig entries."""
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    base_url = f"https://{company.website}" if company.website else ""
    catalog_urls = []
    for cat in body.categories:
        url = cat.site_url
        if url.startswith("/"):
            url = f"{base_url}{url}"
        catalog_urls.append(url)

    if not catalog_urls:
        raise HTTPException(status_code=400, detail="No catalog URLs selected")

    method_map = {
        "cookie": RegionMethod.cookie,
        "url_param": RegionMethod.url_param,
        "header": RegionMethod.header,
        "subdomain": RegionMethod.subdomain,
        "none": RegionMethod.none,
    }
    region_method = method_map.get(body.region_method, RegionMethod.none)

    created = 0
    updated = 0

    for city in body.cities:
        region = await db.get(Region, city.our_region_id)
        if not region:
            continue

        existing = await db.execute(
            select(CompanyRegionConfig).where(
                CompanyRegionConfig.company_id == company_id,
                CompanyRegionConfig.region_id == city.our_region_id,
            )
        )
        config = existing.scalar_one_or_none()

        if config:
            config.catalog_urls = catalog_urls
            config.region_method = region_method
            config.region_key = body.region_key
            config.region_value = city.site_value
            config.is_active = True
            updated += 1
        else:
            config = CompanyRegionConfig(
                company_id=company_id,
                region_id=city.our_region_id,
                catalog_urls=catalog_urls,
                region_method=region_method,
                region_key=body.region_key,
                region_value=city.site_value,
                is_active=True,
            )
            db.add(config)
            created += 1

    await db.commit()
    return {"created": created, "updated": updated, "catalog_urls": len(catalog_urls)}
