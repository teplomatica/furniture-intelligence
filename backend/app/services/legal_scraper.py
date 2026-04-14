"""Парсинг ИНН/ОГРН с сайтов конкурентов через Firecrawl с кешированием."""
import re
import logging
from dataclasses import dataclass, field
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


async def scrape_legal_info(website: str, db: AsyncSession | None = None, skip_cache: bool = False) -> ScrapedLegalInfo:
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
        if db and not skip_cache:
            text = await get_cached(db, url)
            if text:
                result.cache_hits += 1
                if not result.method:
                    result.method = "cache"

        # 2. Firecrawl (рендерит JS)
        if not text and use_firecrawl:
            text = await scrape_with_firecrawl(url)
            if text:
                result.api_calls += 1
                result.method = "firecrawl"
                if db:
                    await save_cache(db, url, text)

        # 3. HTTP фоллбэк
        if not text:
            text = await scrape_with_http(url)
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
            break

    return result
