"""Offer scraping engine with SSE event streaming."""
import asyncio
import logging
from datetime import datetime
from typing import AsyncGenerator
from urllib.parse import urlencode, urlparse, parse_qs, urlunparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.region import Region
from app.models.offer import (
    Offer, CompanyRegionConfig, RegionMethod, CategorySource,
)
from app.models.competitor_data import DataSource
from app.services.scrape_utils import get_cached, save_cache, scrape_with_firecrawl, scrape_with_http
from app.services.offer_parser import parse_offers, detect_has_next_page
from app.services.categorization import (
    load_category_keywords, load_price_segments, auto_categorize_offer,
)
from app.services.app_settings import get_setting_int, get_setting_float, get_setting_bool

logger = logging.getLogger(__name__)


def _build_paginated_url(catalog_url: str, page: int) -> str:
    """Append ?page=N or &page=N to URL."""
    if page <= 1:
        return catalog_url
    parsed = urlparse(catalog_url)
    params = parse_qs(parsed.query)
    params["page"] = [str(page)]
    new_query = urlencode(params, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def _build_region_headers(config: CompanyRegionConfig) -> dict | None:
    """Build extra headers for Firecrawl based on region method."""
    if config.region_method == RegionMethod.cookie and config.region_key and config.region_value:
        return {"Cookie": f"{config.region_key}={config.region_value}"}
    if config.region_method == RegionMethod.header and config.region_key and config.region_value:
        return {config.region_key: config.region_value}
    return None


def _apply_url_param(url: str, config: CompanyRegionConfig) -> str:
    """Add region URL param if configured."""
    if config.region_method == RegionMethod.url_param and config.region_key and config.region_value:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}{config.region_key}={config.region_value}"
    return url


async def scrape_offers_events(
    company_id: int,
    region_id: int | None,
    db: AsyncSession,
) -> AsyncGenerator[dict, None]:
    """Scrape offers for a company (optionally filtered by region). Yields SSE event dicts."""

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

    # Load configs
    q = select(CompanyRegionConfig).where(
        CompanyRegionConfig.company_id == company_id,
        CompanyRegionConfig.is_active == True,
    )
    if region_id:
        q = q.where(CompanyRegionConfig.region_id == region_id)
    configs = (await db.execute(q)).scalars().all()

    if not configs:
        yield {"step": "skipped", "message": "Нет активных настроек парсинга для этой компании"}
        return

    if debug_mode:
        yield {"step": "debug_limit", "message": f"Debug mode: макс. {debug_max_calls} API вызовов, {debug_max_offers} офферов/стр.", "debug": True}

    # Load categorization data
    keywords = await load_category_keywords(db)
    segments = await load_price_segments(db)

    api_calls_total = 0
    batch_id = f"scrape_{company_id}_{datetime.utcnow().strftime('%Y%m%d%H%M')}"

    for config in configs:
        region = await db.get(Region, config.region_id)
        region_name = region.name if region else f"#{config.region_id}"

        if not config.catalog_urls:
            yield {"step": "skipped", "message": f"{region_name}: нет catalog URLs"}
            continue

        yield {"step": "configuring", "message": f"{company.name} / {region_name}: начинаем сбор..."}

        region_headers = _build_region_headers(config)
        all_offers: list[dict] = []

        for catalog_url in config.catalog_urls:
            for page in range(1, max_pages + 1):
                paginated_url = _build_paginated_url(catalog_url, page)
                paginated_url = _apply_url_param(paginated_url, config)
                cache_key = f"{paginated_url}#region={config.region_id}"

                yield {"step": "scraping", "message": f"{region_name}: стр. {page} — {catalog_url}"}

                # Check debug limit
                if debug_mode and api_calls_total >= debug_max_calls:
                    yield {"step": "debug_limit", "message": f"Debug: лимит {debug_max_calls} вызовов достигнут", "debug": True}
                    break

                # Try cache
                text = await get_cached(db, cache_key, cache_ttl)
                if text:
                    yield {"step": "cache_hit", "message": f"Из кэша: стр. {page}"}
                else:
                    # Firecrawl
                    text = await scrape_with_firecrawl(paginated_url, region_headers, wait_for)
                    if text:
                        api_calls_total += 1
                        await save_cache(db, cache_key, text)
                    else:
                        # HTTP fallback
                        http_cookies = None
                        if config.region_method == RegionMethod.cookie and config.region_key and config.region_value:
                            http_cookies = {config.region_key: config.region_value}
                        text = await scrape_with_http(paginated_url, cookies=http_cookies)
                        if text:
                            await save_cache(db, cache_key, text)

                if not text:
                    yield {"step": "error", "message": f"Не удалось загрузить стр. {page}"}
                    break

                # Parse
                yield {"step": "parsing", "message": f"Извлечение товаров со стр. {page}..."}
                base_url = f"https://{company.website}" if company.website else catalog_url
                page_offers = await parse_offers(text, base_url)

                if debug_mode and page_offers:
                    page_offers = page_offers[:debug_max_offers]

                if not page_offers:
                    yield {"step": "parsing", "message": f"Стр. {page}: товаров не найдено, стоп"}
                    break

                all_offers.extend(page_offers)
                yield {"step": "parsing", "message": f"Стр. {page}: найдено {len(page_offers)} товаров"}

                # Check pagination
                if not detect_has_next_page(text, page):
                    break

                # Rate limit between API calls
                if api_calls_total > 0:
                    await asyncio.sleep(rate_limit)

            # Break outer loop on debug limit too
            if debug_mode and api_calls_total >= debug_max_calls:
                break

        # Bulk upsert
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
                            Offer.region_id == config.region_id,
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
                        await auto_categorize_offer(existing_offer, keywords, segments)
                    updated += 1
                else:
                    offer = Offer(
                        company_id=company_id,
                        region_id=config.region_id,
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
                    )
                    await auto_categorize_offer(offer, keywords, segments)
                    db.add(offer)
                    created += 1

            await db.commit()
            yield {
                "step": "done",
                "message": f"{region_name}: создано {created}, обновлено {updated}",
                "created": created,
                "updated": updated,
            }
        else:
            yield {"step": "done", "message": f"{region_name}: товаров не найдено"}

    yield {"step": "complete", "message": f"Сбор завершён. API вызовов: {api_calls_total}"}
