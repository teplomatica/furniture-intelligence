"""Dashboard API: aggregated financial data across companies."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.company import Company
from app.models.legal_entity import LegalEntity
from app.models.competitor_data import CompetitorFinancial

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class YearData(BaseModel):
    revenue: Optional[float] = None
    net_profit: Optional[float] = None
    ebitda: Optional[float] = None
    employee_count: Optional[int] = None


class CompanyFinancialSummary(BaseModel):
    company_id: int
    company_name: str
    slug: str
    segment_group: str
    is_self: bool
    years: dict[int, YearData]


@router.get("/financials", response_model=list[CompanyFinancialSummary])
async def get_financial_dashboard(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Aggregated financials per company per year (sum across legal entities)."""
    result = await db.execute(
        select(
            Company.id,
            Company.name,
            Company.slug,
            Company.segment_group,
            Company.is_self,
            CompetitorFinancial.year,
            func.sum(CompetitorFinancial.revenue).label("revenue"),
            func.sum(CompetitorFinancial.net_profit).label("net_profit"),
            func.sum(CompetitorFinancial.ebitda).label("ebitda"),
            func.sum(CompetitorFinancial.employee_count).label("employee_count"),
        )
        .join(LegalEntity, LegalEntity.company_id == Company.id)
        .join(CompetitorFinancial, CompetitorFinancial.legal_entity_id == LegalEntity.id)
        .where(Company.is_active == True)
        .group_by(Company.id, Company.name, Company.slug, Company.segment_group, Company.is_self, CompetitorFinancial.year)
        .order_by(Company.is_self.desc(), func.sum(CompetitorFinancial.revenue).desc())
    )
    rows = result.all()

    # Aggregate into per-company structure
    companies: dict[int, CompanyFinancialSummary] = {}
    for row in rows:
        cid = row[0]
        if cid not in companies:
            companies[cid] = CompanyFinancialSummary(
                company_id=cid,
                company_name=row[1],
                slug=row[2],
                segment_group=str(row[3].value) if hasattr(row[3], 'value') else str(row[3]),
                is_self=row[4] or False,
                years={},
            )
        companies[cid].years[row[5]] = YearData(
            revenue=float(row[6]) if row[6] else None,
            net_profit=float(row[7]) if row[7] else None,
            ebitda=float(row[8]) if row[8] else None,
            employee_count=int(row[9]) if row[9] else None,
        )

    # Sort: is_self first, then by latest year revenue desc
    result_list = list(companies.values())
    result_list.sort(key=lambda c: (
        not c.is_self,
        -(max((c.years.get(y, YearData()).revenue or 0) for y in c.years) if c.years else 0),
    ))
    return result_list
