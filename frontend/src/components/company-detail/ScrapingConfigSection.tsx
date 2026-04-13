"use client";
import { useState } from "react";
import { api } from "@/lib/api";

interface Region { id: number; name: string; }

interface Config {
  id: number;
  company_id: number;
  region_id: number;
  has_region_selector: boolean;
  has_stock_filter: boolean;
  stock_filter_method: string;
  region_method: string;
  region_key: string | null;
  region_value: string | null;
  catalog_urls: string[] | null;
  is_active: boolean;
}

interface ScrapeTestResult {
  url: string;
  method: string;
  markdown_length: number;
  markdown_preview: string;
  offers_found: number;
  offers: Array<{
    name: string;
    url?: string;
    price?: number;
    price_old?: number;
    is_available?: boolean;
    sku?: string;
  }>;
}

interface Props {
  configs: Config[];
  regions: Region[];
  companyId: number;
  onAdd: () => void;
  onEdit: (config: Config) => void;
  onReload: () => void;
}

const METHOD_LABELS: Record<string, string> = {
  cookie: "Cookie",
  url_param: "URL param",
  header: "Header",
  subdomain: "Subdomain",
  none: "Нет",
};

export function ScrapingConfigSection({ configs, regions, companyId, onAdd, onEdit, onReload }: Props) {
  const regionById = Object.fromEntries(regions.map((r) => [r.id, r]));
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<ScrapeTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);

  const handleInit = async () => {
    await api.post(`/company-region-configs/init/${companyId}`, {});
    onReload();
  };

  const handleTest = async (config: Config) => {
    if (!config.catalog_urls?.length) {
      setTestError("Добавьте catalog URLs для теста");
      setTestResult(null);
      return;
    }
    setTesting(config.id);
    setTestResult(null);
    setTestError(null);
    setShowMarkdown(false);

    const url = config.catalog_urls[0];
    let extra_headers: Record<string, string> | undefined;
    if (config.region_method === "cookie" && config.region_key && config.region_value) {
      extra_headers = { Cookie: `${config.region_key}=${config.region_value}` };
    } else if (config.region_method === "header" && config.region_key && config.region_value) {
      extra_headers = { [config.region_key]: config.region_value };
    }

    try {
      const result = await api.post<ScrapeTestResult>("/scrape-test", {
        url,
        extra_headers: extra_headers || null,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestError(err.message || "Ошибка скрапинга");
    } finally {
      setTesting(null);
    }
  };

  return (
    <section className="bg-white rounded-lg border mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">Настройки парсинга</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{configs.length} конфигов</span>
          {configs.length === 0 && (
            <button onClick={handleInit} className="text-xs px-3 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">
              Инициализировать все регионы
            </button>
          )}
          <button onClick={onAdd} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            + Добавить
          </button>
        </div>
      </div>
      {configs.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          Нет настроек парсинга. Добавьте конфиг для начала сбора офферов.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2">Регион</th>
                <th className="text-left px-4 py-2">Catalog URLs</th>
                <th className="text-left px-4 py-2">Метод</th>
                <th className="text-center px-4 py-2">Регион</th>
                <th className="text-center px-4 py-2">Наличие</th>
                <th className="text-center px-4 py-2">Активен</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{regionById[c.region_id]?.name ?? `#${c.region_id}`}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 max-w-[200px] truncate">
                    {c.catalog_urls?.join(", ") || "\u2014"}
                  </td>
                  <td className="px-4 py-2 text-xs">{METHOD_LABELS[c.region_method] || c.region_method}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${c.has_region_selector ? "bg-green-500" : "bg-gray-300"}`} />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${c.has_stock_filter ? "bg-green-500" : "bg-gray-300"}`} />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${c.is_active ? "bg-green-500" : "bg-red-400"}`} />
                  </td>
                  <td className="px-2 py-2 flex gap-1">
                    <button
                      onClick={() => handleTest(c)}
                      disabled={testing === c.id}
                      className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 disabled:opacity-50"
                      title="Тест-скрап первого URL"
                    >
                      {testing === c.id ? "..." : "Тест"}
                    </button>
                    <button onClick={() => onEdit(c)} className="text-gray-400 hover:text-blue-600 text-sm">&#9998;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Test results */}
      {testError && (
        <div className="px-4 py-3 border-t bg-red-50">
          <p className="text-sm text-red-600">{testError}</p>
          <button onClick={() => setTestError(null)} className="text-xs text-gray-400 mt-1">Закрыть</button>
        </div>
      )}

      {testResult && (
        <div className="px-4 py-3 border-t bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Результат теста: {testResult.offers_found} товаров из {testResult.markdown_length} символов
              <span className="ml-2 text-xs font-normal text-gray-400">({testResult.method})</span>
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowMarkdown(!showMarkdown)}
                className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                {showMarkdown ? "Скрыть markdown" : "Показать markdown"}
              </button>
              <button onClick={() => setTestResult(null)} className="text-xs text-gray-400 hover:text-gray-600">&times;</button>
            </div>
          </div>

          {showMarkdown && (
            <pre className="text-xs text-gray-600 bg-white border rounded p-3 mb-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">
              {testResult.markdown_preview}
              {testResult.markdown_length > 5000 && "\n\n... (обрезано)"}
            </pre>
          )}

          {testResult.offers_found > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="text-left px-2 py-1">Название</th>
                    <th className="text-right px-2 py-1">Цена</th>
                    <th className="text-right px-2 py-1">Стар.</th>
                    <th className="text-center px-2 py-1">Нал.</th>
                    <th className="text-left px-2 py-1">SKU</th>
                  </tr>
                </thead>
                <tbody>
                  {testResult.offers.map((o, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1 max-w-[250px] truncate">
                        {o.url ? (
                          <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {o.name}
                          </a>
                        ) : o.name}
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{o.price ? `${o.price.toLocaleString("ru-RU")} \u20BD` : "\u2014"}</td>
                      <td className="px-2 py-1 text-right font-mono text-gray-400">{o.price_old ? `${o.price_old.toLocaleString("ru-RU")} \u20BD` : ""}</td>
                      <td className="px-2 py-1 text-center">
                        {o.is_available === null || o.is_available === undefined ? "\u2014" : o.is_available ? "\u2705" : "\u274C"}
                      </td>
                      <td className="px-2 py-1 text-gray-400">{o.sku || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-orange-500">
              Парсер не извлёк товаров. Нажмите «Показать markdown» чтобы увидеть что вернул Firecrawl — возможно нужен site-specific парсер.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
