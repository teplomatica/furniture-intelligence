"""Company-level mapping tables: categories, regions, scrape matrix."""
from sqlalchemy import (
    Enum, ForeignKey, Integer, String, UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.offer import RegionMethod


class CompanyCategoryMapping(Base):
    """Maps our category to retailer's category URL(s)."""
    __tablename__ = "fi_company_category_mapping"
    __table_args__ = (
        UniqueConstraint("company_id", "category_id", "retailer_url", name="uq_company_cat_url"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_categories.id"), nullable=False)
    retailer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    retailer_url: Mapped[str] = mapped_column(String(1000), nullable=False)


class CompanyRegionMapping(Base):
    """Maps our region to retailer's region params."""
    __tablename__ = "fi_company_region_mapping"
    __table_args__ = (
        UniqueConstraint("company_id", "region_id", name="uq_company_region_map"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=False)
    region_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_regions.id"), nullable=False)
    region_method: Mapped[RegionMethod] = mapped_column(Enum(RegionMethod), default=RegionMethod.none)
    region_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    region_value: Mapped[str | None] = mapped_column(String(255), nullable=True)


class CompanyScrapeMatrix(Base):
    """Category × Region matrix: which combinations to scrape."""
    __tablename__ = "fi_company_scrape_matrix"
    __table_args__ = (
        UniqueConstraint("company_id", "category_id", "region_id", name="uq_scrape_matrix"),
        Index("ix_scrape_matrix_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_categories.id"), nullable=False)
    region_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_regions.id"), nullable=False)
    enabled: Mapped[bool] = mapped_column(default=True)
