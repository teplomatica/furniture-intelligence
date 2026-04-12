from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class SegmentGroup(str, PyEnum):
    federal = "federal"      # А: крупные федеральные сети
    online = "online"        # Б: онлайн-ритейлеры
    premium = "premium"      # В: премиум-сегмент
    marketplace = "marketplace"  # Г: маркетплейсы


class Positioning(str, PyEnum):
    budget = "budget"
    mid = "mid"
    premium = "premium"


class Company(Base):
    __tablename__ = "fi_companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    segment_group: Mapped[SegmentGroup] = mapped_column(Enum(SegmentGroup), nullable=False)
    positioning: Mapped[Positioning | None] = mapped_column(Enum(Positioning), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    legal_entities: Mapped[list["LegalEntity"]] = relationship("LegalEntity", back_populates="company")
