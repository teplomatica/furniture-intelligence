"""
Начальные данные: конкуренты и категории.
Запуск: python -m app.seed
"""
import asyncio
from app.core.database import async_session_maker, engine, Base
from app.models.company import Company, SegmentGroup, Positioning
from app.models.category import Category, PriceSegment

COMPANIES = [
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

        await db.commit()
        print("Seed completed.")


if __name__ == "__main__":
    asyncio.run(seed())
