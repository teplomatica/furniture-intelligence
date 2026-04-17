"""
Начальные данные: конкуренты и категории.
Запуск: python -m app.seed
"""
import asyncio
from app.core.database import async_session_maker, engine, Base
from app.models.company import Company, SegmentGroup, Positioning
from app.models.category import Category, PriceSegment
from app.models.region import Region
from app.models.setting import Setting
from app.models.channel import Channel, PositioningRef

COMPANIES = [
    # Мы
    dict(name="Divan.ru", slug="divan", website="divan.ru", segment_group=SegmentGroup.online, positioning=Positioning.mid, notes="Мы", is_self=True),
    # А: Крупные федеральные сети
    dict(name="Hoff", slug="hoff", website="hoff.ru", segment_group=SegmentGroup.federal, positioning=Positioning.mid, notes="Крупнейший омниканальный ритейлер"),
    dict(name="Askona", slug="askona", website="askona.ru", segment_group=SegmentGroup.federal, positioning=Positioning.mid, notes="Фокус на матрасы и сон"),
    dict(name="Много Мебели", slug="mnogo-mebeli", website="mnogo-mebeli.com", segment_group=SegmentGroup.federal, positioning=Positioning.budget, notes="Массовый сегмент"),
    dict(name="Lazurit", slug="lazurit", website="lazurit.com", segment_group=SegmentGroup.federal, positioning=Positioning.mid, notes="Мягкая мебель"),
    dict(name="Шатура", slug="shatura", website="shatura.com", segment_group=SegmentGroup.federal, positioning=Positioning.mid, notes="Корпусная мебель"),
    dict(name="Столплит", slug="stolplit", website="stolplit.ru", segment_group=SegmentGroup.federal, positioning=Positioning.budget, notes="Бюджетный сегмент"),
    dict(name="Ангстрем", slug="angstrem", website="anstrem.ru", segment_group=SegmentGroup.federal, positioning=Positioning.mid, notes="Корпусная мебель"),
    # Б: Онлайн-ритейлеры
    dict(name="HomeMe", slug="homeme", website="homeme.ru", segment_group=SegmentGroup.online, positioning=Positioning.mid, notes="Online-first"),
    dict(name="Moon-Trade", slug="moon-trade", website="moon-trade.ru", segment_group=SegmentGroup.online, positioning=Positioning.mid, notes="Мягкая мебель"),
    dict(name="MebelVia", slug="mebelvia", website="mebelvia.ru", segment_group=SegmentGroup.online, positioning=Positioning.mid, notes="Широкий ассортимент"),
    # В: Премиум
    dict(name="BoConcept", slug="boconcept", website="boconcept.com", segment_group=SegmentGroup.premium, positioning=Positioning.premium, notes="Дизайнерская мебель"),
    dict(name="Mr.Doors", slug="mr-doors", website="mrdoors.ru", segment_group=SegmentGroup.premium, positioning=Positioning.premium, notes="Мебель на заказ"),
    # Г: Маркетплейсы
    dict(name="Ozon (мебель)", slug="ozon", website="ozon.ru", segment_group=SegmentGroup.marketplace, notes="Категория Мебель"),
    dict(name="Wildberries (мебель)", slug="wildberries", website="wildberries.ru", segment_group=SegmentGroup.marketplace, notes="Категория Мебель"),
    dict(name="Яндекс.Маркет (мебель)", slug="yandex-market", website="market.yandex.ru", segment_group=SegmentGroup.marketplace, notes="Категория Мебель"),
]

CATEGORIES = [
    # (name, slug, children_with_segments)
    ("Диваны", "divany", [
        ("Прямые диваны", "divany-pryamye"),
        ("Угловые диваны", "divany-uglovye"),
        ("Модульные диваны", "divany-modulnye"),
        ("Кресла-кровати", "kresla-krovati"),
    ], [(0, 50000), (50000, 150000), (150000, None)]),
    ("Кровати", "krovati", [
        ("Односпальные", "krovati-odnosp"),
        ("Двуспальные", "krovati-dvusp"),
        ("С механизмом", "krovati-mekh"),
        ("Детские кровати", "krovati-detskie"),
    ], [(0, 30000), (30000, 80000), (80000, None)]),
    ("Матрасы", "matrasy", [
        ("Пружинные", "matrasy-pruzhinnye"),
        ("Беспружинные", "matrasy-bespruzhinnye"),
        ("Топперы", "toppers"),
    ], [(0, 20000), (20000, 50000), (50000, None)]),
    ("Мягкая мебель", "myagkaya-mebel", [
        ("Кресла", "kresla"),
        ("Пуфы", "pufy"),
        ("Банкетки", "banketki"),
    ], [(0, 15000), (15000, 40000), (40000, None)]),
    ("Столы", "stoly", [
        ("Обеденные столы", "stoly-obedennye"),
        ("Журнальные столы", "stoly-zhurnalnye"),
        ("Письменные столы", "stoly-pismennye"),
    ], [(0, 10000), (10000, 40000), (40000, None)]),
    ("Шкафы", "shkafy", [
        ("Шкафы-купе", "shkafy-kupe"),
        ("Распашные шкафы", "shkafy-raspashnye"),
        ("Гардеробные", "garderobny"),
    ], [(0, 25000), (25000, 70000), (70000, None)]),
    ("Детская мебель", "detskaya-mebel", [
        ("Детские кровати", "det-krovati"),
        ("Комоды детские", "det-komody"),
        ("Гарнитуры детские", "det-garnitury"),
    ], [(0, 15000), (15000, 45000), (45000, None)]),
    ("Кухни", "kukhni", [
        ("Готовые гарнитуры", "kukhni-gotovye"),
        ("Модульные кухни", "kukhni-modulnye"),
    ], [(0, 50000), (50000, 150000), (150000, None)]),
]

DEFAULT_SETTINGS = [
    dict(key="cache_ttl_days", value="7", description="TTL кэша скрапинга (дни)"),
    dict(key="max_pages_per_catalog", value="10", description="Макс. страниц пагинации на один catalog URL"),
    dict(key="rate_limit_seconds", value="1.5", description="Пауза между Firecrawl вызовами (секунды)"),
    dict(key="firecrawl_wait_for", value="2000", description="Ожидание рендеринга в Firecrawl (мс)"),
    dict(key="debug_mode", value="false", description="Debug mode: ограничивает количество запросов"),
    dict(key="debug_max_api_calls", value="10", description="Макс. Firecrawl вызовов (страниц) за один refresh в debug mode"),
    dict(key="debug_max_offers_per_page", value="5", description="Макс. офферов с одной страницы в debug mode"),
]

REGIONS = [
    dict(name="Москва", slug="moscow", sort_order=0, city_firecrawl="Москва"),
    dict(name="Санкт-Петербург", slug="spb", sort_order=1, city_firecrawl="Санкт-Петербург"),
    dict(name="Новосибирск", slug="novosibirsk", sort_order=2, city_firecrawl="Новосибирск"),
    dict(name="Екатеринбург", slug="ekaterinburg", sort_order=3, city_firecrawl="Екатеринбург"),
    dict(name="Краснодар", slug="krasnodar", sort_order=4, city_firecrawl="Краснодар"),
    dict(name="Казань", slug="kazan", sort_order=5, city_firecrawl="Казань"),
]

CHANNELS = [
    dict(name="Федеральные сети", slug="federal", sort_order=0),
    dict(name="Онлайн-ритейлеры", slug="online", sort_order=1),
    dict(name="Премиум", slug="premium", sort_order=2),
    dict(name="Маркетплейсы", slug="marketplace", sort_order=3),
]

POSITIONINGS = [
    dict(name="Бюджет", slug="budget", sort_order=0),
    dict(name="Средний", slug="mid", sort_order=1),
    dict(name="Премиум", slug="premium", sort_order=2),
]

SEGMENT_NAMES = ["Бюджет", "Средний", "Премиум"]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_maker() as db:
        # Компании
        for data in COMPANIES:
            from sqlalchemy import select
            existing = await db.execute(select(Company).where(Company.slug == data["slug"]))
            if not existing.scalar_one_or_none():
                db.add(Company(**data))

        # Категории
        for cat_name, cat_slug, children, price_ranges in CATEGORIES:
            from sqlalchemy import select
            existing = await db.execute(select(Category).where(Category.slug == cat_slug))
            parent = existing.scalar_one_or_none()
            if not parent:
                parent = Category(name=cat_name, slug=cat_slug, level=1)
                db.add(parent)
                await db.flush()

                for i, (pmin, pmax) in enumerate(price_ranges):
                    db.add(PriceSegment(
                        category_id=parent.id,
                        name=SEGMENT_NAMES[i],
                        price_min=pmin,
                        price_max=pmax,
                        sort_order=i,
                    ))

                for j, (child_name, child_slug) in enumerate(children):
                    db.add(Category(
                        name=child_name, slug=child_slug,
                        parent_id=parent.id, level=2, sort_order=j
                    ))

        # Регионы
        for data in REGIONS:
            from sqlalchemy import select as sel
            existing = await db.execute(sel(Region).where(Region.slug == data["slug"]))
            if not existing.scalar_one_or_none():
                db.add(Region(**data))

        # Каналы
        for data in CHANNELS:
            from sqlalchemy import select as sel3
            existing = await db.execute(sel3(Channel).where(Channel.slug == data["slug"]))
            if not existing.scalar_one_or_none():
                db.add(Channel(**data))

        # Позиционирование
        for data in POSITIONINGS:
            from sqlalchemy import select as sel4
            existing = await db.execute(sel4(PositioningRef).where(PositioningRef.slug == data["slug"]))
            if not existing.scalar_one_or_none():
                db.add(PositioningRef(**data))

        # Настройки
        for data in DEFAULT_SETTINGS:
            from sqlalchemy import select as sel2
            existing = await db.execute(sel2(Setting).where(Setting.key == data["key"]))
            if not existing.scalar_one_or_none():
                db.add(Setting(**data))

        await db.commit()
        print("Seed completed.")


if __name__ == "__main__":
    asyncio.run(seed())
