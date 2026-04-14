"""Парсинг ИНН/ОГРН с сайтов конкурентов через Firecrawl с кешированием."""
import re
import logging
from dataclasses import dataclass, field
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.services.scrape_utils import (
    get_cached, save_cache, scrape_with_firecrawl, scrape_with_http,
)

logger = logging.getLogger(__name__)

# Страницы с юридической информацией (приоритет: документы → контакты → главная)
LEGAL_PATHS = [
    "/oferta",
    "/public-offer",
    "/privacy",
    "/privacy-policy",
    "/politika-konfidencialnosti",
    "/legal",
    "/pravovaya-informaciya",
    "/terms",
    "/contacts",
    "/kontakty",
    "/about",
    "/o-kompanii",
    "/",
]

# Regex устойчивый к markdown: **ИНН** 123, *ИНН*: 123, ИНН\n123
INN_PATTERN = re.compile(r"(?:\*{0,2})(?:ИНН|INN)(?:\*{0,2})\s*:?\s*(\d{10,12})")
OGRN_PATTERN = re.compile(r"(?:\*{0,2})(?:ОГРН|OGRN)(?:\*{0,2})\s*:?\s*(\d{13,15})")
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
    api_calls: int = 0
    cache_hits: int = 0


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


async def scrape_legal_info(
    website: str, db: AsyncSession | None = None, skip_cache: bool = False
) -> ScrapedLegalInfo:
    """Парсит сайт конкурента в поисках ИНН, ОГРН. Кеширует результат."""
    if not website:
        return ScrapedLegalInfo()

    base_url = f"https://{website.rstrip('/')}"
    result = ScrapedLegalInfo()
    use_firecrawl = bool(settings.firecrawl_api_key)

    for path in LEGAL_PATHS:
        url = f"{base_url}{path}"
        logger.info(f"Legal scrape: trying {url}")

        text = None
        if db and not skip_cache:
            text = await get_cached(db, url)
            if text:
                result.cache_hits += 1
                if not result.method:
                    result.method = "cache"
                logger.info(f"Legal scrape: cache hit for {path}")

        if not text and use_firecrawl:
            logger.info(f"Legal scrape: Firecrawl {path}...")
            text = await scrape_with_firecrawl(url)
            if text:
                result.api_calls += 1
                result.method = "firecrawl"
                logger.info(f"Legal scrape: Firecrawl OK {path} ({len(text)} chars)")
                if db:
                    await save_cache(db, url, text)
            else:
                logger.warning(f"Legal scrape: Firecrawl failed for {path}")

        if not text:
            text = await scrape_with_http(url)
            if text:
                if not result.method:
                    result.method = "http"
                logger.info(f"Legal scrape: HTTP OK {path} ({len(text)} chars)")
                if db:
                    await save_cache(db, url, text)
            else:
                logger.warning(f"Legal scrape: HTTP failed for {path}")

        if not text:
            continue

        _extract_from_text(text, result)

        if not result.source_url:
            result.source_url = url

        if result.inn or result.ogrn:
            logger.info(f"Legal scrape: found INN={result.inn} OGRN={result.ogrn} at {path}")
            break

    logger.info(f"Legal scrape done: method={result.method} api_calls={result.api_calls} cache_hits={result.cache_hits}")
    return result


async def scrape_legal_info_streaming(
    website: str, db: AsyncSession | None = None, skip_cache: bool = False
) -> AsyncGenerator[dict, None]:
    """Same as scrape_legal_info but yields SSE events per URL tried."""
    if not website:
        yield {"step": "error", "message": "Нет сайта"}
        return

    base_url = f"https://{website.rstrip('/')}"
    result = ScrapedLegalInfo()
    use_firecrawl = bool(settings.firecrawl_api_key)

    for i, path in enumerate(LEGAL_PATHS):
        url = f"{base_url}{path}"

        yield {"step": "scraping", "message": f"Проверяем {path}... ({i+1}/{len(LEGAL_PATHS)})"}

        text = None
        if db and not skip_cache:
            text = await get_cached(db, url)
            if text:
                result.cache_hits += 1
                if not result.method:
                    result.method = "cache"
                yield {"step": "cache_hit", "message": f"{path}: из кэша"}

        if not text and use_firecrawl:
            yield {"step": "scraping", "message": f"Firecrawl: {path}..."}
            try:
                text = await scrape_with_firecrawl(url)
            except Exception as e:
                logger.error(f"Firecrawl error for {url}: {e}")
                yield {"step": "error", "message": f"Firecrawl ошибка: {path} — {str(e)[:100]}"}
                text = None

            if text:
                result.api_calls += 1
                result.method = "firecrawl"
                yield {"step": "scraped", "message": f"{path}: {len(text)} символов"}
                if db:
                    await save_cache(db, url, text)

        if not text:
            try:
                text = await scrape_with_http(url)
            except Exception as e:
                logger.error(f"HTTP error for {url}: {e}")
                text = None

            if text:
                if not result.method:
                    result.method = "http"
                if db:
                    await save_cache(db, url, text)

        if not text:
            continue

        _extract_from_text(text, result)

        if not result.source_url:
            result.source_url = url

        if result.inn or result.ogrn:
            yield {
                "step": "found",
                "message": f"Найден ИНН: {result.inn or '—'}, ОГРН: {result.ogrn or '—'} ({path})",
                "inn": result.inn,
                "ogrn": result.ogrn,
                "source_url": result.source_url,
                "method": result.method,
            }
            return

    yield {
        "step": "not_found",
        "message": f"ИНН/ОГРН не найдены (проверено {len(LEGAL_PATHS)} страниц, API: {result.api_calls}, кэш: {result.cache_hits})",
        "legal_names": result.legal_names,
    }
