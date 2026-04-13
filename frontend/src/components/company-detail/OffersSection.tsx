"use client";
import { useState } from "react";
import { api } from "@/lib/api";

interface Region { id: number; name: string; }
interface Category { id: number; name: string; }

interface Offer {
  id: number;
  company_id: number;
  region_id: number;
  name: string;
  url: string | null;
  sku: string | null;
  price: number | null;
  price_old: number | null;
  is_available: boolean | null;
  category_id: number | null;
  category_source: string;
  price_segment_id: number | null;
}

interface Props {
  offers: Offer[];
  total: number;
  regions: Region[];
  categories: Category[];
  companyId: number;
  onAdd: () => void;
  onEdit: (offer: Offer) => void;
  onReload: () => void;
  filterRegionId: number | null;
  onFilterRegion: (id: number | null) => void;
  filterCategoryId: number | null;
  onFilterCategory: (id: number | null) => void;
  uncategorizedOnly: boolean;
  onUncategorizedOnly: (v: boolean) => void;
  page: number;
  onPageChange: (p: number) => void;
  pageSize: number;
}

function fmtPrice(v: number | null): string {
  if (v == null) return "\u2014";
  return v.toLocaleString("ru-RU") + " \u20BD";
}

export function OffersSection({
  offers, total, regions, categories, companyId,
  onAdd, onEdit, onReload,
  filterRegionId, onFilterRegion,
  filterCategoryId, onFilterCategory,
  uncategorizedOnly, onUncategorizedOnly,
  page, onPageChange, pageSize,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [recategorizing, setRecategorizing] = useState(false);

  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const regionById = Object.fromEntries(regions.map((r) => [r.id, r]));
  const totalPages = Math.ceil(total / pageSize);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === offers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(offers.map((o) => o.id)));
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkCategoryId || selected.size === 0) return;
    setBulkSaving(true);
    try {
      await api.patch("/offers/bulk-update", {
        offer_ids: Array.from(selected),
        category_id: Number(bulkCategoryId),
      });
      setSelected(new Set());
      setBulkCategoryId("");
      onReload();
    } catch {}
    setBulkSaving(false);
  };

  const handleRecategorize = async () => {
    setRecategorizing(true);
    try {
      await api.post("/offers/recategorize", { company_id: companyId });
      onReload();
    } catch {}
    setRecategorizing(false);
  };

  return (
    <section className="bg-white rounded-lg border mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">Офферы</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{total} всего</span>
          <button onClick={onAdd} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            + Добавить
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b bg-gray-50/50 flex flex-wrap items-center gap-3 text-sm">
        <select
          value={filterRegionId ?? ""}
          onChange={(e) => { onFilterRegion(e.target.value ? Number(e.target.value) : null); onPageChange(0); }}
          className="px-2 py-1 border rounded text-sm"
        >
          <option value="">Все регионы</option>
          {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select
          value={filterCategoryId ?? ""}
          onChange={(e) => { onFilterCategory(e.target.value ? Number(e.target.value) : null); onPageChange(0); }}
          className="px-2 py-1 border rounded text-sm"
        >
          <option value="">Все категории</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input type="checkbox" checked={uncategorizedOnly} onChange={(e) => { onUncategorizedOnly(e.target.checked); onPageChange(0); }} />
          Без категории
        </label>
        <button
          onClick={handleRecategorize}
          disabled={recategorizing}
          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          {recategorizing ? "..." : "Перекатегоризировать"}
        </button>
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="px-4 py-2 border-b bg-blue-50 flex items-center gap-3 text-sm">
          <span className="text-blue-600 font-medium">{selected.size} выбрано</span>
          <select
            value={bulkCategoryId}
            onChange={(e) => setBulkCategoryId(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="">Категория...</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            onClick={handleBulkUpdate}
            disabled={!bulkCategoryId || bulkSaving}
            className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
          >
            {bulkSaving ? "..." : "Применить"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Сбросить
          </button>
        </div>
      )}

      {/* Table */}
      {offers.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          Нет офферов. Добавьте вручную или дождитесь автосбора.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input type="checkbox" checked={selected.size === offers.length && offers.length > 0}
                    onChange={toggleAll} />
                </th>
                <th className="text-left px-3 py-2">Название</th>
                <th className="text-left px-3 py-2">SKU</th>
                <th className="text-right px-3 py-2">Цена</th>
                <th className="text-right px-3 py-2">Стар.</th>
                <th className="text-center px-2 py-2">Нал.</th>
                <th className="text-left px-3 py-2">Категория</th>
                <th className="text-left px-3 py-2">Регион</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                  </td>
                  <td className="px-3 py-2 max-w-[200px] truncate">
                    {o.url ? (
                      <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {o.name}
                      </a>
                    ) : o.name}
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs font-mono">{o.sku || "\u2014"}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtPrice(o.price)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-400 line-through">
                    {o.price_old ? fmtPrice(o.price_old) : ""}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      o.is_available === null ? "bg-gray-300" : o.is_available ? "bg-green-500" : "bg-red-400"
                    }`} title={o.is_available === null ? "Неизвестно" : o.is_available ? "В наличии" : "Нет"} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {o.category_id ? (
                      <span className={o.category_source === "manual" ? "text-blue-600 font-medium" : "text-gray-500"}>
                        {catById[o.category_id]?.name ?? `#${o.category_id}`}
                      </span>
                    ) : (
                      <span className="text-gray-300">--</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{regionById[o.region_id]?.name ?? ""}</td>
                  <td className="px-1 py-2">
                    <button onClick={() => onEdit(o)} className="text-gray-400 hover:text-blue-600 text-sm">&#9998;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t flex items-center justify-center gap-2 text-sm">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
            className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            &larr;
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p = i;
            if (totalPages > 7) {
              if (page < 3) p = i;
              else if (page > totalPages - 4) p = totalPages - 7 + i;
              else p = page - 3 + i;
            }
            return (
              <button key={p} onClick={() => onPageChange(p)}
                className={`px-2 py-1 rounded text-xs ${p === page ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}>
                {p + 1}
              </button>
            );
          })}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30"
          >
            &rarr;
          </button>
        </div>
      )}
    </section>
  );
}
