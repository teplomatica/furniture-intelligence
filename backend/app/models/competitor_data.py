from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, Numeric, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class DataSource(str, PyEnum):
    datanewton = "datanewton"
    manual = "manual"
    scraper = "scraper"


class CompetitorFinancial(Base):
    __tablename__ = "fi_competitor_financials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    legal_entity_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_legal_entities.id"), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    revenue: Mapped[float | None] = mapped_column(Numeric(20, 2), nullable=True)        # тыс. руб.
    net_profit: Mapped[float | None] = mapped_column(Numeric(20, 2), nullable=True)     # тыс. руб.
    ebitda: Mapped[float | None] = mapped_column(Numeric(20, 2), nullable=True)         # тыс. руб.
    total_assets: Mapped[float | None] = mapped_column(Numeric(20, 2), nullable=True)   # тыс. руб.
    employee_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    source: Mapped[DataSource] = mapped_column(Enum(DataSource), default=DataSource.datanewton)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    legal_entity: Mapped["LegalEntity"] = relationship("LegalEntity", back_populates="financials")


class ChannelType(str, PyEnum):
    own_retail = "own_retail"
    online_store = "online_store"
    ozon = "ozon"
    wildberries = "wildberries"
    yandex_market = "yandex_market"
    franchise = "franchise"
    other = "other"


class CompetitorChannel(Base):
    __tablename__ = "fi_competitor_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=False)
    channel_type: Mapped[ChannelType] = mapped_column(Enum(ChannelType), nullable=False)
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source: Mapped[DataSource] = mapped_column(Enum(DataSource), default=DataSource.manual)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CompetitorTraffic(Base):
    __tablename__ = "fi_competitor_traffic"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)

    monthly_visits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bounce_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    avg_visit_duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pages_per_visit: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    source: Mapped[DataSource] = mapped_column(Enum(DataSource), default=DataSource.manual)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CompetitorAssortment(Base):
    __tablename__ = "fi_competitor_assortment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_categories.id"), nullable=False)
    price_segment_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("fi_price_segments.id"), nullable=True)

    sku_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    availability_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    price_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_median: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sample_products: Mapped[list | None] = mapped_column(JSON, nullable=True)

    source: Mapped[DataSource] = mapped_column(Enum(DataSource), default=DataSource.manual)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class JobStatus(str, PyEnum):
    pending = "pending"
    running = "running"
    success = "success"
    failed = "failed"


class CollectionJob(Base):
    __tablename__ = "fi_collection_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    company_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=True)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.pending)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
