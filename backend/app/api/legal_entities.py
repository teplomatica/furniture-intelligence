import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.company import Company
from app.models.legal_entity import LegalEntity
from app.models.competitor_data import CompetitorFinancial, DataSource
from app.services.datanewton import datanewton

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/legal-entities", tags=["legal_entities"])


class LegalEntityOut(BaseModel):
    id: int
    company_id: int
    inn: Optional[str]
    ogrn: Optional[str]
    legal_name: str
    legal_form: Optional[str]
    address: Optional[str]
    region: Optional[str]
    founded_year: Optional[int]
    employee_count: Optional[int]
    manager_name: Optional[str]
    is_primary: bool

    model_config = {"from_attributes": True}


class LegalEntityCreate(BaseModel):
    company_id: int
    inn: Optional[str] = None
    ogrn: Optional[str] = None
    legal_name: str
    legal_form: Optional[str] = None
    is_primary: bool = False


class FinancialOut(BaseModel):
    id: int
    year: int
    revenue: Optional[float]
    net_profit: Optional[float]
    ebitda: Optional[float]
    total_assets: Optional[float]
    source: DataSource

    model_config = {"from_attributes": True}


@router.get("", response_model=list[LegalEntityOut])
async def list_legal_entities(
    company_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(LegalEntity).order_by(LegalEntity.company_id, LegalEntity.legal_name)
    if company_id:
        q = q.where(LegalEntity.company_id == company_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=LegalEntityOut, status_code=201)
async def create_legal_entity(body: LegalEntityCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    le = LegalEntity(**body.model_dump())
    db.add(le)
    await db.commit()
    await db.refresh(le)
    return le


@router.get("/{le_id}/financials", response_model=list[FinancialOut])
async def get_financials(le_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(CompetitorFinancial)
        .where(CompetitorFinancial.legal_entity_id == le_id)
        .order_by(CompetitorFinancial.year.desc())
    )
    return result.scalars().all()


@router.post("/{le_id}/sync-datanewton", response_model=dict)
async def sync_datanewton(le_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    """Подтянуть финансовые данные из DataNewton по ОГРН юрлица."""
    le = await db.get(LegalEntity, le_id)
    if not le:
        raise HTTPException(status_code=404, detail="Legal entity not found")
    if not le.ogrn:
        raise HTTPException(status_code=400, detail="OGRN is required for DataNewton sync")

    raw = await datanewton.get_finance(le.ogrn)
    if not raw:
        raise HTTPException(status_code=503, detail="DataNewton API unavailable or key not configured")

    financials = datanewton.parse_financials(raw)
    if not financials:
        return {"synced": 0, "message": "No financial data available (check DataNewton plan)"}

    for row in financials:
        existing = await db.execute(
            select(CompetitorFinancial).where(
                CompetitorFinancial.legal_entity_id == le_id,
                CompetitorFinancial.year == row["year"],
            )
        )
        fin = existing.scalar_one_or_none()
        if fin:
            fin.revenue = row["revenue"]
            fin.net_profit = row["net_profit"]
            fin.ebitda = row["ebitda"]
            fin.source = DataSource.datanewton
        else:
            db.add(CompetitorFinancial(legal_entity_id=le_id, source=DataSource.datanewton, **row))

    await db.commit()
    return {"synced": len(financials), "years": [r["year"] for r in financials]}


@router.get("/search/datanewton", response_model=list[dict])
async def search_datanewton(query: str, _: User = Depends(require_editor)):
    """Поиск юрлица в DataNewton по названию или ИНН."""
    results = await datanewton.search_counterparty(query, limit=10)
    return [datanewton.parse_counterparty(r) for r in results]


@router.post("/auto-discover", response_model=dict)
async def auto_discover_legal_entities(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Автопоиск юрлиц через DataNewton для всех конкурентов без привязанных ЮЛ."""
    # Компании у которых ещё нет юрлиц
    result = await db.execute(
        select(Company)
        .outerjoin(LegalEntity)
        .where(Company.is_active == True, LegalEntity.id == None)
        .order_by(Company.id)
    )
    companies_without_le = result.scalars().all()

    if not companies_without_le:
        return {"discovered": 0, "skipped": 0, "details": [], "message": "Все компании уже имеют юрлица"}

    discovered = 0
    skipped = 0
    details = []

    for company in companies_without_le:
        try:
            results = await datanewton.search_counterparty(company.name, limit=3)
            if not results:
                skipped += 1
                details.append({"company": company.name, "status": "not_found"})
                continue

            # Берём первый активный результат
            best = None
            for r in results:
                if r.get("active", False):
                    best = r
                    break
            if not best:
                best = results[0]

            parsed = datanewton.parse_counterparty(best)
            le = LegalEntity(
                company_id=company.id,
                inn=parsed["inn"],
                ogrn=parsed["ogrn"],
                legal_name=parsed["legal_name"] or company.name,
                address=parsed.get("address"),
                region=parsed.get("region"),
                manager_name=parsed.get("manager_name"),
                activity_code=parsed.get("activity_code"),
                activity_description=parsed.get("activity_description"),
                founded_year=parsed.get("founded_year"),
                datanewton_id=parsed.get("datanewton_id"),
                raw_data=parsed.get("raw_data"),
                is_primary=True,
            )
            db.add(le)
            discovered += 1
            details.append({"company": company.name, "status": "found", "legal_name": parsed["legal_name"], "inn": parsed["inn"]})

            # Пауза между запросами (rate limit 200/мин)
            await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(f"DataNewton error for {company.name}: {e}")
            skipped += 1
            details.append({"company": company.name, "status": "error", "error": str(e)})

    await db.commit()
    return {"discovered": discovered, "skipped": skipped, "details": details}
