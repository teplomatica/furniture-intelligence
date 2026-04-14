"""Offer scraping engine with SSE event streaming. Uses new mapping tables."""
import asyncio
import logging
from datetime import datetime
from typing import AsyncGenerator
from urllib.parse import urlencode, urlparse, parse_qs, urlunparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.region import Region
from app.models.category import Category
from app.models.offer import Offer, RegionMethod, CategorySource
from app.models.competitor_data import DataSource
from app.models.company_mapping import (
    CompanyCategoryMapping, CompanyRegionMapping, CompanyScrapeMatrix,
)
from app.services.scrape_utils import get_cached, save_cache, scrape_with_firecrawl, scrape_with_http
from app.services.offer_parser import parse_offers, detect_has_next_page
from app.services.categorization import (
    load_category_keywords, load_price_segments, auto_categorize_offer,
)
from app.services.app_settings import get_setting_int, get_setting_float, get_setting_bool

logger = logging.getLogger(__name__)


def _build_paginated_url(catalog_url: str, page: int) -> str:
    if page <= 1:
        return catalog_url
    parsed = urlparse(catalog_url)
    params = parse_qs(parsed.query)
    params["page"] = [str(page)]
    new_query = urlencode(params, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def _apply_region_to_url(url: str, region_mapping: CompanyRegionMapping) -> str:
    if region_mapping.region_method == RegionMethod.url_param and region_mapping.region_key and region_mapping.region_value:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}{region_mapping.region_key}={region_mapping.region_value}"
    return url


def _build_region_headers(region_mapping: CompanyRegionMapping) -> dict | None:
    if region_mapping.region_method == RegionMethod.cookie and region_mapping.region_key and region_mapping.region_value:
        return {"Cookie": f"{region_mapping.region_key}={region_mapping.region_value}"}
    if region_mapping.region_method == RegionMethod.header and region_mapping.region_key and region_mapping.region_value:
        return {region_mapping.region_key: region_mapping.region_value}
    return None


async def scrape_offers_events(
    company_id: int,
    region_id: int | None,
    db: AsyncSession,
) -> AsyncGenerator[dict, None]:
    """Scrape offers using category/region mappings + scrape matrix."""

    # Load settings
    max_pages = await get_setting_int(db, "max_pages_per_catalog", 10)
    rate_limit = await get_setting_float(db, "rate_limit_seconds", 1.5)
    wait_for = await get_setting_int(db, "firecrawl_wait_for", 2000)
    cache_ttl = await get_setting_int(db, "cache_ttl_days", 7)
    debug_mode = await get_setting_bool(db, "debug_mode", False)
    debug_max_calls = await get_setting_int(db, "debug_max_api_calls", 3)
    debug_max_offers = await get_setting_int(db, "debug_max_offers_per_page", 5)

    company = await db.get(Company, company_id)
    if not company:
        yield {"step": "error", "message": "Компания не найдена"}
        return

    # Load enabled matrix cells
    matrix_q = select(CompanyScrapeMatrix).where(
        CompanyScrapeMatrix.company_id == company_id,
        CompanyScrapeMatrix.enabled == True,
    )
    if region_id:
        matrix_q = matrix_q.where(CompanyScrapeMatrix.region_id == region_id)
    matrix_rows = (await db.execute(matrix_q)).scalars().all()

    if not matrix_rows:
        yield {"step": "skipped", "message": "Нет активных ячеек в матрице парсинга"}
        return

    # Load category mappings (URLs)
    cat_mappings_result = await db.execute(
        select(CompanyCategoryMapping).where(CompanyCategoryMapping.company_id == company_id)
    )
    cat_url_map: dict[int, list[str]] = {}
    for m in cat_mappings_result.scalars().all():
        cat_url_map.setdefault(m.category_id, []).append(m.retailer_url)

    # Load region mappings (params)
    reg_mappings_result = await db.execute(
        select(CompanyRegionMapping).where(CompanyRegionMapping.company_id == company_id)
    )
    reg_param_map: dict[int, CompanyRegionMapping] = {
        m.region_id: m for m in reg_mappings_result.scalars().all()
    }

    # Load reference names
    cat_names = {c.id: c.name for c in (await db.execute(select(Category))).scalars().all()}
    reg_names = {r.id: r.name for r in (await db.execute(select(Region))).scalars().all()}

    if debug_mode:
        yield {"step": "debug_limit", "message": f"Debug mode: макс. {debug_max_calls} API вызовов", "debug": True}

    keywords = await load_category_keywords(db)
    segments = await load_price_segments(db)
    api_calls_total = 0
    batch_id = f"scrape_{company_id}_{datetime.utcnow().strftime('%Y%m%d%H%M')}"

    # Group matrix by region for sequential processing
    by_region: dict[int, list[int]] = {}
    for cell in matrix_rows:
        by_region.setdefault(cell.region_id, []).append(cell.category_id)

    for rid, category_ids in by_region.items():
        region_name = reg_names.get(rid, f"#{rid}")
        region_mapping = reg_param_map.get(rid)

        region_headers = _build_region_headers(region_mapping) if region_mapping else None

        yield {"step": "configuring", "message": f"{company.name} / {region_name}: начинаем сбор..."}

        all_offers: list[dict] = []

        for cat_id in category_ids:
            cat_name = cat_names.get(cat_id, f"#{cat_id}")
            urls = cat_url_map.get(cat_id, [])

            if not urls:
                yield {"step": "skipped", "message": f"{cat_name}: нет URL для парсинга"}
                continue

            for catalog_url in urls:
                # Resolve relative URL
                if catalog_url.startswith("/"):
                    catalog_url = f"https://{company.website}{catalog_url}" if company.website else catalog_url

                for page in range(1, max_pages + 1):
                    paginated_url = _build_paginated_url(catalog_url, page)
                    if region_mapping:
                        paginated_url = _apply_region_to_url(paginated_url, region_mapping)
                    cache_key = f"{paginated_url}#region={rid}"

                    yield {"step": "scraping", "message": f"{cat_name} / {region_name}: стр. {page}"}

                    if debug_mode and api_calls_total >= debug_max_calls:
                        yield {"step": "debug_limit", "message": f"Debug: лимит {debug_max_calls} вызовов", "debug": True}
                        break

                    text = await get_cached(db, cache_key, cache_ttl)
                    if text:
                        yield {"step": "cache_hit", "message": f"Из кэша: {cat_name} стр. {page}"}
                    else:
                        text = await scrape_with_firecrawl(paginated_url, region_headers, wait_for)
                        if text:
                            api_calls_total += 1
                            await save_cache(db, cache_key, text)
                        else:
                            http_cookies = None
                            if region_mapping and region_mapping.region_method == RegionMethod.cookie and region_mapping.region_key and region_mapping.region_value:
                                http_cookies = {region_mapping.region_key: region_mapping.region_value}
                            text = await scrape_with_http(paginated_url, cookies=http_cookies)
                            if text:
                                await save_cache(db, cache_key, text)

                    if not text:
                        yield {"step": "error", "message": f"Не удалось загрузить {cat_name} стр. {page}"}
                        break

                    yield {"step": "parsing", "message": f"Извлечение: {cat_name} стр. {page}..."}
                    base_url = f"https://{company.website}" if company.website else catalog_url
                    page_offers = await parse_offers(text, base_url)

                    if debug_mode and page_offers:
                        page_offers = page_offers[:debug_max_offers]

                    if not page_offers:
                        break

                    # Tag offers with category from matrix
                    for o in page_offers:
                        if not o.get("_category_id"):
                            o["_category_id"] = cat_id

                    all_offers.extend(page_offers)
                    yield {"step": "parsing", "message": f"{cat_name} стр. {page}: {len(page_offers)} товаров"}

                    if not detect_has_next_page(text, page):
                        break
                    if api_calls_total > 0:
                        await asyncio.sleep(rate_limit)

                if debug_mode and api_calls_total >= debug_max_calls:
                    break
            if debug_mode and api_calls_total >= debug_max_calls:
                break

        # Bulk upsert for this region
        if all_offers:
            yield {"step": "saving", "message": f"{region_name}: сохранение {len(all_offers)} офферов..."}
            created = 0
            updated = 0

            for item in all_offers:
                existing_offer = None
                if item.get("url"):
                    result = await db.execute(
                        select(Offer).where(
                            Offer.company_id == company_id,
                            Offer.region_id == rid,
                            Offer.url == item["url"],
                        )
                    )
                    existing_offer = result.scalar_one_or_none()

                if existing_offer:
                    existing_offer.name = item["name"]
                    existing_offer.price = item.get("price")
                    existing_offer.price_old = item.get("price_old")
                    existing_offer.is_available = item.get("is_available")
                    existing_offer.characteristics = item.get("characteristics")
                    existing_offer.sku = item.get("sku")
                    existing_offer.image_url = item.get("image_url")
                    existing_offer.batch_id = batch_id
                    if existing_offer.category_source == CategorySource.auto:
                        existing_offer.category_id = item.get("_category_id")
                        await auto_categorize_offer(existing_offer, keywords, segments)
                    updated += 1
                else:
                    offer = Offer(
                        company_id=company_id,
                        region_id=rid,
                        source=DataSource.scraper,
                        batch_id=batch_id,
                        name=item["name"],
                        url=item.get("url"),
                        sku=item.get("sku"),
                        price=item.get("price"),
                        price_old=item.get("price_old"),
                        is_available=item.get("is_available"),
                        image_url=item.get("image_url"),
                        characteristics=item.get("characteristics"),
                        category_id=item.get("_category_id"),
                    )
                    await auto_categorize_offer(offer, keywords, segments)
                    db.add(offer)
                    created += 1

            await db.commit()
            yield {"step": "done", "message": f"{region_name}: создано {created}, обновлено {updated}"}
        else:
            yield {"step": "done", "message": f"{region_name}: товаров не найдено"}

    yield {"step": "complete", "message": f"Сбор завершён. API вызовов: {api_calls_total}"}
