import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.company import Company
from app.models.region import Region
from app.models.category import Category, PriceSegment
from app.models.offer import (
    Offer, OfferCategoryLog, CategorySource, LogField,
)
from app.models.competitor_data import DataSource

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/offers", tags=["offers"])


# --- Schemas ---

class OfferOut(BaseModel):
    id: int
    company_id: int
    region_id: int
    name: str
    url: Optional[str]
    sku: Optional[str]
    price: Optional[int]
    price_old: Optional[int]
    is_available: Optional[bool]
    image_url: Optional[str]
    characteristics: Optional[dict]
    category_id: Optional[int]
    category_source: CategorySource
    price_segment_id: Optional[int]
    segment_source: CategorySource
    source: DataSource
    collected_at: str
    batch_id: Optional[str]

    model_config = {"from_attributes": True}


class OfferListResponse(BaseModel):
    items: list[OfferOut]
    total: int


class OfferCreate(BaseModel):
    company_id: int
    region_id: int
    name: str
    url: Optional[str] = None
    sku: Optional[str] = None
    price: Optional[int] = None
    price_old: Optional[int] = None
    is_available: Optional[bool] = None
    image_url: Optional[str] = None
    characteristics: Optional[dict] = None
    category_id: Optional[int] = None
    source: DataSource = DataSource.manual


class OfferUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    sku: Optional[str] = None
    price: Optional[int] = None
    price_old: Optional[int] = None
    is_available: Optional[bool] = None
    image_url: Optional[str] = None
    characteristics: Optional[dict] = None
    category_id: Optional[int] = None
    price_segment_id: Optional[int] = None


class BulkOfferItem(BaseModel):
    name: str
    url: Optional[str] = None
    sku: Optional[str] = None
    price: Optional[int] = None
    price_old: Optional[int] = None
    is_available: Optional[bool] = None
    image_url: Optional[str] = None
    characteristics: Optional[dict] = None


class BulkOfferCreate(BaseModel):
    company_id: int
    region_id: int
    source: DataSource = DataSource.manual
    batch_id: Optional[str] = None
    offers: list[BulkOfferItem]


class BulkUpdateRequest(BaseModel):
    offer_ids: list[int]
    category_id: Optional[int] = None
    price_segment_id: Optional[int] = None


class RecategorizeRequest(BaseModel):
    company_id: Optional[int] = None
    region_id: Optional[int] = None


# --- Auto-categorization helpers ---

async def _load_category_keywords(db: AsyncSession) -> list[tuple[int, str, str]]:
    """Return list of (category_id, name, slug) for keyword matching."""
    result = await db.execute(
        select(Category).order_by(Category.level.desc(), Category.name)
    )
    return [(c.id, c.name.lower(), c.slug.lower()) for c in result.scalars().all()]


async def _load_price_segments(db: AsyncSession) -> list[tuple[int, int, int | None, int | None]]:
    """Return list of (segment_id, category_id, price_min, price_max)."""
    result = await db.execute(select(PriceSegment).order_by(PriceSegment.sort_order))
    return [
        (s.id, s.category_id, s.price_min, s.price_max)
        for s in result.scalars().all()
    ]


def _match_category(name: str, keywords: list[tuple[int, str, str]]) -> int | None:
    name_lower = name.lower()
    for cat_id, cat_name, cat_slug in keywords:
        # Match category name or slug in offer name
        if cat_name in name_lower or cat_slug.replace("-", " ") in name_lower:
            return cat_id
    return None


def _match_segment(
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


async def _auto_categorize_offer(
    offer: Offer,
    keywords: list[tuple[int, str, str]],
    segments: list[tuple[int, int, int | None, int | None]],
):
    """Auto-assign category and segment if source is auto or unset."""
    if offer.category_source == CategorySource.manual and offer.category_id is not None:
        return  # Don't touch manual assignments

    cat_id = _match_category(offer.name, keywords)
    if cat_id:
        offer.category_id = cat_id
        offer.category_source = CategorySource.auto

    seg_id = _match_segment(offer.category_id, offer.price, segments)
    if seg_id and offer.segment_source != CategorySource.manual:
        offer.price_segment_id = seg_id
        offer.segment_source = CategorySource.auto


def _log_change(
    offer_id: int, field: LogField, old_val: int | None, new_val: int | None,
    source: CategorySource, changed_by: str | None = None,
) -> OfferCategoryLog | None:
    if old_val == new_val:
        return None
    return OfferCategoryLog(
        offer_id=offer_id,
        field=field,
        old_value=old_val,
        new_value=new_val,
        source=source,
        changed_by=changed_by,
    )


# --- Endpoints ---

@router.get("", response_model=OfferListResponse)
async def list_offers(
    company_id: Optional[int] = None,
    region_id: Optional[int] = None,
    category_id: Optional[int] = None,
    uncategorized_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Offer)
    count_q = select(func.count(Offer.id))

    if company_id:
        q = q.where(Offer.company_id == company_id)
        count_q = count_q.where(Offer.company_id == company_id)
    if region_id:
        q = q.where(Offer.region_id == region_id)
        count_q = count_q.where(Offer.region_id == region_id)
    if category_id:
        q = q.where(Offer.category_id == category_id)
        count_q = count_q.where(Offer.category_id == category_id)
    if uncategorized_only:
        q = q.where(Offer.category_id == None)
        count_q = count_q.where(Offer.category_id == None)

    total = (await db.execute(count_q)).scalar() or 0
    q = q.order_by(Offer.collected_at.desc()).offset(offset).limit(limit)
    result = await db.execute(q)
    return OfferListResponse(items=result.scalars().all(), total=total)


@router.post("", response_model=OfferOut, status_code=201)
async def create_offer(
    body: OfferCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    # Validate references
    if not await db.get(Company, body.company_id):
        raise HTTPException(status_code=404, detail="Company not found")
    if not await db.get(Region, body.region_id):
        raise HTTPException(status_code=404, detail="Region not found")

    offer = Offer(**body.model_dump())

    # Auto-categorize if no manual category given
    if body.category_id:
        offer.category_source = CategorySource.manual
    else:
        keywords = await _load_category_keywords(db)
        segments = await _load_price_segments(db)
        await _auto_categorize_offer(offer, keywords, segments)

    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    return offer


@router.post("/bulk", response_model=dict)
async def create_offers_bulk(
    body: BulkOfferCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    if not await db.get(Company, body.company_id):
        raise HTTPException(status_code=404, detail="Company not found")
    if not await db.get(Region, body.region_id):
        raise HTTPException(status_code=404, detail="Region not found")

    keywords = await _load_category_keywords(db)
    segments = await _load_price_segments(db)

    created = 0
    updated = 0
    skipped = 0

    for item in body.offers:
        # Check for existing offer by URL (upsert)
        existing_offer = None
        if item.url:
            result = await db.execute(
                select(Offer).where(
                    Offer.company_id == body.company_id,
                    Offer.region_id == body.region_id,
                    Offer.url == item.url,
                )
            )
            existing_offer = result.scalar_one_or_none()

        if existing_offer:
            # Update price/availability but preserve manual categorization
            existing_offer.name = item.name
            existing_offer.price = item.price
            existing_offer.price_old = item.price_old
            existing_offer.is_available = item.is_available
            existing_offer.characteristics = item.characteristics
            existing_offer.sku = item.sku
            existing_offer.image_url = item.image_url
            existing_offer.batch_id = body.batch_id

            # Re-categorize only if source is auto
            if existing_offer.category_source == CategorySource.auto:
                await _auto_categorize_offer(existing_offer, keywords, segments)

            updated += 1
        else:
            offer = Offer(
                company_id=body.company_id,
                region_id=body.region_id,
                source=body.source,
                batch_id=body.batch_id,
                **item.model_dump(),
            )
            await _auto_categorize_offer(offer, keywords, segments)
            db.add(offer)
            created += 1

    await db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}


@router.patch("/{offer_id}", response_model=OfferOut)
async def update_offer(
    offer_id: int,
    body: OfferUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_editor),
):
    offer = await db.get(Offer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    data = body.model_dump(exclude_none=True)

    # Log category/segment changes
    if "category_id" in data and data["category_id"] != offer.category_id:
        log = _log_change(offer.id, LogField.category, offer.category_id, data["category_id"],
                          CategorySource.manual, user.email)
        if log:
            db.add(log)
        offer.category_source = CategorySource.manual

    if "price_segment_id" in data and data["price_segment_id"] != offer.price_segment_id:
        log = _log_change(offer.id, LogField.segment, offer.price_segment_id, data["price_segment_id"],
                          CategorySource.manual, user.email)
        if log:
            db.add(log)
        offer.segment_source = CategorySource.manual

    for field, value in data.items():
        setattr(offer, field, value)

    await db.commit()
    await db.refresh(offer)
    return offer


@router.patch("/bulk-update", response_model=dict)
async def bulk_update_offers(
    body: BulkUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_editor),
):
    if not body.offer_ids:
        raise HTTPException(status_code=400, detail="No offer_ids provided")

    updated = 0
    for oid in body.offer_ids:
        offer = await db.get(Offer, oid)
        if not offer:
            continue

        if body.category_id is not None and body.category_id != offer.category_id:
            log = _log_change(offer.id, LogField.category, offer.category_id, body.category_id,
                              CategorySource.manual, user.email)
            if log:
                db.add(log)
            offer.category_id = body.category_id
            offer.category_source = CategorySource.manual

        if body.price_segment_id is not None and body.price_segment_id != offer.price_segment_id:
            log = _log_change(offer.id, LogField.segment, offer.price_segment_id, body.price_segment_id,
                              CategorySource.manual, user.email)
            if log:
                db.add(log)
            offer.price_segment_id = body.price_segment_id
            offer.segment_source = CategorySource.manual

        updated += 1

    await db.commit()
    return {"updated": updated}


@router.delete("/{offer_id}", status_code=204)
async def delete_offer(
    offer_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    offer = await db.get(Offer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    await db.delete(offer)
    await db.commit()


@router.post("/recategorize", response_model=dict)
async def recategorize_offers(
    body: RecategorizeRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Re-run auto-categorization for offers with category_source=auto only."""
    q = select(Offer).where(Offer.category_source == CategorySource.auto)
    if body.company_id:
        q = q.where(Offer.company_id == body.company_id)
    if body.region_id:
        q = q.where(Offer.region_id == body.region_id)

    result = await db.execute(q)
    offers = result.scalars().all()

    keywords = await _load_category_keywords(db)
    segments = await _load_price_segments(db)

    categorized = 0
    for offer in offers:
        old_cat = offer.category_id
        old_seg = offer.price_segment_id
        await _auto_categorize_offer(offer, keywords, segments)
        if offer.category_id != old_cat or offer.price_segment_id != old_seg:
            categorized += 1

    await db.commit()
    return {"processed": len(offers), "categorized": categorized}
