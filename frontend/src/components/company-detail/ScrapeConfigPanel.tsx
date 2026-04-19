"use client";
import { useState } from "react";
import { api } from "@/lib/api";

interface Category { id: number; name: string; }
interface Region { id: number; name: string; }

interface CategoryMapping {
  id: number;
  company_id: number;
  category_id: number;
  retailer_name: string | null;
  retailer_url: string;
}

interface RegionMapping {
  id: number;
  company_id: number;
  region_id: number;
  region_method: string;
  region_key: string | null;
  region_value: string | null;
}

interface MatrixCell {
  id?: number;
  company_id: number;
  category_id: number;
  region_id: number;
  enabled: boolean;
}

interface Props {
  companyId: number;
  categories: Category[];
  regions: Region[];
  categoryMappings: CategoryMapping[];
  regionMappings: RegionMapping[];
  matrix: MatrixCell[];
  onReload: () => void;
  onAnalyze: () => void;
}

type Tab = "categories" | "regions" | "matrix";

const METHOD_LABELS: Record<string, string> = {
  cookie: "Cookie", url_param: "URL param", header: "Header", none: "Нет",
};

export function ScrapeConfigPanel({
  companyId, categories, regions,
  categoryMappings, regionMappings, matrix,
  onReload, onAnalyze,
}: Props) {
  const [tab, setTab] = useState<Tab>("categories");
  const [saving, setSaving] = useState(false);
  const [editingCat, setEditingCat] = useState<number | null>(null);
  const [editingReg, setEditingReg] = useState<number | null>(null);
  const [localMatrix, setLocalMatrix] = useState<Record<string, boolean>>({});

  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const regById = Object.fromEntries(regions.map((r) => [r.id, r]));

  // Matrix helpers
  const matrixCats = Array.from(new Set(categoryMappings.map((m: any) => m.category_id as number)));
  const matrixRegs = Array.from(new Set(regionMappings.map((m: any) => m.region_id as number)));
  const matrixKey = (catId: number, regId: number) => `${catId}-${regId}`;
  const matrixMap = Object.fromEntries(matrix.map((m) => [matrixKey(m.category_id, m.region_id), m.enabled]));

  const handleDeleteCatMapping = async (id: number) => {
    await api.delete(`/company-category-mappings/${id}`);
    onReload();
  };

  const handleUpdateCatMapping = async (id: number, field: string, value: any) => {
    await api.patch(`/company-category-mappings/${id}`, { [field]: value });
    setEditingCat(null);
    onReload();
  };

  const handleDeleteRegMapping = async (id: number) => {
    await api.delete(`/company-region-mappings/${id}`);
    onReload();
  };

  const handleUpdateRegMapping = async (id: number, field: string, value: any) => {
    await api.patch(`/company-region-mappings/${id}`, { [field]: value });
    setEditingReg(null);
    onReload();
  };

  const getMatrixValue = (catId: number, regId: number): boolean => {
    const k = matrixKey(catId, regId);
    if (k in localMatrix) return localMatrix[k];
    return matrixMap[k] ?? false;
  };

  const handleToggleMatrix = (catId: number, regId: number) => {
    const k = matrixKey(catId, regId);
    const current = getMatrixValue(catId, regId);
    const next = !current;
    // Optimistic: update local state immediately
    setLocalMatrix((prev) => ({ ...prev, [k]: next }));
    // Fire and forget — no reload on success
    api.patch(`/companies/${companyId}/scrape-matrix`, {
      items: [{ category_id: catId, region_id: regId, enabled: next }],
    }).catch(() => {
      // Revert on error
      setLocalMatrix((prev) => ({ ...prev, [k]: current }));
    });
  };

  const handleSetAll = (enabled: boolean) => {
    // Optimistic: update all locally
    const updates: Record<string, boolean> = {};
    matrixCats.forEach((catId) => {
      matrixRegs.forEach((regId) => {
        updates[matrixKey(catId, regId)] = enabled;
      });
    });
    setLocalMatrix((prev) => ({ ...prev, ...updates }));
    const items = matrixCats.flatMap((catId) =>
      matrixRegs.map((regId) => ({ category_id: catId, region_id: regId, enabled }))
    );
    api.patch(`/companies/${companyId}/scrape-matrix`, { items }).catch(() => onReload());
  };

  const totalEnabled = matrix.filter((m) => m.enabled).length;

  return (
    <section className="bg-white rounded-lg border mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">Настройки парсинга</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {categoryMappings.length} кат. / {regionMappings.length} рег. / {totalEnabled} ячеек
          </span>
          <button onClick={onAnalyze} className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
            Автонастройка
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {([
          ["categories", "Категории"],
          ["regions", "Регионы"],
          ["matrix", "Матрица"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Categories */}
      {tab === "categories" && (
        <div className="p-4">
          {categoryMappings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Нет маппинга категорий. Нажмите «Автонастройка» для автоматического анализа сайта.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Наша категория</th>
                  <th className="text-left px-3 py-2">Категория ритейлера</th>
                  <th className="text-left px-3 py-2">URL</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {categoryMappings.map((m) => (
                  <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <select
                        value={m.category_id}
                        onChange={(e) => handleUpdateCatMapping(m.id, "category_id", Number(e.target.value))}
                        className="px-1 py-0.5 border rounded text-sm w-full"
                      >
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={m.retailer_name || ""}
                        onBlur={(e) => { if (e.target.value !== (m.retailer_name || "")) handleUpdateCatMapping(m.id, "retailer_name", e.target.value); }}
                        className="px-1 py-0.5 border rounded text-sm w-full text-gray-600"
                        placeholder="Название на сайте"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={m.retailer_url}
                        onBlur={(e) => { if (e.target.value !== m.retailer_url) handleUpdateCatMapping(m.id, "retailer_url", e.target.value); }}
                        className="px-1 py-0.5 border rounded text-xs w-full font-mono text-gray-500"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => handleDeleteCatMapping(m.id)} className="text-gray-300 hover:text-red-500">&times;</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Regions */}
      {tab === "regions" && (
        <div className="p-4">
          {regionMappings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Нет маппинга регионов. Нажмите «Автонастройка».
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Наш регион</th>
                  <th className="text-left px-3 py-2">Метод</th>
                  <th className="text-left px-3 py-2">Ключ</th>
                  <th className="text-left px-3 py-2">Значение</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {regionMappings.map((m) => (
                  <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{regById[m.region_id]?.name ?? `#${m.region_id}`}</td>
                    <td className="px-3 py-2">
                      <select
                        value={m.region_method}
                        onChange={(e) => handleUpdateRegMapping(m.id, "region_method", e.target.value)}
                        className="px-1 py-0.5 border rounded text-xs"
                      >
                        <option value="cookie">{"Cookie"}</option>
                        <option value="url_param">{"URL param"}</option>
                        <option value="header">{"Header"}</option>
                        <option value="none">{"Нет"}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={m.region_key || ""}
                        onBlur={(e) => { if (e.target.value !== (m.region_key || "")) handleUpdateRegMapping(m.id, "region_key", e.target.value); }}
                        className="px-1 py-0.5 border rounded text-xs font-mono w-full"
                        placeholder="city_id"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={m.region_value || ""}
                        onBlur={(e) => { if (e.target.value !== (m.region_value || "")) handleUpdateRegMapping(m.id, "region_value", e.target.value); }}
                        className="px-1 py-0.5 border rounded text-xs font-mono w-full"
                        placeholder="moscow"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => handleDeleteRegMapping(m.id)} className="text-gray-300 hover:text-red-500">&times;</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Matrix */}
      {tab === "matrix" && (
        <div className="p-4">
          {matrixCats.length === 0 || matrixRegs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Добавьте маппинг категорий и регионов для построения матрицы.
            </p>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                <button onClick={() => handleSetAll(true)}
                  className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100">
                  Выбрать все
                </button>
                <button onClick={() => handleSetAll(false)}
                  className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100">
                  Снять все
                </button>
                <span className="text-xs text-gray-400 ml-2">{totalEnabled} из {matrixCats.length * matrixRegs.length} активно</span>
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 text-xs text-gray-500 font-medium"></th>
                      {matrixRegs.map((regId) => (
                        <th key={regId} className="text-center px-3 py-2 text-xs text-gray-500 font-medium">
                          {regById[regId]?.name ?? `#${regId}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixCats.map((catId) => (
                      <tr key={catId} className="border-t border-gray-50">
                        <td className="px-3 py-2 font-medium text-sm">{catById[catId]?.name ?? `#${catId}`}</td>
                        {matrixRegs.map((regId) => {
                          const enabled = getMatrixValue(catId, regId);
                          return (
                            <td key={regId} className="text-center px-3 py-2">
                              <button
                                onClick={() => handleToggleMatrix(catId, regId)}
                                className={`w-6 h-6 rounded border-2 transition ${
                                  enabled
                                    ? "bg-green-500 border-green-500 text-white"
                                    : "bg-white border-gray-300 text-transparent hover:border-gray-400"
                                }`}
                              >
                                {enabled ? "\u2713" : ""}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
