"""Парсинг ИНН/ОГРН с сайтов конкурентов через Firecrawl."""
import re
import logging
from dataclasses import dataclass, field
import httpx
from app.core.config import settings

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

# ИНН: 10 цифр (юрлицо) или 12 цифр (ИП)
INN_PATTERN = re.compile(r"(?:ИНН|INN)\s*:?\s*(\d{10,12})")
# ОГРН: 13 цифр (юрлицо) или 15 цифр (ИП)
OGRN_PATTERN = re.compile(r"(?:ОГРН|OGRN)\s*:?\s*(\d{13,15})")
# Юридическое название
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
    method: str | None = None  # firecrawl / http


def _extract_from_text(text: str, result: ScrapedLegalInfo) -> None:
    """Извлечь ИНН, ОГРН и юр. названия из текста."""
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


async def _scrape_with_firecrawl(url: str) -> str | None:
    """Получить markdown-контент страницы через Firecrawl API."""
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
    """Фоллбэк — обычный HTTP запрос."""
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


async def scrape_legal_info(website: str) -> ScrapedLegalInfo:
    """Парсит сайт конкурента в поисках ИНН, ОГРН, юр. названия."""
    if not website:
        return ScrapedLegalInfo()

    base_url = f"https://{website.rstrip('/')}"
    result = ScrapedLegalInfo()
    use_firecrawl = bool(settings.firecrawl_api_key)

    for path in LEGAL_PATHS:
        url = f"{base_url}{path}"

        # Пробуем Firecrawl (рендерит JS), потом HTTP фоллбэк
        text = None
        if use_firecrawl:
            text = await _scrape_with_firecrawl(url)
            if text:
                result.method = "firecrawl"

        if not text:
            text = await _scrape_with_http(url)
            if text and not result.method:
                result.method = "http"

        if not text:
            continue

        _extract_from_text(text, result)

        if not result.source_url:
            result.source_url = url

        # Нашли ИНН или ОГРН — достаточно
        if result.inn or result.ogrn:
            break

    return result
