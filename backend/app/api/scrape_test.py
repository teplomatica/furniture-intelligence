"""Test endpoint: scrape a single URL, extract with LLM, show categorized results via SSE."""
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import require_editor
from app.models.user import User
from app.services.scrape_utils import scrape_with_firecrawl, scrape_with_http
from app.services.offer_parser import parse_offers
from app.services.categorization import load_category_keywords, load_price_segments, match_category, match_segment
from app.services.app_settings import get_setting_int
from app.models.category import Category, PriceSegment
from sqlalchemy import select

router = APIRouter(prefix="/scrape-test", tags=["scrape_test"])


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


class ScrapeTestRequest(BaseModel):
    url: str
    extra_headers: Optional[dict] = None
    wait_for: Optional[int] = None


@router.post("")
async def test_scrape(
    body: ScrapeTestRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Scrape a single URL via SSE: fetch → extract → categorize."""

    async def stream():
        wait_for = body.wait_for or await get_setting_int(db, "firecrawl_wait_for", 2000)

        # Step 1: Fetch
        yield _sse({"step": "fetching", "message": "Загрузка страницы через Firecrawl..."})

        text = await scrape_with_firecrawl(body.url, body.extra_headers, wait_for)
        method = "firecrawl"

        if not text:
            yield _sse({"step": "fetching", "message": "Firecrawl не ответил, пробуем HTTP..."})
            text = await scrape_with_http(body.url)
            method = "http"

        if not text:
            yield _sse({"step": "error", "message": "Не удалось загрузить страницу"})
            return

        yield _sse({"step": "fetched", "message": f"Получено {len(text)} символов ({method})"})

        # Step 2: Extract with LLM
        yield _sse({"step": "extracting", "message": "Извлечение товаров через Claude AI..."})

        offers = await parse_offers(text, body.url)

        yield _sse({"step": "extracted", "message": f"Извлечено {len(offers)} товаров"})

        # Step 3: Categorize
        yield _sse({"step": "categorizing", "message": "Назначение категорий и сегментов..."})

        keywords = await load_category_keywords(db)
        segments = await load_price_segments(db)

        # Load category/segment names for display
        cat_result = await db.execute(select(Category))
        cat_names = {c.id: c.name for c in cat_result.scalars().all()}
        seg_result = await db.execute(select(PriceSegment))
        seg_names = {s.id: s.name for s in seg_result.scalars().all()}

        for offer in offers:
            cat_id = match_category(offer["name"], keywords)
            offer["category_id"] = cat_id
            offer["category_name"] = cat_names.get(cat_id) if cat_id else None

            seg_id = match_segment(cat_id, offer.get("price"), segments)
            offer["segment_id"] = seg_id
            offer["segment_name"] = seg_names.get(seg_id) if seg_id else None

        categorized = sum(1 for o in offers if o.get("category_id"))
        yield _sse({
            "step": "categorized",
            "message": f"Категоризировано: {categorized} из {len(offers)}",
        })

        # Final result
        yield _sse({
            "step": "done",
            "data": {
                "url": body.url,
                "method": method,
                "markdown_length": len(text),
                "markdown_preview": text[:5000],
                "offers_found": len(offers),
                "offers": offers[:30],
            },
        })

    return StreamingResponse(stream(), media_type="text/event-stream")
