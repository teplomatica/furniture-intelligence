"""Test endpoint: scrape a single URL and show raw + parsed results."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import require_editor
from app.models.user import User
from app.services.scrape_utils import scrape_with_firecrawl, scrape_with_http
from app.services.offer_parser import parse_offers
from app.services.app_settings import get_setting_int

router = APIRouter(prefix="/scrape-test", tags=["scrape_test"])


class ScrapeTestRequest(BaseModel):
    url: str
    extra_headers: Optional[dict] = None
    wait_for: Optional[int] = None


class ScrapeTestResponse(BaseModel):
    url: str
    method: str
    markdown_length: int
    markdown_preview: str  # first 5000 chars
    offers_found: int
    offers: list[dict]


@router.post("", response_model=ScrapeTestResponse)
async def test_scrape(
    body: ScrapeTestRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Scrape a single URL and return raw markdown + parsed offers. For debugging."""
    wait_for = body.wait_for or await get_setting_int(db, "firecrawl_wait_for", 2000)

    # Try Firecrawl first
    text = await scrape_with_firecrawl(body.url, body.extra_headers, wait_for)
    method = "firecrawl"

    if not text:
        text = await scrape_with_http(body.url)
        method = "http"

    if not text:
        raise HTTPException(status_code=502, detail="Could not fetch URL via Firecrawl or HTTP")

    # Parse offers
    offers = parse_offers(text, body.url)

    return ScrapeTestResponse(
        url=body.url,
        method=method,
        markdown_length=len(text),
        markdown_preview=text[:5000],
        offers_found=len(offers),
        offers=offers[:30],  # max 30 for preview
    )
