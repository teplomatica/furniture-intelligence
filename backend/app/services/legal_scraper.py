"""Парсинг ИНН/ОГРН с сайтов конкурентов."""
import re
import logging
from dataclasses import dataclass
import httpx

logger = logging.getLogger(__name__)

# Страницы где обычно указаны юридические данные
# Приоритет: юр. документы (оферта, политика) → контакты → о компании → главная
LEGAL_PATHS = [
    # Юридические документы — самый надёжный источник ИНН/ОГРН
    "/oferta",
    "/oferta/",
    "/public-offer",
    "/public-offer/",
    "/offer",
    "/politika-konfidencialnosti",
    "/privacy",
    "/privacy-policy",
    "/privacy/",
    "/confidential",
    "/soglashenie",
    "/agreement",
    "/terms",
    "/terms-of-use",
    "/user-agreement",
    "/legal",
    "/legal/",
    "/pravovaya-informaciya",
    "/info/legal",
    "/info/oferta",
    # Контакты
    "/contacts",
    "/contacts/",
    "/kontakty",
    "/kontakty/",
    "/contact",
    # О компании
    "/about",
    "/about/",
    "/o-kompanii",
    "/o-kompanii/",
    "/company",
    "/company/",
    # Главная (футер)
    "/",
]

# ИНН: 10 цифр (юрлицо) или 12 цифр (ИП)
INN_PATTERN = re.compile(r"(?:ИНН|INN)[:\s]*(\d{10,12})", re.IGNORECASE)
# ОГРН: 13 цифр (юрлицо) или 15 цифр (ИП)
OGRN_PATTERN = re.compile(r"(?:ОГРН|OGRN)[:\s]*(\d{13,15})", re.IGNORECASE)
# Standalone INN (fallback) — 10-digit number near legal keywords
INN_FALLBACK = re.compile(r"(\d{10})\b")
# Legal entity name patterns
LEGAL_NAME_PATTERN = re.compile(
    r"((?:ООО|ОАО|ПАО|АО|ЗАО|ИП)\s*[«\""]([^»\""]{3,60})[»\""])",
    re.IGNORECASE,
)


@dataclass
class ScrapedLegalInfo:
    inn: str | None = None
    ogrn: str | None = None
    legal_names: list[str] | None = None
    source_url: str | None = None


async def scrape_legal_info(website: str) -> ScrapedLegalInfo:
    """Парсит сайт конкурента в поисках ИНН, ОГРН, юр. названия."""
    if not website:
        return ScrapedLegalInfo()

    base_url = f"https://{website.rstrip('/')}"
    result = ScrapedLegalInfo()
    all_text = ""

    async with httpx.AsyncClient(
        timeout=10,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
    ) as client:
        for path in LEGAL_PATHS:
            url = f"{base_url}{path}"
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    continue

                page_text = r.text
                all_text += " " + page_text

                # Ищем ИНН на каждой странице — если нашли, запоминаем источник
                inn_match = INN_PATTERN.search(page_text)
                if inn_match and not result.inn:
                    result.inn = inn_match.group(1)
                    result.source_url = url

                ogrn_match = OGRN_PATTERN.search(page_text)
                if ogrn_match and not result.ogrn:
                    result.ogrn = ogrn_match.group(1)
                    if not result.source_url:
                        result.source_url = url

                # Если нашли и ИНН и ОГРН — достаточно
                if result.inn and result.ogrn:
                    break

            except Exception as e:
                logger.debug(f"Failed to fetch {url}: {e}")
                continue

    if not all_text:
        return result

    # Ищем юридические названия во всём собранном тексте
    legal_names = set()
    for match in LEGAL_NAME_PATTERN.finditer(all_text):
        full = match.group(0).strip()
        full = full.replace("\u00ab", '"').replace("\u00bb", '"').replace("\u201c", '"').replace("\u201d", '"')
        legal_names.add(full)
    if legal_names:
        result.legal_names = list(legal_names)[:5]

    return result
