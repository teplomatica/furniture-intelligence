# Furniture Intelligence

Система конкурентной разведки для Divan.ru — мониторинг конкурентов на рынке мебели.

## Стек

- **Backend:** Python 3.11, FastAPI, SQLAlchemy (async), PostgreSQL
- **Frontend:** Next.js 14, React 18, Tailwind CSS
- **AI:** Claude Haiku (извлечение товаров, анализ сайтов, поиск юрлиц)
- **Scraping:** Firecrawl API (JS-рендеринг), кэш 7 дней
- **External API:** DataNewton (юрлица, финансы)
- **Queue:** Celery + Redis (отдельный worker service на Render)
- **Deploy:** Render (backend web + Celery worker + frontend + Redis)
- **Repo:** GitHub teplomatica/furniture-intelligence

## Структура проекта

```
backend/
  app/
    api/          — FastAPI роутеры (companies, offers, dashboard, settings, ...)
    models/       — SQLAlchemy модели (все таблицы с префиксом fi_)
    services/     — Бизнес-логика (offer_scraper, offer_parser, site_analyzer, ...)
    core/         — Config, auth, database
    main.py       — App + startup + migrate_add_columns()
    seed.py       — Начальные данные (16 компаний, 8 категорий, 6 регионов, 7 settings)
frontend/
  src/
    app/(dashboard)/  — Страницы (dashboard, companies, references, users, settings, wiki)
    components/       — UI компоненты
      company-detail/ — Секции детальной страницы компании
    lib/              — api.ts, sse.ts
```

## База данных

Shared PostgreSQL с DivanPOHelper. ВСЕ таблицы ОБЯЗАТЕЛЬНО с префиксом `fi_`.

### Ключевые таблицы

| Таблица | Назначение |
|---------|-----------|
| fi_companies | Конкуренты (is_self=True для Divan.ru, channel_id + positioning_id FKs, websites JSON) |
| fi_channels | Каналы (Федеральные, Онлайн, Премиум, Маркетплейсы) — редактируемый справочник |
| fi_positionings | Позиционирование (Бюджет, Средний, Премиум) — редактируемый справочник |
| fi_legal_entities | Юрлица (cascade delete к financials) |
| fi_competitor_financials | Выручка, прибыль, EBITDA по годам |
| fi_competitor_traffic | Веб-трафик по месяцам |
| fi_competitor_assortment | Агрегат SKU/цены |
| fi_categories | 3-уровневая иерархия: категория → подкатегория → (price_segments level 3) |
| fi_price_segments | Ценовые сегменты per category (мин/макс цена) |
| fi_regions | Регионы для анализа |
| fi_offers | Товарные офферы (двухслойная категоризация auto/manual) |
| fi_offer_category_log | История назначений категорий |
| fi_company_category_mapping | Наша категория → URL ритейлера |
| fi_company_region_mapping | Наш регион → cookie/param ритейлера |
| fi_company_scrape_matrix | Матрица парсинга (category × region) |
| fi_settings | Runtime настройки (key-value) |
| fi_scrape_cache | Кэш скрапинга (7-day TTL) |
| fi_retailer_categories | Справочник категорий ритейлера per company (2-уровневая иерархия) |
| fi_scrape_tasks | Задачи парсинга (retailer_category × region, Celery-driven) |

## Важные архитектурные решения

### Миграции
`create_all()` НЕ добавляет колонки в существующие таблицы. При добавлении новых полей — добавлять ALTER TABLE в `migrate_add_columns()` в main.py.

### SSE Streaming
Длительные операции (поиск юрлиц, парсинг офферов) используют Server-Sent Events. Backend: `StreamingResponse` + async generator. Frontend: `streamSSE()` в lib/sse.ts.

### Парсинг офферов (Pipeline)
1. Автонастройка: Firecrawl(сайт) → Claude AI → категории + регионы → маппинг
2. Маппинг: fi_company_category_mapping + fi_company_region_mapping + fi_company_scrape_matrix
3. Парсинг: для каждой enabled ячейки матрицы → Firecrawl → Claude Haiku extraction → upsert
4. Категоризация: keyword root matching (диваны→диван) + price segment lookup
5. Manual override: category_source=manual никогда не перезаписывается

### Поиск юрлиц
1. DataNewton по названию → 2. DataNewton по домену → 3. Firecrawl + Claude AI extraction → 4. DataNewton по ИНН

### Аутентификация
JWT, 4 роли: superadmin > admin > editor > viewer. Write = editor+. Settings = admin+.
- Регистрация: `POST /auth/register` — создаёт пользователя со status=inactive
- Активация: admin через `/users` page (PATCH /auth/users/{id}/activate)
- Inactive пользователи не могут войти

## Команды

```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload
python -m app.seed  # seed data

# Frontend
cd frontend && npm install
npm run dev
npm run build
```

## Deploy (Render)

- Backend: Python web service, rootDir=backend
- Frontend: Node web service, rootDir=frontend
- Env vars: DATABASE_URL, JWT_SECRET, SUPERADMIN_EMAIL/PASSWORD, DATANEWTON_API_KEY, FIRECRAWL_API_KEY, ANTHROPIC_API_KEY, FRONTEND_URL
- .python-version = 3.11.11 (Render default 3.14 не работает)
- asyncpg: нужно чистить sslmode/channel_binding из DATABASE_URL (делает config.py автоматически)

## Текущее состояние

- 16 компаний (вкл. Divan.ru is_self), 8 категорий, 6 регионов, 4 канала, 3 позиционирования
- Sidebar: Дашборд, Конкуренты, Справочники, Пользователи, Настройки, Справка
- Dashboard: финансовая таблица YoY (Выручка/EBITDA/Прибыль), сортировка (А-Я/выручка/EBITDA/прибыль)
- Divan.ru (is_self) закреплён вверху дашборда с бейджем "Мы"
- Company detail: ЮЛ (cascade delete, edit inline), финансы (DataNewton read-only), трафик, ассортимент, ScrapeConfigPanel (3 tabs: категории/регионы/матрица), офферы
- Компании: поддержка нескольких сайтов (websites JSON), delete с каскадом
- References page: единый справочник с 4 вкладками (Каналы, Позиционирование, Регионы, Категории)
- Категории: 3-уровневое дерево с полным CRUD на каждом уровне
- Channels/Positionings: редактируемые справочники (заменили enum)
- Bulk edit: массовое изменение канала/позиционирования на странице компаний
- Users: регистрация → активация админом; страница /users для управления
- Автонастройка: Site Analysis Wizard (LLM → категории + регионы → матрица)
- Offer parser: Claude Haiku LLM extraction (вместо regex)
- Legal entity search: DataNewton first (name → domain) → Firecrawl+Claude AI fallback
- Wiki: /wiki — 5 секций документации
- Settings: debug mode (limits Firecrawl calls), cache TTL, rate limits
