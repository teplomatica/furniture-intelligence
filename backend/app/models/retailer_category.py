from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class RetailerCategory(Base):
    """Справочник категорий ритейлера per company (2-уровневая иерархия: раздел → подкатегория)."""
    __tablename__ = "fi_retailer_categories"
    __table_args__ = (
        UniqueConstraint("company_id", "parent_id", "name", name="uq_retailer_cat_parent_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id", ondelete="CASCADE"), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("fi_retailer_categories.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
