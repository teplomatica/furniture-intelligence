"""Celery tasks — parse one retailer_category × region = one task."""
import asyncio
import logging
from datetime import datetime
from urllib.parse import urlencode, urlparse, parse_qs, urlunparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.celery_app import celery_app
from app.core.config import settings as app_settings
from app.models.company import Company
from app.models.retailer_category import RetailerCategory
from app.models.scrape_task import ScrapeTask, ScrapeTaskStatus
from app.models.offer import Offer, RegionMethod, CategorySource
from app.models.competitor_data import DataSource
from app.models.company_mapping import CompanyRegionMapping, CompanyCategoryMapping
from app.services.scrape_utils import get_cached, save_cache, scrape_with_firecrawl, scrape_with_http
from app.services.offer_parser import parse_offers, detect_has_next_page
from app.services.categorization import load_category_keywords, load_price_segments, auto_categorize_offer
from app.services.app_settings import get_setting_int, get_setting_float, get_setting_bool

logger = logging.getLogger(__name__)


def _build_paginated_url(url: str, page: int) -> str:
    if page <= 1:
        return url
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    params["page"] = [str(page)]
    return urlunparse(parsed._replace(query=urlencode(params, doseq=True)))


async def _run_task(task_id: int) -> None:
    """Core async logic — runs in asyncio event loop with its own engine (no pool)."""
    engine = create_async_engine(app_settings.database_url, poolclass=NullPool)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    try:
        await _run_task_inner(task_id, SessionLocal)
    finally:
        await engine.dispose()


async def _run_task_inner(task_id: int, SessionLocal) -> None:
    async with SessionLocal() as db:
        task: ScrapeTask | None = await db.get(ScrapeTask, task_id)
        if not task:
            logger.error(f"ScrapeTask {task_id} not found")
            return

        task.status = ScrapeTaskStatus.running
        task.started_at = datetime.utcnow()
        await db.commit()

        try:
            company = await db.get(Company, task.company_id)
            rc = await db.get(RetailerCategory, task.retailer_category_id)
            if not company or not rc or not rc.url:
                task.status = ScrapeTaskStatus.failed
                task.error_message = "Company / retailer category / URL not found"
                task.finished_at = datetime.utcnow()
                await db.commit()
                return

            # Region params
            reg_result = await db.execute(
                select(CompanyRegionMapping).where(
                    CompanyRegionMapping.company_id == task.company_id,
                    CompanyRegionMapping.region_id == task.region_id,
                )
            )
            region_mapping = reg_result.scalar_one_or_none()

            # Find optional our category via mapping
            our_cat_id = None
            map_result = await db.execute(
                select(CompanyCategoryMapping).where(
                    CompanyCategoryMapping.company_id == task.company_id,
                    CompanyCategoryMapping.retailer_category_id == task.retailer_category_id,
                )
            )
            cat_map = map_result.scalar_one_or_none()
            if cat_map:
                our_cat_id = cat_map.category_id

            max_pages = await get_setting_int(db, "max_pages_per_catalog", 10)
            rate_limit = await get_setting_float(db, "rate_limit_seconds", 1.5)
            wait_for = await get_setting_int(db, "firecrawl_wait_for", 2000)
            cache_ttl = await get_setting_int(db, "cache_ttl_days", 7)
            debug_mode = await get_setting_bool(db, "debug_mode", False)
            debug_max_offers = 10  # hard limit in debug mode
            if debug_mode:
                max_pages = 1  # hard limit: 1 page only
                logger.info(f"Task {task_id}: DEBUG MODE — max 1 page, max {debug_max_offers} offers")

            keywords = await load_category_keywords(db)
            segments = await load_price_segments(db)

            # Build URL
            catalog_url = rc.url
            if catalog_url.startswith("/") and company.website:
                catalog_url = f"https://{company.website}{catalog_url}"

            # Region headers / url param
            extra_headers = None
            http_cookies = None
            if region_mapping:
                if region_mapping.region_method == RegionMethod.cookie and region_mapping.region_key and region_mapping.region_value:
                    extra_headers = {"Cookie": f"{region_mapping.region_key}={region_mapping.region_value}"}
                    http_cookies = {region_mapping.region_key: region_mapping.region_value}
                elif region_mapping.region_method == RegionMethod.header and region_mapping.region_key and region_mapping.region_value:
                    extra_headers = {region_mapping.region_key: region_mapping.region_value}
                elif region_mapping.region_method == RegionMethod.url_param and region_mapping.region_key and region_mapping.region_value:
                    sep = "&" if "?" in catalog_url else "?"
                    catalog_url = f"{catalog_url}{sep}{region_mapping.region_key}={region_mapping.region_value}"

            created = 0
            updated = 0
            batch_id = f"scrape_{task.id}_{datetime.utcnow().strftime('%Y%m%d%H%M')}"

            for page in range(1, max_pages + 1):
                # Check cancel flag
                await db.refresh(task)
                if task.status == ScrapeTaskStatus.cancelled:
                    return

                task.progress_current = page
                await db.commit()

                paginated = _build_paginated_url(catalog_url, page)
                cache_key = f"{paginated}#region={task.region_id}"

                text = await get_cached(db, cache_key, cache_ttl)
                if not text:
                    text = await scrape_with_firecrawl(paginated, extra_headers, wait_for)
                    if text:
                        await save_cache(db, cache_key, text)
                    else:
                        text = await scrape_with_http(paginated, cookies=http_cookies)
                        if text:
                            await save_cache(db, cache_key, text)

                if not text:
                    break

                base_url = f"https://{company.website}" if company.website else catalog_url
                page_offers = await parse_offers(text, base_url)
                if not page_offers:
                    break
                if debug_mode and len(page_offers) > debug_max_offers:
                    page_offers = page_offers[:debug_max_offers]

                for item in page_offers:
                    existing = None
                    if item.get("url"):
                        res = await db.execute(
                            select(Offer).where(
                                Offer.company_id == task.company_id,
                                Offer.region_id == task.region_id,
                                Offer.url == item["url"],
                            )
                        )
                        existing = res.scalar_one_or_none()

                    if existing:
                        existing.name = item["name"]
                        existing.price = item.get("price")
                        existing.price_old = item.get("price_old")
                        existing.is_available = item.get("is_available")
                        existing.sku = item.get("sku")
                        existing.image_url = item.get("image_url")
                        existing.batch_id = batch_id
                        if existing.category_source == CategorySource.auto:
                            if our_cat_id:
                                existing.category_id = our_cat_id
                            await auto_categorize_offer(existing, keywords, segments)
                        updated += 1
                    else:
                        offer = Offer(
                            company_id=task.company_id,
                            region_id=task.region_id,
                            source=DataSource.scraper,
                            batch_id=batch_id,
                            name=item["name"],
                            url=item.get("url"),
                            sku=item.get("sku"),
                            price=item.get("price"),
                            price_old=item.get("price_old"),
                            is_available=item.get("is_available"),
                            image_url=item.get("image_url"),
                            category_id=our_cat_id,
                        )
                        await auto_categorize_offer(offer, keywords, segments)
                        db.add(offer)
                        created += 1

                task.offers_created = created
                task.offers_updated = updated
                await db.commit()

                if not detect_has_next_page(text, page):
                    break
                await asyncio.sleep(rate_limit)

            task.status = ScrapeTaskStatus.done
            task.finished_at = datetime.utcnow()
            await db.commit()

        except Exception as e:
            logger.exception(f"Task {task_id} failed")
            task.status = ScrapeTaskStatus.failed
            task.error_message = str(e)[:500]
            task.finished_at = datetime.utcnow()
            await db.commit()


@celery_app.task(bind=True, name="scrape_offers_task")
def scrape_offers_task(self, scrape_task_id: int):
    """Entry point: run async _run_task in a new event loop."""
    asyncio.run(_run_task(scrape_task_id))
    return {"task_id": scrape_task_id}
