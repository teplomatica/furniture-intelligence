import json
import logging
from typing import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.legal_entity import LegalEntity
from app.models.competitor_data import CompetitorFinancial, DataSource
from app.services.datanewton import datanewton
from app.services.legal_scraper import scrape_legal_info, scrape_legal_info_streaming

logger = logging.getLogger(__name__)


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


async def discover_legal_entity_events(
    company_id: int, db: AsyncSession
) -> AsyncGenerator[dict, None]:
    """Yield step dicts for legal entity discovery (scrape + DataNewton)."""
    company = await db.get(Company, company_id)
    if not company:
        yield {"step": "error", "message": "Компания не найдена"}
        return

    existing = await db.execute(
        select(LegalEntity).where(LegalEntity.company_id == company_id)
    )
    if existing.scalars().first():
        yield {"step": "skipped", "message": "Юрлица уже есть"}
        return

    yield {"step": "scraping", "message": f"Парсим сайт {company.website}..."}

    try:
        # Stream scraping progress
        scraped_inn = None
        scraped_ogrn = None
        scraped_names = []
        async for scrape_event in scrape_legal_info_streaming(company.website, db):
            yield scrape_event
            if scrape_event.get("inn"):
                scraped_inn = scrape_event["inn"]
            if scrape_event.get("ogrn"):
                scraped_ogrn = scrape_event["ogrn"]
            if scrape_event.get("legal_names"):
                scraped_names = scrape_event["legal_names"]

        search_query = scraped_inn or scraped_ogrn
        if not search_query and scraped_names:
            search_query = scraped_names[0]
        if not search_query:
            search_query = company.name

        yield {"step": "searching", "message": f"Ищем в DataNewton: {search_query}"}

        dn_results = await datanewton.search_counterparty(search_query, limit=5)
        if not dn_results:
            yield {"step": "not_found", "message": "Не найдено в DataNewton"}
            return

        best = None
        if scraped_inn:
            for r in dn_results:
                if r.get("inn") == scraped_inn and r.get("active", False):
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

        yield {"step": "saving", "message": f"Сохраняем: {parsed['legal_name']} (ИНН: {parsed['inn']})"}

        # Race condition check
        dup_check = await db.execute(
            select(LegalEntity).where(LegalEntity.company_id == company_id)
        )
        if dup_check.scalars().first():
            yield {"step": "skipped", "message": "Юрлицо уже добавлено"}
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

        yield {
            "step": "done",
            "message": f"Найден: {parsed['legal_name']}",
            "legal_name": parsed["legal_name"],
            "inn": parsed["inn"],
        }

    except Exception as e:
        logger.error(f"Discover error for {company.name}: {e}")
        yield {"step": "error", "message": str(e)}


async def sync_financials_events(
    company_id: int, db: AsyncSession
) -> AsyncGenerator[dict, None]:
    """Yield step dicts for syncing financials from DataNewton for all legal entities."""
    result = await db.execute(
        select(LegalEntity).where(LegalEntity.company_id == company_id)
    )
    entities = result.scalars().all()

    if not entities:
        yield {"step": "skipped", "message": "Нет юрлиц — сначала найдите юрлица"}
        return

    synced_total = 0

    for le in entities:
        if not le.ogrn:
            yield {"step": "skipped", "message": f"{le.legal_name}: нет ОГРН, пропускаем"}
            continue

        yield {"step": "fetching", "message": f"Получаем финансы: {le.legal_name}..."}

        try:
            raw = await datanewton.get_finance(le.ogrn)
            if not raw:
                yield {"step": "error", "message": f"{le.legal_name}: DataNewton API недоступен"}
                continue

            financials = datanewton.parse_financials(raw)
            if not financials:
                yield {"step": "skipped", "message": f"{le.legal_name}: нет финансовых данных (проверьте план DataNewton)"}
                continue

            count = 0
            for row in financials:
                existing = await db.execute(
                    select(CompetitorFinancial).where(
                        CompetitorFinancial.legal_entity_id == le.id,
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
                    db.add(CompetitorFinancial(
                        legal_entity_id=le.id,
                        source=DataSource.datanewton,
                        **row,
                    ))
                count += 1

            await db.commit()
            synced_total += count
            yield {
                "step": "done",
                "message": f"{le.legal_name}: синхронизировано {count} записей",
                "synced": count,
                "years": [r["year"] for r in financials],
            }

        except Exception as e:
            logger.error(f"Financial sync error for {le.legal_name}: {e}")
            yield {"step": "error", "message": f"{le.legal_name}: {str(e)}"}

    yield {"step": "complete", "message": f"Итого синхронизировано: {synced_total} записей"}


async def refresh_company_stream(
    company_id: int, sections: list[str], db: AsyncSession,
    region_id: int | None = None,
) -> AsyncGenerator[str, None]:
    """Orchestrate multi-section refresh, yielding SSE-formatted strings."""
    if "legal_entities" in sections:
        yield _sse({"section": "legal_entities", "step": "start", "message": "Поиск юрлиц..."})
        async for event in discover_legal_entity_events(company_id, db):
            yield _sse({"section": "legal_entities", **event})

    if "financials" in sections:
        yield _sse({"section": "financials", "step": "start", "message": "Синхронизация финансов..."})
        async for event in sync_financials_events(company_id, db):
            yield _sse({"section": "financials", **event})

    if "traffic" in sections:
        yield _sse({"section": "traffic", "step": "skipped", "message": "Автоматический сбор трафика пока не поддерживается"})

    if "assortment" in sections:
        yield _sse({"section": "assortment", "step": "skipped", "message": "Автоматический сбор ассортимента пока не поддерживается"})

    if "offers" in sections:
        from app.services.offer_scraper import scrape_offers_events
        yield _sse({"section": "offers", "step": "start", "message": "Сбор офферов..."})
        async for event in scrape_offers_events(company_id, region_id, db):
            yield _sse({"section": "offers", **event})

    yield _sse({"section": "all", "step": "complete", "message": "Обновление завершено"})
