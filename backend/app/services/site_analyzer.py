"""LLM-driven site structure analysis: discover categories and regions."""
import json
import re
import logging
from typing import AsyncGenerator
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.company import Company
from app.models.category import Category
from app.models.region import Region
from app.services.scrape_utils import scrape_with_firecrawl, get_cached, save_cache
from app.services.app_settings import get_setting_int

logger = logging.getLogger(__name__)

CATEGORY_PROMPT = """Проанализируй структуру интернет-магазина мебели.

Найди категории товаров и их URL. Мне нужны URL страниц ГДЕ ОТОБРАЖАЮТСЯ ТОВАРЫ С ЦЕНАМИ (листинг товаров), а НЕ обзорные страницы с подкатегориями.

Например:
- ПРАВИЛЬНО: /catalog/gostinaya/divany/ (страница со списком диванов и ценами)
- НЕПРАВИЛЬНО: /catalog/gostinaya/ (обзорная страница с иконками подкатегорий)

Выбирай самый глубокий уровень вложенности где есть товары.

Верни ТОЛЬКО валидный JSON массив:
[
  {
    "name": "Диваны",
    "url": "/catalog/gostinaya/divany/",
    "subcategories": []
  },
  {
    "name": "Кресла",
    "url": "/catalog/gostinaya/kresla/",
    "subcategories": []
  }
]

Правила:
- Только URL страниц с ТОВАРАМИ (где есть цены), не обзорные страницы
- Только мебельные категории (диваны, кровати, шкафы, столы, матрасы, кухни и т.д.)
- НЕ включай: текстиль, ковры, светильники, декор, аксессуары
- URL может быть относительным или абсолютным
- Без пояснений, только JSON"""

REGION_PROMPT = """Проанализируй как этот мебельный интернет-магазин управляет регионами/городами.

Найди:
1. Есть ли выбор города/региона на сайте
2. Каким методом задаётся регион (cookie, URL параметр, поддомен, заголовок)
3. Какое имя параметра/cookie используется
4. Какие города/регионы доступны и их значения

Верни ТОЛЬКО валидный JSON:
{
  "has_region_selector": true,
  "method": "cookie",
  "key": "city_id",
  "cities": [
    {"name": "Москва", "value": "1"},
    {"name": "Санкт-Петербург", "value": "2"}
  ],
  "notes": "краткое описание как работает выбор города"
}

Если выбора города нет:
{"has_region_selector": false, "method": "none", "key": null, "cities": [], "notes": "нет выбора города"}

Без пояснений, только JSON."""

MAX_MARKDOWN = 40_000


async def _call_claude(prompt: str, markdown: str) -> dict | list | None:
    """Call Claude API and parse JSON response."""
    if not settings.anthropic_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 4096,
                    "messages": [{"role": "user", "content": f"{prompt}\n\n---\n\n{markdown[:MAX_MARKDOWN]}"}],
                },
            )
            if r.status_code != 200:
                logger.error(f"Claude API {r.status_code}: {r.text[:300]}")
                return None
            content = r.json().get("content", [{}])[0].get("text", "")
            content = content.strip()
            if content.startswith("```"):
                content = re.sub(r'^```(?:json)?\s*', '', content)
                content = re.sub(r'\s*```$', '', content)
            return json.loads(content)
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        return None


def _match_our_category(site_cat_name: str, our_categories: list[tuple[int, str, str]]) -> dict | None:
    """Try to match a site category to one of our categories."""
    name_lower = site_cat_name.lower()
    for cat_id, cat_name, cat_slug in our_categories:
        if cat_name in name_lower or name_lower in cat_name:
            return {"id": cat_id, "name": cat_name}
        if cat_slug.replace("-", " ") in name_lower:
            return {"id": cat_id, "name": cat_name}
    return None


def _match_our_region(city_name: str, our_regions: list[tuple[int, str]]) -> dict | None:
    """Try to match a site city to one of our regions."""
    name_lower = city_name.lower()
    for reg_id, reg_name in our_regions:
        if reg_name.lower() in name_lower or name_lower in reg_name.lower():
            return {"id": reg_id, "name": reg_name}
    return None


async def analyze_site_events(
    company_id: int, db: AsyncSession
) -> AsyncGenerator[dict, None]:
    """Analyze a competitor's website structure. Yields SSE event dicts."""

    company = await db.get(Company, company_id)
    if not company or not company.website:
        yield {"step": "error", "message": "Компания не найдена или нет сайта"}
        return

    base_url = f"https://{company.website}"
    wait_for = await get_setting_int(db, "firecrawl_wait_for", 2000)

    # Load our reference data
    cat_result = await db.execute(select(Category).order_by(Category.level.desc(), Category.name))
    our_categories = [(c.id, c.name.lower(), c.slug.lower()) for c in cat_result.scalars().all()]

    reg_result = await db.execute(select(Region).where(Region.is_active == True))
    our_regions = [(r.id, r.name) for r in reg_result.scalars().all()]

    # === Step 1: Scrape multiple pages for better coverage ===
    pages_to_try = [
        (base_url, "главная"),
        (f"{base_url}/catalog/", "каталог"),
        (f"{base_url}/katalog/", "каталог (2)"),
        (f"{base_url}/categories/", "категории"),
        (f"{base_url}/shop/", "магазин"),
    ]

    combined_text = ""
    for url, label in pages_to_try:
        yield {"step": "scraping", "message": f"Загрузка {label}: {url}..."}

        cache_key = f"{url}#site-analysis"
        page_text = await get_cached(db, cache_key, ttl_days=1)
        if page_text:
            yield {"step": "cache_hit", "message": f"{label}: из кэша ({len(page_text)} символов)"}
        else:
            page_text = await scrape_with_firecrawl(url, wait_for=wait_for)
            if page_text:
                await save_cache(db, cache_key, page_text)
                yield {"step": "scraped", "message": f"{label}: получено {len(page_text)} символов"}
            else:
                yield {"step": "scraped", "message": f"{label}: не удалось загрузить"}

        if page_text:
            combined_text += f"\n\n--- Страница: {url} ---\n\n{page_text}"

        # Stop if we have enough content
        if len(combined_text) > 20_000:
            break

    if not combined_text:
        yield {"step": "error", "message": "Не удалось загрузить ни одну страницу сайта"}
        return

    yield {"step": "scraped", "message": f"Итого: {len(combined_text)} символов со всех страниц"}

    # === Step 2: Discover categories ===
    yield {"step": "analyzing_categories", "message": "Анализ категорий через Claude AI..."}

    site_categories = await _call_claude(CATEGORY_PROMPT, combined_text)
    if not site_categories or not isinstance(site_categories, list) or len(site_categories) == 0:
        yield {"step": "error", "message": "Не удалось определить категории. Возможно сайт сильно защищён от парсинга."}
        return

    # Map to our categories
    mapped_categories = []
    for site_cat in site_categories:
        name = site_cat.get("name", "")
        url = site_cat.get("url", "")
        our_match = _match_our_category(name, our_categories)

        # Also try subcategories
        subcats = site_cat.get("subcategories", [])
        mapped_subcats = []
        for sub in subcats:
            sub_match = _match_our_category(sub.get("name", ""), our_categories)
            mapped_subcats.append({
                "site_name": sub.get("name"),
                "site_url": sub.get("url"),
                "our_category": sub_match,
            })

        mapped_categories.append({
            "site_name": name,
            "site_url": url,
            "our_category": our_match,
            "subcategories": mapped_subcats,
        })

        status = f"→ {our_match['name']}" if our_match else "(не сопоставлена)"
        yield {"step": "category_found", "message": f"{name} {status}", "data": mapped_categories[-1]}

    yield {
        "step": "categories_done",
        "message": f"Найдено {len(mapped_categories)} категорий",
        "categories": mapped_categories,
    }

    # === Step 3: Discover regions ===
    yield {"step": "analyzing_regions", "message": "Анализ регионов через Claude AI..."}

    region_info = await _call_claude(REGION_PROMPT, combined_text)
    if not region_info or not isinstance(region_info, dict):
        yield {"step": "regions_done", "message": "Не удалось определить регионы", "regions": {
            "has_region_selector": False, "method": "none", "key": None, "cities": [],
        }}
        return

    # Map cities to our regions
    mapped_cities = []
    for city in region_info.get("cities", []):
        city_name = city.get("name", "")
        our_match = _match_our_region(city_name, our_regions)
        mapped_cities.append({
            "site_name": city_name,
            "site_value": city.get("value"),
            "our_region": our_match,
        })

    yield {
        "step": "regions_done",
        "message": f"Метод: {region_info.get('method', 'none')}, городов: {len(mapped_cities)}",
        "regions": {
            "has_region_selector": region_info.get("has_region_selector", False),
            "method": region_info.get("method", "none"),
            "key": region_info.get("key"),
            "cities": mapped_cities,
            "notes": region_info.get("notes"),
        },
    }

    yield {"step": "complete", "message": "Анализ завершён"}
