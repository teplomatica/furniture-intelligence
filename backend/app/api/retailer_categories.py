"""CRUD for retailer categories (per company catalog structure)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.company import Company
from app.models.retailer_category import RetailerCategory

router = APIRouter(tags=["retailer_categories"])


class RetailerCategoryOut(BaseModel):
    id: int
    company_id: int
    parent_id: Optional[int]
    name: str
    url: Optional[str]
    sort_order: int
    model_config = {"from_attributes": True}


class RetailerCategoryCreate(BaseModel):
    parent_id: Optional[int] = None
    name: str
    url: Optional[str] = None
    sort_order: int = 0


class RetailerCategoryUpdate(BaseModel):
    parent_id: Optional[int] = None
    name: Optional[str] = None
    url: Optional[str] = None
    sort_order: Optional[int] = None


@router.get("/companies/{company_id}/retailer-categories", response_model=list[RetailerCategoryOut])
async def list_retailer_categories(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RetailerCategory)
        .where(RetailerCategory.company_id == company_id)
        .order_by(RetailerCategory.parent_id.nullsfirst(), RetailerCategory.sort_order, RetailerCategory.name)
    )
    return result.scalars().all()


@router.post("/companies/{company_id}/retailer-categories", response_model=RetailerCategoryOut, status_code=201)
async def create_retailer_category(
    company_id: int,
    body: RetailerCategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    if not await db.get(Company, company_id):
        raise HTTPException(status_code=404, detail="Company not found")
    # Unique name within same parent
    dup = await db.execute(
        select(RetailerCategory).where(
            RetailerCategory.company_id == company_id,
            RetailerCategory.parent_id == body.parent_id,
            RetailerCategory.name == body.name,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Name already exists in this parent")
    rc = RetailerCategory(company_id=company_id, **body.model_dump())
    db.add(rc)
    await db.commit()
    await db.refresh(rc)
    return rc


@router.patch("/retailer-categories/{rc_id}", response_model=RetailerCategoryOut)
async def update_retailer_category(
    rc_id: int,
    body: RetailerCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    rc = await db.get(RetailerCategory, rc_id)
    if not rc:
        raise HTTPException(status_code=404, detail="Not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rc, field, value)
    await db.commit()
    await db.refresh(rc)
    return rc


@router.delete("/retailer-categories/{rc_id}", status_code=204)
async def delete_retailer_category(
    rc_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    rc = await db.get(RetailerCategory, rc_id)
    if not rc:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(rc)
    await db.commit()
