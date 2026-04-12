from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class LegalEntity(Base):
    __tablename__ = "legal_entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), nullable=False)

    # Реквизиты
    inn: Mapped[str | None] = mapped_column(String(12), nullable=True, index=True)
    ogrn: Mapped[str | None] = mapped_column(String(15), nullable=True, index=True)
    legal_name: Mapped[str] = mapped_column(String(500), nullable=False)
    legal_form: Mapped[str | None] = mapped_column(String(50), nullable=True)  # ООО, АО, ПАО...
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Данные из DataNewton
    datanewton_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    founded_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    employee_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activity_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    activity_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    manager_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # сырой ответ DataNewton

    is_primary: Mapped[bool] = mapped_column(default=False)  # основное юрлицо компании
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company: Mapped["Company"] = relationship("Company", back_populates="legal_entities")
    financials: Mapped[list["CompetitorFinancial"]] = relationship("CompetitorFinancial", back_populates="legal_entity")
