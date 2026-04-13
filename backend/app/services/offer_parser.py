"""Parse product offers from scraped markdown using Claude API for extraction."""
import re
import json
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

# --- Pagination detection (still regex, simple enough) ---
NEXT_PAGE = re.compile(r'[?&]page=(\d+)')

EXTRACTION_PROMPT = """Извлеки все товарные предложения (офферы) из этого каталога мебели.

Верни ТОЛЬКО валидный JSON массив. Каждый элемент:
{
  "name": "полное название товара",
  "url": "ссылка на товар (абсолютная или относительная)",
  "price": цена в рублях (целое число) или null,
  "price_old": старая/зачеркнутая цена или null,
  "is_available": true/false/null (null если неизвестно),
  "sku": "артикул/код товара" или null,
  "image_url": "ссылка на изображение" или null
}

Правила:
- Извлекай ТОЛЬКО реальные товары (диваны, кровати, шкафы и т.д.)
- НЕ включай: цвета, фильтры, навигацию, категории, баннеры, акции
- Если один товар представлен в нескольких цветах — верни ОДИН оффер
- Цена должна быть числом в рублях (например 24990 из "24 990 ₽")
- Если цена указана как "от X ₽" — используй X
- URL должен вести на страницу конкретного товара
- Если данных о наличии нет — ставь null

Верни [] если товаров не найдено. Без пояснений, только JSON."""

# Max markdown to send to LLM (control cost)
MAX_MARKDOWN_FOR_LLM = 30_000  # ~7.5K tokens


async def _extract_with_llm(markdown: str, base_url: str) -> list[dict]:
    """Send markdown to Claude API and extract structured product data."""
    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set, falling back to empty results")
        return []

    # Truncate if too long
    text = markdown[:MAX_MARKDOWN_FOR_LLM]

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
                    "messages": [
                        {
                            "role": "user",
                            "content": f"{EXTRACTION_PROMPT}\n\n---\n\nBase URL: {base_url}\n\n{text}",
                        }
                    ],
                },
            )
            if r.status_code != 200:
                logger.error(f"Claude API error {r.status_code}: {r.text[:500]}")
                return []

            data = r.json()
            content = data.get("content", [{}])[0].get("text", "")

            # Parse JSON from response (handle markdown code blocks)
            content = content.strip()
            if content.startswith("```"):
                content = re.sub(r'^```(?:json)?\s*', '', content)
                content = re.sub(r'\s*```$', '', content)

            offers = json.loads(content)

            if not isinstance(offers, list):
                logger.error(f"Claude returned non-list: {type(offers)}")
                return []

            # Validate and clean
            cleaned = []
            for o in offers:
                if not isinstance(o, dict) or not o.get("name"):
                    continue
                # Resolve relative URLs
                url = o.get("url")
                if url and url.startswith("/"):
                    url = f"{base_url.rstrip('/')}{url}"
                cleaned.append({
                    "name": str(o.get("name", "")),
                    "url": url,
                    "price": _safe_int(o.get("price")),
                    "price_old": _safe_int(o.get("price_old")),
                    "is_available": o.get("is_available"),
                    "sku": o.get("sku"),
                    "image_url": o.get("image_url"),
                    "characteristics": None,
                })
            return cleaned

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Claude response as JSON: {e}")
        return []
    except Exception as e:
        logger.error(f"Claude API call failed: {e}")
        return []


def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        v = int(val)
        return v if 100 <= v <= 10_000_000 else None
    except (ValueError, TypeError):
        return None


def detect_has_next_page(markdown: str, current_page: int) -> bool:
    """Check if there's a next page link in the markdown."""
    for match in NEXT_PAGE.finditer(markdown):
        page_num = int(match.group(1))
        if page_num > current_page:
            return True
    if re.search(r'[Сс]ледующая|[Nn]ext\s*[→»>]', markdown):
        return True
    return False


async def parse_offers(markdown: str, base_url: str) -> list[dict]:
    """Extract product offers from markdown using LLM."""
    return await _extract_with_llm(markdown, base_url)
