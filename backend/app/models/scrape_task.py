from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ScrapeTaskStatus(str, PyEnum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"
    cancelled = "cancelled"


class ScrapeTask(Base):
    __tablename__ = "fi_scrape_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_companies.id"), nullable=False)
    retailer_category_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_retailer_categories.id"), nullable=False)
    region_id: Mapped[int] = mapped_column(Integer, ForeignKey("fi_regions.id"), nullable=False)

    celery_task_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[ScrapeTaskStatus] = mapped_column(Enum(ScrapeTaskStatus), default=ScrapeTaskStatus.queued)
    progress_current: Mapped[int] = mapped_column(Integer, default=0)
    progress_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    offers_created: Mapped[int] = mapped_column(Integer, default=0)
    offers_updated: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
