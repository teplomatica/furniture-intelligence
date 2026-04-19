"use client";
import { useState } from "react";

type Section = "about" | "architecture" | "features" | "scraping" | "releases";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "about", label: "О проекте" },
  { key: "architecture", label: "Архитектура" },
  { key: "features", label: "Функционал" },
  { key: "scraping", label: "Парсинг и офферы" },
  { key: "releases", label: "Release Notes" },
];

export default function WikiPage() {
  const [section, setSection] = useState<Section>("about");

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <nav className="w-48 shrink-0">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Справка</h2>
        <div className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`block w-full text-left px-3 py-1.5 rounded text-sm ${
                section === s.key ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {section === "about" && <AboutSection />}
        {section === "architecture" && <ArchitectureSection />}
        {section === "features" && <FeaturesSection />}
        {section === "scraping" && <ScrapingSection />}
        {section === "releases" && <ReleasesSection />}
      </div>
    </div>
  );
}

function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-bold mb-4">{children}</h1>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold mt-6 mb-3 text-gray-800">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold mt-4 mb-2 text-gray-700">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600 mb-3 leading-relaxed">{children}</p>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-700">{children}</code>;
}
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border">
        <thead><tr className="bg-gray-50">{headers.map((h, i) => <th key={i} className="text-left px-3 py-2 border-b font-medium text-gray-600">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-b">{row.map((cell, j) => <td key={j} className="px-3 py-2 text-gray-600">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function AboutSection() {
  return (
    <div>
      <H1>Furniture Intelligence</H1>
      <P>
        Система конкурентной разведки для рынка мебели. Разработана для Divan.ru
        с целью мониторинга конкурентов: финансовые показатели, ассортимент, цены,
        трафик и присутствие в регионах.
      </P>

      <H2>Назначение</H2>
      <P>
        Furniture Intelligence автоматически собирает и структурирует данные о конкурентах
        из открытых источников: корпоративные реестры (DataNewton), сайты ритейлеров (Firecrawl),
        а также позволяет вводить данные вручную. Все данные агрегируются на дашборде
        для сравнительного анализа.
      </P>

      <H2>Ключевые возможности</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Мониторинг 16 конкурентов в 4 сегментах (федеральные, онлайн, премиум, маркетплейсы)</li>
        <li>Автопоиск юридических лиц через парсинг сайтов + DataNewton API</li>
        <li>Финансовый дашборд с YoY динамикой (выручка, прибыль, EBITDA)</li>
        <li>Автоматический сбор товарных офферов с сайтов конкурентов через Firecrawl + Claude AI</li>
        <li>Авто-категоризация товаров по категориям и ценовым сегментам</li>
        <li>Региональный анализ: парсинг цен в разрезе 6 регионов</li>
        <li>Настраиваемая матрица парсинга: категории x регионы</li>
      </ul>

      <H2>Стек технологий</H2>
      <Table
        headers={["Компонент", "Технология"]}
        rows={[
          ["Backend", "Python 3.11, FastAPI, SQLAlchemy (async), Pydantic"],
          ["Frontend", "Next.js 14, React 18, Tailwind CSS"],
          ["База данных", "PostgreSQL (shared, таблицы с префиксом fi_)"],
          ["Внешние API", "DataNewton (юрлица/финансы), Firecrawl (JS-рендеринг сайтов)"],
          ["AI", "Claude Haiku (извлечение товаров из markdown, анализ структуры сайтов)"],
          ["Деплой", "Render (backend + frontend)"],
          ["Репозиторий", "GitHub: teplomatica/furniture-intelligence"],
        ]}
      />
    </div>
  );
}

function ArchitectureSection() {
  return (
    <div>
      <H1>Архитектура</H1>

      <H2>Структура проекта</H2>
      <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg mb-4 overflow-x-auto">{`furniture-intelligence/
├── backend/
│   ├── app/
│   │   ├── api/           # FastAPI роутеры
│   │   │   ├── companies.py, legal_entities.py, financials.py
│   │   │   ├── offers.py, regions.py, categories.py
│   │   │   ├── company_mappings.py, site_analysis.py
│   │   │   ├── dashboard.py, settings.py, scrape_test.py
│   │   ├── models/        # SQLAlchemy модели
│   │   │   ├── company.py, legal_entity.py, category.py
│   │   │   ├── offer.py, region.py, setting.py
│   │   │   ├── company_mapping.py, competitor_data.py
│   │   ├── services/      # Бизнес-логика
│   │   │   ├── offer_scraper.py    # Движок парсинга
│   │   │   ├── offer_parser.py     # Claude AI extraction
│   │   │   ├── site_analyzer.py    # LLM анализ сайта
│   │   │   ├── categorization.py   # Авто-категоризация
│   │   │   ├── scrape_utils.py     # Firecrawl + кэш
│   │   │   ├── legal_scraper.py    # Парсинг ИНН/ОГРН
│   │   │   ├── datanewton.py       # DataNewton API
│   │   │   ├── refresh.py          # SSE orchestrator
│   │   │   └── app_settings.py     # Runtime настройки
│   │   ├── core/          # Конфигурация, auth, DB
│   │   ├── main.py        # FastAPI app + startup
│   │   └── seed.py        # Начальные данные
├── frontend/
│   ├── src/
│   │   ├── app/(dashboard)/       # Страницы
│   │   │   ├── dashboard/, companies/, references/
│   │   │   ├── users/, settings/, wiki/
│   │   ├── components/
│   │   │   ├── company-detail/    # Секции компании
│   │   │   │   ├── ScrapeConfigPanel.tsx (3 tabs)
│   │   │   │   ├── SiteAnalysisWizard.tsx
│   │   │   │   ├── OffersSection.tsx, RefreshPanel.tsx
│   │   │   │   ├── FinancialsSection.tsx, TrafficSection.tsx
│   │   │   ├── Modal.tsx, Spinner.tsx, *Form.tsx
│   │   ├── lib/
│   │   │   ├── api.ts      # API клиент
│   │   │   └── sse.ts      # SSE streaming утилита`}</pre>

      <H2>Модель данных</H2>
      <P>Все таблицы имеют префикс <Code>fi_</Code> (shared PostgreSQL).</P>
      <Table
        headers={["Таблица", "Назначение", "Связи"]}
        rows={[
          ["fi_companies", "Конкуренты (16 шт, 4 сегмента)", "is_self для Divan.ru"],
          ["fi_legal_entities", "Юридические лица", "company_id FK"],
          ["fi_competitor_financials", "Выручка, прибыль по годам", "legal_entity_id FK"],
          ["fi_competitor_traffic", "Веб-трафик по месяцам", "company_id FK"],
          ["fi_competitor_assortment", "Агрегат SKU/цены по категориям", "company_id + category_id FK"],
          ["fi_categories", "3-уровневая иерархия (8 корневых)", "parent_id self-ref"],
          ["fi_price_segments", "Бюджет/Средний/Премиум per category", "category_id FK"],
          ["fi_regions", "6 регионов для анализа", "city_firecrawl"],
          ["fi_offers", "Товарные офферы (company+region)", "category_id, двухслойная категоризация"],
          ["fi_offer_category_log", "История назначений категорий", "offer_id FK"],
          ["fi_company_category_mapping", "Наша категория \u2192 URL ритейлера", "company+category"],
          ["fi_company_region_mapping", "Наш регион \u2192 cookie/param", "company+region"],
          ["fi_company_scrape_matrix", "Матрица парсинга", "company+category+region"],
          ["fi_settings", "Runtime настройки (key-value)", "7 default settings"],
          ["fi_scrape_cache", "Кэш скрапинга (7-day TTL)", "url unique"],
        ]}
      />

      <H2>Аутентификация</H2>
      <P>JWT-based. 4 роли: superadmin, admin, editor, viewer. Все write-операции требуют editor+.</P>

      <H2>SSE Streaming</H2>
      <P>
        Длительные операции (поиск юрлиц, синхронизация финансов, сбор офферов) используют
        Server-Sent Events. Backend отправляет JSON-события через <Code>StreamingResponse</Code>,
        фронтенд читает через <Code>streamSSE()</Code> утилиту.
      </P>
    </div>
  );
}

function FeaturesSection() {
  return (
    <div>
      <H1>Функционал</H1>

      <H2>Дашборд</H2>
      <P>
        Финансовая таблица по всем компаниям. Столбцы — годы (динамические из данных).
        Каждая ячейка: YoY изменение (зелёный/красный) + абсолютное значение мелким.
        Tabs: Выручка / Прибыль / EBITDA. Divan.ru закреплён вверху с бейджем.
      </P>

      <H2>Управление компаниями</H2>
      <P>
        Список конкурентов по 4 сегментам с summary-бейджами (ЮЛ, финансы, трафик, ассорт).
        Клик открывает детальную страницу со всеми секциями.
      </P>

      <H2>Детальная страница компании</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li><strong>Юрлица:</strong> список с ИНН/ОГРН, автопоиск через сайт + DataNewton</li>
        <li><strong>Финансы:</strong> таблица по годам per ЮЛ, DataNewton данные read-only</li>
        <li><strong>Трафик:</strong> визиты, bounce rate, время на сайте</li>
        <li><strong>Ассортимент:</strong> SKU count, наличие, цены по категориям</li>
        <li><strong>Настройки парсинга:</strong> 3 вкладки (категории, регионы, матрица)</li>
        <li><strong>Офферы:</strong> товары с фильтрами, пагинацией, массовым редактированием</li>
        <li><strong>Обновить данные:</strong> SSE refresh panel (юрлица, финансы, офферы)</li>
      </ul>

      <H2>Справочники (/references)</H2>
      <P>
        Единая страница с 4 вкладками для управления справочниками:
      </P>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li><strong>Каналы:</strong> типы ритейлеров (Федеральные, Онлайн, Премиум, Маркетплейсы) — редактируемый справочник</li>
        <li><strong>Позиционирование:</strong> Бюджет / Средний / Премиум — редактируемый справочник</li>
        <li><strong>Регионы:</strong> города для регионального анализа (city_firecrawl для маппинга)</li>
        <li><strong>Категории:</strong> 3-уровневое дерево — Категория → Подкатегория → Ценовой сегмент (мин/макс цена)</li>
      </ul>
      <P>Все справочники поддерживают добавление, редактирование и удаление. Поле sort_order управляет порядком отображения.</P>

      <H2>Пользователи (/users)</H2>
      <P>
        Открытая регистрация на /register — новый пользователь создаётся со статусом inactive.
        Администратор активирует учётную запись на странице /users. До активации вход невозможен.
        Роли: superadmin, admin, editor, viewer.
      </P>

      <H2>Настройки</H2>
      <P>
        Runtime key-value настройки: TTL кэша, rate limit Firecrawl, debug mode
        (ограничивает API вызовы для тестирования).
      </P>
    </div>
  );
}

function ScrapingSection() {
  return (
    <div>
      <H1>Парсинг и офферы</H1>

      <H2>Pipeline парсинга</H2>
      <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg mb-4 overflow-x-auto">{`1. АВТОНАСТРОЙКА (Site Analysis Wizard)
   Firecrawl(сайт) \u2192 Claude AI: "какие категории и регионы?"
   \u2192 маппинг на наши справочники \u2192 матрица парсинга

2. МАППИНГ (3 таблицы per company)
   Категории: наша "Диваны" \u2192 ["/catalog/divany/", "/catalog/divany/uglovye/"]
   Регионы:   наша "Москва" \u2192 cookie city_id=1
   Матрица:   Диваны\u00d7Москва=\u2713, Диваны\u00d7СПб=\u2713, Шкафы\u00d7СПб=\u2717

3. ПАРСИНГ (для каждой \u2713 ячейки матрицы)
   URL + region params \u2192 Firecrawl (JS-рендеринг)
   \u2192 markdown \u2192 Claude Haiku (извлечение товаров)
   \u2192 JSON [{name, price, url, sku, availability}]

4. СОХРАНЕНИЕ
   Upsert по URL (обновление цен, сохранение ручных категорий)
   Авто-категоризация: keyword matching + price segment lookup
   Версионирование: fi_offer_category_log`}</pre>

      <H2>Авто-категоризация</H2>
      <P>
        Двухслойная система: <Code>category_source</Code> = auto | manual.
        При авто-категоризации: корень названия категории ищется в имени товара
        ("диван" в "Диван-кровать Пекин" \u2192 категория "Диваны").
        Ценовой сегмент определяется по диапазону (0-50K = Бюджет, 50K-150K = Средний).
        Ручные назначения никогда не перезаписываются при повторном парсинге.
      </P>

      <H2>Firecrawl</H2>
      <P>
        JS-rendered scraping API. Используется для парсинга сайтов конкурентов.
        Поддерживает передачу headers/cookies для региона.
        Кэш: 7-дневный TTL, ключ включает region_id.
        Debug mode ограничивает количество вызовов.
      </P>

      <H2>Claude AI Extraction</H2>
      <P>
        Вместо regex-парсеров используется Claude Haiku для извлечения товаров из markdown.
        Один промпт обрабатывает любой сайт без site-specific правил.
        Стоимость: ~$0.005/страница. Max 30K символов markdown на запрос.
      </P>

      <H2>Массовое редактирование офферов</H2>
      <P>
        Чекбоксы для выбора нескольких офферов \u2192 dropdown категории \u2192 "Применить".
        Устанавливает <Code>category_source=manual</Code>, записывает лог изменений.
        Кнопка "Перекатегоризировать" пере-запускает авто для <Code>source=auto</Code> записей.
      </P>
    </div>
  );
}

function ReleasesSection() {
  return (
    <div>
      <H1>Release Notes</H1>

      <H2>v0.9 — References + User Management (2026-04-18)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Единый справочник /references с 4 вкладками (Каналы, Позиционирование, Регионы, Категории)</li>
        <li>3-уровневое дерево категорий: Категория → Подкатегория → Ценовой сегмент с полным CRUD</li>
        <li>Каналы и Позиционирование — редактируемые справочники (заменили enum)</li>
        <li>Массовое редактирование компаний: чекбоксы + toolbar (Канал, Позиционирование)</li>
        <li>Регистрация пользователей с активацией администратором, страница /users</li>
        <li>Удаление компаний (cascade), защита Divan.ru (is_self) от удаления</li>
        <li>Поддержка нескольких сайтов на компанию (websites JSON)</li>
        <li>CLAUDE.md для автоматического чтения Claude Code</li>
      </ul>

      <H2>v0.8 — LLM Legal Entity Extraction (2026-04-15)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Поиск юрлиц: DataNewton first (name → domain) → Firecrawl + Claude AI fallback</li>
        <li>Замена regex на Claude Haiku для извлечения ИНН/ОГРН/названия</li>
        <li>Редактирование юрлиц inline, auto-primary для первого ЮЛ</li>
        <li>Inline редактирование в ScrapeConfigPanel (категории и регионы)</li>
        <li>Wiki — полная документация проекта</li>
      </ul>

      <H2>v0.7 — Mapping Architecture (2026-04-15)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Новая архитектура маппинга: 3 таблицы (категории, регионы, матрица) вместо monolithic config</li>
        <li>ScrapeConfigPanel с 3 вкладками и inline-редактированием</li>
        <li>Интерактивная матрица парсинга (категории x регионы)</li>
        <li>Fix: cascade delete юрлиц, skip_cache в discover, DataNewton read-only</li>
      </ul>

      <H2>v0.6 — Financial Dashboard (2026-04-14)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Дашборд с финансовыми показателями по брендам</li>
        <li>YoY динамика в компактном 2-строчном формате</li>
        <li>Tabs: Выручка / Прибыль / EBITDA</li>
        <li>Home page редиректит на /dashboard</li>
      </ul>

      <H2>v0.5 — Intelligent Scraping Pipeline (2026-04-13)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Site Analysis Wizard: LLM-анализ структуры сайта конкурента</li>
        <li>Автоматическое обнаружение категорий и регионов</li>
        <li>Divan.ru как "своя" компания с бейджем "Мы"</li>
        <li>Scrape test с SSE прелоадером и категоризацией в результатах</li>
      </ul>

      <H2>v0.4 — Claude AI Parser (2026-04-13)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Замена regex-парсера на Claude Haiku LLM extraction</li>
        <li>Универсальный промпт для любого сайта</li>
        <li>Русская морфология в категоризации (диваны \u2192 диван)</li>
      </ul>

      <H2>v0.3 — Offer Scraping Engine (2026-04-13)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Settings page с debug mode, cache TTL, rate limits</li>
        <li>Offer scraper с Firecrawl + region context + пагинация</li>
        <li>CompanyRegionConfig для конфигурации парсинга</li>
        <li>Offer parser (generic markdown extraction)</li>
      </ul>

      <H2>v0.2 — Regions + Offers (2026-04-13)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Справочник регионов (6 городов)</li>
        <li>Система офферов: пагинация, авто-категоризация, массовое редактирование</li>
        <li>Версионирование назначений категорий (fi_offer_category_log)</li>
        <li>Двухслойная категоризация (auto/manual с защитой ручных назначений)</li>
      </ul>

      <H2>v0.1 — Company-Centric View (2026-04-13)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>Детальная страница компании /companies/[slug] со всеми секциями</li>
        <li>SSE Refresh Panel для автообновления данных</li>
        <li>CRUD для финансов, трафика, ассортимента</li>
        <li>Sidebar упрощён, summary бейджи на списке компаний</li>
      </ul>

      <H2>v0.0 — Foundation (2026-04-12)</H2>
      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mb-4">
        <li>FastAPI backend + Next.js frontend</li>
        <li>Auth (JWT, 4 роли), CRUD компаний, категорий, юрлиц</li>
        <li>DataNewton интеграция (поиск юрлиц, финансы)</li>
        <li>Firecrawl интеграция (скрапинг сайтов для ИНН/ОГРН)</li>
        <li>SSE streaming для автопоиска юрлиц</li>
        <li>Seed: 15 конкурентов, 8 категорий, ценовые сегменты</li>
        <li>Deploy на Render</li>
      </ul>
    </div>
  );
}
