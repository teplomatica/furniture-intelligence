import asyncio
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
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
from app.services.legal_scraper import scrape_legal_info

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


@router.delete("/{le_id}", status_code=204)
async def delete_legal_entity(le_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_editor)):
    le = await db.get(LegalEntity, le_id)
    if not le:
        raise HTTPException(status_code=404, detail="Legal entity not found")
    await db.delete(le)
    await db.commit()


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


@router.post("/discover/{company_id}")
async def discover_for_company(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Автопоиск юрлица через сайт + DataNewton. Стримит шаги через SSE."""

    async def event_stream():
        def send(step: str, data: dict | None = None):
            payload = {"step": step}
            if data:
                payload.update(data)
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        company = await db.get(Company, company_id)
        if not company:
            yield send("error", {"message": "Компания не найдена"})
            return

        existing = await db.execute(
            select(LegalEntity).where(LegalEntity.company_id == company_id)
        )
        if existing.scalars().first():
            yield send("skipped", {"message": "Юрлица уже есть"})
            return

        yield send("scraping", {"message": f"Парсим сайт {company.website}..."})

        try:
            scraped = await scrape_legal_info(company.website, db)

            if scraped.inn or scraped.ogrn:
                yield send("scraped", {
                    "message": f"Найден ИНН: {scraped.inn or '—'}, ОГРН: {scraped.ogrn or '—'}",
                    "source_url": scraped.source_url,
                    "method": scraped.method,
                    "api_calls": scraped.api_calls,
                    "cache_hits": scraped.cache_hits,
                })
            else:
                yield send("scraped", {
                    "message": "ИНН/ОГРН не найдены на сайте, ищем по названию",
                    "api_calls": scraped.api_calls,
                    "cache_hits": scraped.cache_hits,
                })

            search_query = scraped.inn or scraped.ogrn
            if not search_query and scraped.legal_names:
                search_query = scraped.legal_names[0]
            if not search_query:
                search_query = company.name

            yield send("searching", {"message": f"Ищем в DataNewton: {search_query}"})

            dn_results = await datanewton.search_counterparty(search_query, limit=5)
            if not dn_results:
                yield send("not_found", {"message": "Не найдено в DataNewton"})
                return

            best = None
            if scraped.inn:
                for r in dn_results:
                    if r.get("inn") == scraped.inn and r.get("active", False):
                        best = r
                        break
            if not best:
                for r in dn_results:
                    if r.get("active", False):
                        best = r
                        break
            if not best:
                best = dn_results[0]

            parsed = datanewton.parse_counterparty(best)

            yield send("saving", {"message": f"Сохраняем: {parsed['legal_name']} (ИНН: {parsed['inn']})"})

            dup_check = await db.execute(
                select(LegalEntity).where(LegalEntity.company_id == company_id)
            )
            if dup_check.scalars().first():
                yield send("skipped", {"message": "Юрлицо уже добавлено"})
                return

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
            await db.commit()

            yield send("done", {
                "message": f"Найден: {parsed['legal_name']}",
                "legal_name": parsed["legal_name"],
                "inn": parsed["inn"],
            })

        except Exception as e:
            logger.error(f"Discover error for {company.name}: {e}")
            yield send("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
    """Автопоиск юрлиц: парсим сайты конкурентов → ищем ИНН/ОГРН → подтягиваем из DataNewton."""
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
            detail = {"company": company.name, "website": company.website}

            # Шаг 1: парсим сайт конкурента в поисках ИНН/ОГРН
            scraped = await scrape_legal_info(company.website, db)
            detail["scraped_inn"] = scraped.inn
            detail["scraped_ogrn"] = scraped.ogrn
            detail["scraped_names"] = scraped.legal_names

            # Шаг 2: ищем в DataNewton по ИНН (приоритет) или ОГРН или названию с сайта
            search_query = scraped.inn or scraped.ogrn
            if not search_query and scraped.legal_names:
                search_query = scraped.legal_names[0]
            if not search_query:
                search_query = company.name

            dn_results = await datanewton.search_counterparty(search_query, limit=3)

            if not dn_results:
                skipped += 1
                detail["status"] = "not_found"
                details.append(detail)
                continue

            # Если у нас есть ИНН с сайта — ищем точное совпадение
            best = None
            if scraped.inn:
                for r in dn_results:
                    if r.get("inn") == scraped.inn and r.get("active", False):
                        best = r
                        break
            if not best:
                for r in dn_results:
                    if r.get("active", False):
                        best = r
                        break
            if not best:
                best = dn_results[0]

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
            detail["status"] = "found"
            detail["legal_name"] = parsed["legal_name"]
            detail["inn"] = parsed["inn"]
            detail["method"] = "inn_from_site" if scraped.inn else "name_search"
            details.append(detail)

            await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(f"Auto-discover error for {company.name}: {e}")
            skipped += 1
            details.append({"company": company.name, "status": "error", "error": str(e)})

    await db.commit()
    return {"discovered": discovered, "skipped": skipped, "details": details}
