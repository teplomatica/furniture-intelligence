from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.channel import Channel, PositioningRef

router = APIRouter(tags=["channels"])


# --- Channel schemas ---

class ChannelOut(BaseModel):
    id: int
    name: str
    slug: str
    sort_order: int
    is_active: bool
    model_config = {"from_attributes": True}


class ChannelCreate(BaseModel):
    name: str
    slug: str
    sort_order: int = 0


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


# --- Positioning schemas ---

class PositioningOut(BaseModel):
    id: int
    name: str
    slug: str
    sort_order: int
    is_active: bool
    model_config = {"from_attributes": True}


class PositioningCreate(BaseModel):
    name: str
    slug: str
    sort_order: int = 0


class PositioningUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


# --- Channel endpoints ---

@router.get("/channels", response_model=list[ChannelOut])
async def list_channels(active_only: bool = True, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    q = select(Channel).order_by(Channel.sort_order, Channel.name)
    if active_only:
        q = q.where(Channel.is_active == True)
    return (await db.execute(q)).scalars().all()


@router.post("/channels", response_model=ChannelOut, status_code=201)
async def create_channel(body: ChannelCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    existing = await db.execute(select(Channel).where(Channel.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Slug already exists")
    ch = Channel(**body.model_dump())
    db.add(ch)
    await db.commit()
    await db.refresh(ch)
    return ch


@router.patch("/channels/{channel_id}", response_model=ChannelOut)
async def update_channel(channel_id: int, body: ChannelUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(ch, field, value)
    await db.commit()
    await db.refresh(ch)
    return ch


@router.delete("/channels/{channel_id}", status_code=204)
async def delete_channel(channel_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    ch = await db.get(Channel, channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    ch.is_active = False
    await db.commit()


# --- Positioning endpoints ---

@router.get("/positionings", response_model=list[PositioningOut])
async def list_positionings(active_only: bool = True, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    q = select(PositioningRef).order_by(PositioningRef.sort_order, PositioningRef.name)
    if active_only:
        q = q.where(PositioningRef.is_active == True)
    return (await db.execute(q)).scalars().all()


@router.post("/positionings", response_model=PositioningOut, status_code=201)
async def create_positioning(body: PositioningCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    existing = await db.execute(select(PositioningRef).where(PositioningRef.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Slug already exists")
    pos = PositioningRef(**body.model_dump())
    db.add(pos)
    await db.commit()
    await db.refresh(pos)
    return pos


@router.patch("/positionings/{pos_id}", response_model=PositioningOut)
async def update_positioning(pos_id: int, body: PositioningUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    pos = await db.get(PositioningRef, pos_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Positioning not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(pos, field, value)
    await db.commit()
    await db.refresh(pos)
    return pos


@router.delete("/positionings/{pos_id}", status_code=204)
async def delete_positioning(pos_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    pos = await db.get(PositioningRef, pos_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Positioning not found")
    pos.is_active = False
    await db.commit()
