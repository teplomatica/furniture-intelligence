"use client";
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

  const handleInit = async () => {
    await api.post(`/company-region-configs/init/${companyId}`, {});
    onReload();
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
                <th className="w-10"></th>
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
                  <td className="px-2 py-2">
                    <button onClick={() => onEdit(c)} className="text-gray-400 hover:text-blue-600 text-sm">&#9998;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
