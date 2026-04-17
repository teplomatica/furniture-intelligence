from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.category import Category, PriceSegment

router = APIRouter(prefix="/categories", tags=["categories"])


class PriceSegmentOut(BaseModel):
    id: int
    name: str
    price_min: Optional[int]
    price_max: Optional[int]
    sort_order: int
    model_config = {"from_attributes": True}


class CategoryOut(BaseModel):
    id: int
    parent_id: Optional[int]
    name: str
    slug: str
    level: int
    sort_order: int
    price_segments: list[PriceSegmentOut] = []
    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    parent_id: Optional[int] = None
    name: str
    slug: str
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    sort_order: Optional[int] = None


class PriceSegmentCreate(BaseModel):
    category_id: int
    name: str
    price_min: Optional[int] = None
    price_max: Optional[int] = None
    sort_order: int = 0


class PriceSegmentUpdate(BaseModel):
    name: Optional[str] = None
    price_min: Optional[int] = None
    price_max: Optional[int] = None
    sort_order: Optional[int] = None


@router.get("", response_model=list[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(Category)
        .options(selectinload(Category.price_segments))
        .order_by(Category.level, Category.sort_order, Category.name)
    )
    return result.scalars().all()


@router.post("", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    level = 1
    if body.parent_id:
        parent = await db.get(Category, body.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")
        level = parent.level + 1
    cat = Category(**body.model_dump(), level=level)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.post("/price-segments", response_model=PriceSegmentOut, status_code=201)
async def create_price_segment(body: PriceSegmentCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    seg = PriceSegment(**body.model_dump())
    db.add(seg)
    await db.commit()
    await db.refresh(seg)
    return seg


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(category_id: int, body: CategoryUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=204)
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(cat)
    await db.commit()


@router.patch("/price-segments/{seg_id}", response_model=PriceSegmentOut)
async def update_price_segment(seg_id: int, body: PriceSegmentUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    seg = await db.get(PriceSegment, seg_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Price segment not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(seg, field, value)
    await db.commit()
    await db.refresh(seg)
    return seg


@router.delete("/price-segments/{seg_id}", status_code=204)
async def delete_price_segment(seg_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    seg = await db.get(PriceSegment, seg_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Price segment not found")
    await db.delete(seg)
    await db.commit()
