"""Парсинг юрлиц с сайтов конкурентов: Firecrawl + Claude AI extraction."""
import json
import re
import logging
from dataclasses import dataclass, field
from typing import AsyncGenerator
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.services.scrape_utils import (
    get_cached, save_cache, scrape_with_firecrawl, scrape_with_http,
)

logger = logging.getLogger(__name__)

LEGAL_PATHS = [
    "/oferta",
    "/public-offer",
    "/privacy",
    "/privacy-policy",
    "/politika-konfidencialnosti",
    "/legal",
    "/contacts",
    "/kontakty",
    "/about",
    "/o-kompanii",
    "/",
]

LEGAL_EXTRACTION_PROMPT = """Найди юридическую информацию о компании-владельце этого сайта.

Верни ТОЛЬКО валидный JSON:
{
  "inn": "1234567890" или null,
  "ogrn": "1234567890123" или null,
  "legal_name": "ООО \"Компания\"" или null,
  "legal_form": "ООО" или null
}

Правила:
- ИНН: 10 или 12 цифр
- ОГРН: 13 или 15 цифр
- Юридическое название: полное, с формой (ООО, АО, ПАО, ИП и т.д.)
- Если данных нет — null
- Без пояснений, только JSON"""

MAX_TEXT_FOR_LLM = 15_000


@dataclass
class ScrapedLegalInfo:
    inn: str | None = None
    ogrn: str | None = None
    legal_name: str | None = None
    legal_names: list[str] = field(default_factory=list)
    source_url: str | None = None
    method: str | None = None
    api_calls: int = 0
    cache_hits: int = 0


async def _extract_with_llm(text: str) -> dict | None:
    """Send text to Claude and extract legal info."""
    if not settings.anthropic_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 256,
                    "messages": [{"role": "user", "content": f"{LEGAL_EXTRACTION_PROMPT}\n\n---\n\n{text[:MAX_TEXT_FOR_LLM]}"}],
                },
            )
            if r.status_code != 200:
                logger.error(f"Claude API {r.status_code}: {r.text[:200]}")
                return None
            content = r.json().get("content", [{}])[0].get("text", "")
            content = content.strip()
            if content.startswith("```"):
                content = re.sub(r'^```(?:json)?\s*', '', content)
                content = re.sub(r'\s*```$', '', content)
            return json.loads(content)
    except Exception as e:
        logger.error(f"LLM legal extraction error: {e}")
        return None


async def scrape_legal_info_streaming(
    website: str, db: AsyncSession | None = None, skip_cache: bool = False
) -> AsyncGenerator[dict, None]:
    """Scrape website for legal info, yield SSE events. Uses Claude AI for extraction."""
    if not website:
        yield {"step": "error", "message": "Нет сайта"}
        return

    base_url = f"https://{website.rstrip('/')}"
    total_api_calls = 0
    total_cache_hits = 0

    for i, path in enumerate(LEGAL_PATHS):
        url = f"{base_url}{path}"
        yield {"step": "scraping", "message": f"Проверяем {path}... ({i+1}/{len(LEGAL_PATHS)})"}

        # 1. Cache
        text = None
        if db and not skip_cache:
            text = await get_cached(db, url)
            if text:
                total_cache_hits += 1
                yield {"step": "cache_hit", "message": f"{path}: из кэша ({len(text)} симв.)"}

        # 2. Firecrawl
        if not text and settings.firecrawl_api_key:
            yield {"step": "scraping", "message": f"Firecrawl: {path}..."}
            try:
                text = await scrape_with_firecrawl(url)
            except Exception as e:
                logger.error(f"Firecrawl error {url}: {e}")
                yield {"step": "error", "message": f"Firecrawl ошибка: {str(e)[:80]}"}

            if text:
                total_api_calls += 1
                yield {"step": "scraped", "message": f"{path}: {len(text)} символов"}
                if db:
                    await save_cache(db, url, text)

        # 3. HTTP fallback
        if not text:
            try:
                text = await scrape_with_http(url)
            except Exception:
                pass
            if text and db:
                await save_cache(db, url, text)

        if not text:
            continue

        # 4. Claude AI extraction
        yield {"step": "extracting", "message": f"Claude AI: анализируем {path}..."}
        extracted = await _extract_with_llm(text)

        if extracted and (extracted.get("inn") or extracted.get("ogrn")):
            yield {
                "step": "found",
                "message": f"Найден: {extracted.get('legal_name', '?')} (ИНН: {extracted.get('inn', '—')}, ОГРН: {extracted.get('ogrn', '—')})",
                "inn": extracted.get("inn"),
                "ogrn": extracted.get("ogrn"),
                "legal_name": extracted.get("legal_name"),
                "legal_names": [extracted["legal_name"]] if extracted.get("legal_name") else [],
                "source_url": url,
                "method": "firecrawl+ai",
            }
            return

    yield {
        "step": "not_found",
        "message": f"Юрлицо не найдено (проверено {len(LEGAL_PATHS)} страниц, API: {total_api_calls}, кэш: {total_cache_hits})",
        "legal_names": [],
    }


async def scrape_legal_info(
    website: str, db: AsyncSession | None = None, skip_cache: bool = False
) -> ScrapedLegalInfo:
    """Non-streaming version: returns ScrapedLegalInfo."""
    result = ScrapedLegalInfo()
    async for event in scrape_legal_info_streaming(website, db, skip_cache):
        if event.get("inn"):
            result.inn = event["inn"]
        if event.get("ogrn"):
            result.ogrn = event["ogrn"]
        if event.get("legal_name"):
            result.legal_name = event["legal_name"]
        if event.get("legal_names"):
            result.legal_names = event["legal_names"]
        if event.get("source_url"):
            result.source_url = event["source_url"]
        if event.get("method"):
            result.method = event["method"]
        if event["step"] == "scraped":
            result.api_calls += 1
        if event["step"] == "cache_hit":
            result.cache_hits += 1
    return result
