from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Category(Base):
    __tablename__ = "fi_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("fi_categories.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1)  # 1=топ, 2=подкатегория, 3=группа
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    parent: Mapped["Category | None"] = relationship("Category", remote_side="Category.id", back_populates="children")
    children: Mapped[list["Category"]] = relationship("Category", back_populates="parent")
    price_segments: Mapped[list["PriceSegment"]] = relationship("PriceSegment", back_populates="category")


class PriceSegment(Base):
    __tablename__ = "fi_price_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_categories.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # Бюджет / Средний / Премиум
    price_min: Mapped[int | None] = mapped_column(Integer, nullable=True)   # руб
    price_max: Mapped[int | None] = mapped_column(Integer, nullable=True)   # руб (None = без ограничения)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    category: Mapped["Category"] = relationship("Category", back_populates="price_segments")
