"""Shared scraping utilities: Firecrawl, HTTP fallback, cache."""
import logging
from datetime import datetime, timedelta
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.scrape_cache import ScrapeCache

logger = logging.getLogger(__name__)


async def get_cached(db: AsyncSession, url: str, ttl_days: int = 7) -> str | None:
    result = await db.execute(
        select(ScrapeCache).where(
            ScrapeCache.url == url,
            ScrapeCache.scraped_at > datetime.utcnow() - timedelta(days=ttl_days),
        )
    )
    cached = result.scalar_one_or_none()
    return cached.content if cached else None


async def save_cache(db: AsyncSession, url: str, content: str) -> None:
    result = await db.execute(select(ScrapeCache).where(ScrapeCache.url == url))
    existing = result.scalar_one_or_none()
    if existing:
        existing.content = content
        existing.scraped_at = datetime.utcnow()
    else:
        db.add(ScrapeCache(url=url, content=content))
    await db.flush()


async def scrape_with_firecrawl(
    url: str,
    extra_headers: dict | None = None,
    wait_for: int = 2000,
) -> str | None:
    if not settings.firecrawl_api_key:
        return None
    try:
        payload: dict = {"url": url, "formats": ["markdown"]}
        if wait_for:
            payload["waitFor"] = wait_for
        if extra_headers:
            payload["headers"] = extra_headers

        logger.info(f"Firecrawl request: {url}")
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.firecrawl.dev/v1/scrape",
                headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"},
                json=payload,
            )
            if r.status_code != 200:
                logger.warning(f"Firecrawl {r.status_code} for {url}: {r.text[:200]}")
                return None
            data = r.json()
            md = data.get("data", {}).get("markdown", "")
            logger.info(f"Firecrawl OK: {url} ({len(md)} chars)")
            return md
    except httpx.TimeoutException:
        logger.error(f"Firecrawl TIMEOUT for {url}")
        return None
    except Exception as e:
        logger.error(f"Firecrawl error for {url}: {type(e).__name__}: {e}")
        return None


async def scrape_with_http(
    url: str,
    headers: dict | None = None,
    cookies: dict | None = None,
) -> str | None:
    try:
        default_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        if headers:
            default_headers.update(headers)
        async with httpx.AsyncClient(
            timeout=10,
            follow_redirects=True,
            headers=default_headers,
            cookies=cookies,
        ) as client:
            r = await client.get(url)
            if r.status_code == 200 and len(r.text) > 500:
                return r.text
    except Exception as e:
        logger.debug(f"HTTP error for {url}: {e}")
    return None
