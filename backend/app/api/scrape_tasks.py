"""API for scrape tasks (Celery-backed queue)."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user, require_editor
from app.models.user import User
from app.models.company import Company
from app.models.scrape_task import ScrapeTask, ScrapeTaskStatus
from app.models.company_mapping import CompanyScrapeMatrix
from app.models.retailer_category import RetailerCategory
from app.models.region import Region
from app.core.celery_app import celery_app

router = APIRouter(tags=["scrape_tasks"])


class ScrapeTaskOut(BaseModel):
    id: int
    company_id: int
    retailer_category_id: int
    region_id: int
    status: ScrapeTaskStatus
    progress_current: int
    progress_total: Optional[int]
    offers_created: int
    offers_updated: int
    error_message: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    retailer_category_name: Optional[str] = None
    region_name: Optional[str] = None
    model_config = {"from_attributes": True}


@router.post("/companies/{company_id}/scrape-tasks/start", response_model=dict)
async def start_scrape_tasks(
    company_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    """Create tasks from enabled matrix cells and queue them in Celery."""
    from app.models.company_mapping import CompanyCategoryMapping

    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # All enabled matrix cells
    result = await db.execute(
        select(CompanyScrapeMatrix).where(
            CompanyScrapeMatrix.company_id == company_id,
            CompanyScrapeMatrix.enabled == True,
        )
    )
    cells = result.scalars().all()

    if not cells:
        raise HTTPException(status_code=400, detail="Нет активных ячеек в матрице парсинга")

    # Backfill retailer_category_id for legacy cells using category mapping URLs
    from app.models.retailer_category import RetailerCategory
    backfilled = 0
    for cell in cells:
        if cell.retailer_category_id:
            continue
        if not cell.category_id:
            continue
        # Find mapping with URL for this company+our_category
        map_res = await db.execute(
            select(CompanyCategoryMapping).where(
                CompanyCategoryMapping.company_id == company_id,
                CompanyCategoryMapping.category_id == cell.category_id,
            )
        )
        mapping = map_res.scalar_one_or_none()
        if not mapping or not mapping.retailer_url:
            continue
        # Find or create retailer_category for this URL
        name = mapping.retailer_name or mapping.retailer_url.rstrip("/").split("/")[-1] or "Без названия"
        rc_res = await db.execute(
            select(RetailerCategory).where(
                RetailerCategory.company_id == company_id,
                RetailerCategory.url == mapping.retailer_url,
            )
        )
        rc = rc_res.scalar_one_or_none()
        if not rc:
            rc = RetailerCategory(company_id=company_id, name=name, url=mapping.retailer_url)
            db.add(rc)
            await db.flush()
        cell.retailer_category_id = rc.id
        if not mapping.retailer_category_id:
            mapping.retailer_category_id = rc.id
        backfilled += 1
    if backfilled:
        await db.commit()

    from app.services.celery_tasks import scrape_offers_task

    created = 0
    skipped = 0
    for cell in cells:
        if not cell.retailer_category_id:
            skipped += 1
            continue
        task = ScrapeTask(
            company_id=company_id,
            retailer_category_id=cell.retailer_category_id,
            region_id=cell.region_id,
            status=ScrapeTaskStatus.queued,
        )
        db.add(task)
        await db.flush()
        celery_result = scrape_offers_task.delay(task.id)
        task.celery_task_id = celery_result.id
        created += 1

    await db.commit()

    if created == 0:
        raise HTTPException(
            status_code=400,
            detail=f"Не удалось создать задачи. Ячеек: {len(cells)}, пропущено: {skipped}. Убедитесь что для категорий указаны URL."
        )
    return {"created": created, "skipped": skipped, "backfilled": backfilled}


@router.get("/companies/{company_id}/scrape-tasks", response_model=list[ScrapeTaskOut])
async def list_scrape_tasks(
    company_id: int,
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(ScrapeTask).where(ScrapeTask.company_id == company_id)
    if active_only:
        q = q.where(ScrapeTask.status.in_([ScrapeTaskStatus.queued, ScrapeTaskStatus.running]))
    q = q.order_by(ScrapeTask.created_at.desc()).limit(100)
    result = await db.execute(q)
    tasks = result.scalars().all()

    # Enrich with names
    rc_ids = {t.retailer_category_id for t in tasks}
    reg_ids = {t.region_id for t in tasks}
    rcs = {rc.id: rc for rc in (await db.execute(select(RetailerCategory).where(RetailerCategory.id.in_(rc_ids)))).scalars().all()} if rc_ids else {}
    regs = {r.id: r for r in (await db.execute(select(Region).where(Region.id.in_(reg_ids)))).scalars().all()} if reg_ids else {}

    out = []
    for t in tasks:
        item = ScrapeTaskOut.model_validate(t)
        item.retailer_category_name = rcs.get(t.retailer_category_id).name if rcs.get(t.retailer_category_id) else None
        item.region_name = regs.get(t.region_id).name if regs.get(t.region_id) else None
        out.append(item)
    return out


@router.post("/scrape-tasks/{task_id}/cancel", status_code=204)
async def cancel_scrape_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    task = await db.get(ScrapeTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Not found")
    if task.status in (ScrapeTaskStatus.done, ScrapeTaskStatus.cancelled, ScrapeTaskStatus.failed):
        return
    if task.celery_task_id:
        celery_app.control.revoke(task.celery_task_id, terminate=False)
    task.status = ScrapeTaskStatus.cancelled
    task.finished_at = datetime.utcnow()
    await db.commit()


@router.post("/scrape-tasks/{task_id}/retry", response_model=ScrapeTaskOut)
async def retry_scrape_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    old = await db.get(ScrapeTask, task_id)
    if not old:
        raise HTTPException(status_code=404, detail="Not found")
    from app.services.celery_tasks import scrape_offers_task
    new_task = ScrapeTask(
        company_id=old.company_id,
        retailer_category_id=old.retailer_category_id,
        region_id=old.region_id,
        status=ScrapeTaskStatus.queued,
    )
    db.add(new_task)
    await db.flush()
    celery_result = scrape_offers_task.delay(new_task.id)
    new_task.celery_task_id = celery_result.id
    await db.commit()
    await db.refresh(new_task)
    return new_task
