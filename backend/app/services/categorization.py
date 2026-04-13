"""Shared offer categorization logic: keyword matching + price segment lookup."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.category import Category, PriceSegment
from app.models.offer import Offer, CategorySource


async def load_category_keywords(db: AsyncSession) -> list[tuple[int, str, str]]:
    """Return list of (category_id, name_lower, slug_lower) for keyword matching."""
    result = await db.execute(
        select(Category).order_by(Category.level.desc(), Category.name)
    )
    return [(c.id, c.name.lower(), c.slug.lower()) for c in result.scalars().all()]


async def load_price_segments(db: AsyncSession) -> list[tuple[int, int, int | None, int | None]]:
    """Return list of (segment_id, category_id, price_min, price_max)."""
    result = await db.execute(select(PriceSegment).order_by(PriceSegment.sort_order))
    return [
        (s.id, s.category_id, s.price_min, s.price_max)
        for s in result.scalars().all()
    ]


def match_category(name: str, keywords: list[tuple[int, str, str]]) -> int | None:
    name_lower = name.lower()
    for cat_id, cat_name, cat_slug in keywords:
        if cat_name in name_lower or cat_slug.replace("-", " ") in name_lower:
            return cat_id
    return None


def match_segment(
    category_id: int | None, price: int | None,
    segments: list[tuple[int, int, int | None, int | None]]
) -> int | None:
    if category_id is None or price is None:
        return None
    for seg_id, seg_cat_id, seg_min, seg_max in segments:
        if seg_cat_id != category_id:
            continue
        min_ok = seg_min is None or price >= seg_min
        max_ok = seg_max is None or price <= seg_max
        if min_ok and max_ok:
            return seg_id
    return None


async def auto_categorize_offer(
    offer: Offer,
    keywords: list[tuple[int, str, str]],
    segments: list[tuple[int, int, int | None, int | None]],
):
    """Auto-assign category and segment if source is auto or unset."""
    if offer.category_source == CategorySource.manual and offer.category_id is not None:
        return

    cat_id = match_category(offer.name, keywords)
    if cat_id:
        offer.category_id = cat_id
        offer.category_source = CategorySource.auto

    seg_id = match_segment(offer.category_id, offer.price, segments)
    if seg_id and offer.segment_source != CategorySource.manual:
        offer.price_segment_id = seg_id
        offer.segment_source = CategorySource.auto
