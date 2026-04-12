"""Парсинг ИНН/ОГРН с сайтов конкурентов через Firecrawl с кешированием."""
import re
import logging
from datetime import datetime, timedelta
from dataclasses import dataclass, field
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings

logger = logging.getLogger(__name__)

CACHE_TTL_DAYS = 7

# Страницы с юридической информацией (приоритет: документы → контакты → главная)
LEGAL_PATHS = [
    "/oferta",
    "/public-offer",
    "/offer",
    "/privacy",
    "/privacy-policy",
    "/politika-konfidencialnosti",
    "/legal",
    "/pravovaya-informaciya",
    "/terms",
    "/user-agreement",
    "/soglashenie",
    "/agreement",
    "/contacts",
    "/kontakty",
    "/about",
    "/o-kompanii",
    "/company",
    "/info/legal",
    "/info/oferta",
    "/",
]

INN_PATTERN = re.compile(r"(?:ИНН|INN)\s*:?\s*(\d{10,12})")
OGRN_PATTERN = re.compile(r"(?:ОГРН|OGRN)\s*:?\s*(\d{13,15})")
LEGAL_NAME_PATTERN = re.compile(
    r'((?:ООО|ОАО|ПАО|АО|ЗАО|ИП)\s*[«"\u00ab\u201c]([^»"\u00bb\u201d]{3,60})[»"\u00bb\u201d])',
    re.IGNORECASE,
)


@dataclass
class ScrapedLegalInfo:
    inn: str | None = None
    ogrn: str | None = None
    legal_names: list[str] = field(default_factory=list)
    source_url: str | None = None
    method: str | None = None  # firecrawl / http / cache
    api_calls: int = 0         # сколько Firecrawl API вызовов потрачено
    cache_hits: int = 0        # сколько страниц взято из кеша


def _extract_from_text(text: str, result: ScrapedLegalInfo) -> None:
    if not result.inn:
        m = INN_PATTERN.search(text)
        if m:
            result.inn = m.group(1)

    if not result.ogrn:
        m = OGRN_PATTERN.search(text)
        if m:
            result.ogrn = m.group(1)

    for match in LEGAL_NAME_PATTERN.finditer(text):
        name = match.group(0).strip()
        name = name.replace("\u00ab", '"').replace("\u00bb", '"').replace("\u201c", '"').replace("\u201d", '"')
        if name not in result.legal_names:
            result.legal_names.append(name)
            if len(result.legal_names) >= 5:
                break


async def _get_cached(db: AsyncSession, url: str) -> str | None:
    from app.models.scrape_cache import ScrapeCache
    result = await db.execute(
        select(ScrapeCache).where(
            ScrapeCache.url == url,
            ScrapeCache.scraped_at > datetime.utcnow() - timedelta(days=CACHE_TTL_DAYS),
        )
    )
    cached = result.scalar_one_or_none()
    return cached.content if cached else None


async def _save_cache(db: AsyncSession, url: str, content: str) -> None:
    from app.models.scrape_cache import ScrapeCache
    result = await db.execute(select(ScrapeCache).where(ScrapeCache.url == url))
    existing = result.scalar_one_or_none()
    if existing:
        existing.content = content
        existing.scraped_at = datetime.utcnow()
    else:
        db.add(ScrapeCache(url=url, content=content))
    await db.flush()


async def _scrape_with_firecrawl(url: str) -> str | None:
    if not settings.firecrawl_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.firecrawl.dev/v1/scrape",
                headers={"Authorization": f"Bearer {settings.firecrawl_api_key}"},
                json={"url": url, "formats": ["markdown"]},
            )
            if r.status_code != 200:
                logger.debug(f"Firecrawl {r.status_code} for {url}")
                return None
            data = r.json()
            return data.get("data", {}).get("markdown", "")
    except Exception as e:
        logger.debug(f"Firecrawl error for {url}: {e}")
        return None


async def _scrape_with_http(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(
            timeout=10,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        ) as client:
            r = await client.get(url)
            if r.status_code == 200 and len(r.text) > 500:
                return r.text
    except Exception as e:
        logger.debug(f"HTTP error for {url}: {e}")
    return None


async def scrape_legal_info(website: str, db: AsyncSession | None = None) -> ScrapedLegalInfo:
    """Парсит сайт конкурента в поисках ИНН, ОГРН, юр. названия. Кеширует результат."""
    if not website:
        return ScrapedLegalInfo()

    base_url = f"https://{website.rstrip('/')}"
    result = ScrapedLegalInfo()
    use_firecrawl = bool(settings.firecrawl_api_key)

    for path in LEGAL_PATHS:
        url = f"{base_url}{path}"

        # 1. Проверяем кеш
        text = None
        if db:
            text = await _get_cached(db, url)
            if text:
                result.cache_hits += 1
                if not result.method:
                    result.method = "cache"

        # 2. Firecrawl (рендерит JS)
        if not text and use_firecrawl:
            text = await _scrape_with_firecrawl(url)
            if text:
                result.api_calls += 1
                result.method = "firecrawl"
                if db:
                    await _save_cache(db, url, text)

        # 3. HTTP фоллбэк
        if not text:
            text = await _scrape_with_http(url)
            if text:
                if not result.method:
                    result.method = "http"
                if db:
                    await _save_cache(db, url, text)

        if not text:
            continue

        _extract_from_text(text, result)

        if not result.source_url:
            result.source_url = url

        if result.inn or result.ogrn:
            break

    return result
