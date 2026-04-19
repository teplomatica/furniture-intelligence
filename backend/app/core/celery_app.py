"""Celery app configuration."""
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "furniture_intelligence",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.services.celery_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,  # 30 мин hard limit
    task_soft_time_limit=1500,
    worker_concurrency=3,  # 3 параллельных задачи
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)
