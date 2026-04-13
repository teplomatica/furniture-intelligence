from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import (
    DateTime, Enum, ForeignKey, Integer, String, Text, JSON, Index, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.competitor_data import DataSource


class CategorySource(str, PyEnum):
    auto = "auto"
    manual = "manual"


class StockFilterMethod(str, PyEnum):
    visible = "visible"
    filter_required = "filter_required"
    unavailable = "unavailable"


class RegionMethod(str, PyEnum):
    cookie = "cookie"
    url_param = "url_param"
    subdomain = "subdomain"
    header = "header"
    none = "none"


class Offer(Base):
    __tablename__ = "fi_offers"
    __table_args__ = (
        Index("ix_offers_company_region", "company_id", "region_id"),
        Index("ix_offers_category", "category_id"),
        Index("ix_offers_collected", "collected_at"),
        UniqueConstraint("company_id", "region_id", "url", name="uq_offers_company_region_url"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=False)
    region_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_regions.id"), nullable=False)

    # Product data
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_old: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_available: Mapped[bool | None] = mapped_column(nullable=True)  # None = unknown
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    characteristics: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Categorization with source tracking
    category_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("fi_categories.id"), nullable=True)
    category_source: Mapped[CategorySource] = mapped_column(
        Enum(CategorySource), default=CategorySource.auto
    )
    price_segment_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("fi_price_segments.id"), nullable=True
    )
    segment_source: Mapped[CategorySource] = mapped_column(
        Enum(CategorySource), default=CategorySource.auto
    )

    # Metadata
    source: Mapped[DataSource] = mapped_column(Enum(DataSource), default=DataSource.manual)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    batch_id: Mapped[str | None] = mapped_column(String(50), nullable=True)


class LogField(str, PyEnum):
    category = "category"
    segment = "segment"


class OfferCategoryLog(Base):
    __tablename__ = "fi_offer_category_log"
    __table_args__ = (
        Index("ix_offer_log_offer_date", "offer_id", "changed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    offer_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_offers.id"), nullable=False)
    field: Mapped[LogField] = mapped_column(Enum(LogField), nullable=False)
    old_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[CategorySource] = mapped_column(Enum(CategorySource), nullable=False)
    changed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CompanyRegionConfig(Base):
    __tablename__ = "fi_company_region_config"
    __table_args__ = (
        UniqueConstraint("company_id", "region_id", name="uq_company_region"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=False)
    region_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_regions.id"), nullable=False)

    has_region_selector: Mapped[bool] = mapped_column(default=True)
    has_stock_filter: Mapped[bool] = mapped_column(default=True)
    stock_filter_method: Mapped[StockFilterMethod] = mapped_column(
        Enum(StockFilterMethod), default=StockFilterMethod.visible
    )
    region_method: Mapped[RegionMethod] = mapped_column(
        Enum(RegionMethod), default=RegionMethod.cookie
    )
    region_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    region_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    catalog_urls: Mapped[list | None] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
