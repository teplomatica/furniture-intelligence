"use client";
import { useState, useEffect, useCallback } from "react";
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

interface ScrapeTask {
  id: number;
  retailer_category_id: number;
  region_id: number;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  progress_current: number;
  progress_total: number | null;
  offers_created: number;
  offers_updated: number;
  error_message: string | null;
  retailer_category_name: string | null;
  region_name: string | null;
}

interface Props {
  offers: Offer[];
  total: number;
  regions: Region[];
  categories: Category[];
  companyId: number;
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

const STATUS_LABEL: Record<string, string> = {
  queued: "ожидание",
  running: "выполняется",
  done: "готово",
  failed: "ошибка",
  cancelled: "отменено",
};

export function OffersSection({
  offers, total, regions, categories, companyId,
  onEdit, onReload,
  filterRegionId, onFilterRegion,
  filterCategoryId, onFilterCategory,
  uncategorizedOnly, onUncategorizedOnly,
  page, onPageChange, pageSize,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tasks, setTasks] = useState<ScrapeTask[]>([]);
  const [showCompleted, setShowCompleted] = useState(true);

  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const regionById = Object.fromEntries(regions.map((r) => [r.id, r]));
  const totalPages = Math.ceil(total / pageSize);

  // Polling for active tasks
  const loadTasks = useCallback(async () => {
    try {
      const res = await api.get<ScrapeTask[]>(`/companies/${companyId}/scrape-tasks`);
      setTasks(res);
    } catch {}
  }, [companyId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    const hasActive = tasks.some((t) => t.status === "queued" || t.status === "running");
    if (!hasActive) return;
    const interval = setInterval(() => {
      loadTasks();
      onReload();
    }, 2000);
    return () => clearInterval(interval);
  }, [tasks, loadTasks, onReload]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === offers.length) setSelected(new Set());
    else setSelected(new Set(offers.map((o) => o.id)));
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

  const handleStart = async () => {
    setStarting(true);
    try {
      await api.post(`/companies/${companyId}/scrape-tasks/start`, {});
      await loadTasks();
    } catch (e: any) {
      alert(e.message || "Ошибка запуска");
    }
    setStarting(false);
  };

  const handleCancel = async (taskId: number) => {
    await api.post(`/scrape-tasks/${taskId}/cancel`, {});
    await loadTasks();
  };

  const handleRetry = async (taskId: number) => {
    await api.post(`/scrape-tasks/${taskId}/retry`, {});
    await loadTasks();
  };

  const visibleTasks = showCompleted ? tasks : tasks.filter((t) => t.status === "queued" || t.status === "running");
  const hasActiveTasks = tasks.some((t) => t.status === "queued" || t.status === "running");

  return (
    <section className="bg-white rounded-lg border mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">{"Офферы"}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{total + " всего"}</span>
          {hasActiveTasks && (
            <button
              onClick={async () => {
                if (!confirm("Остановить все активные задачи?")) return;
                await api.post(`/companies/${companyId}/scrape-tasks/cancel-all`, {});
                loadTasks();
              }}
              className="text-xs px-3 py-1 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
            >
              {"\u25A0 Остановить всё"}
            </button>
          )}
          <button
            onClick={handleStart}
            disabled={starting}
            className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            {starting ? "..." : (<><span>{"\u25B6"}</span>{"Начать парсинг"}</>)}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b bg-gray-50/50 flex flex-wrap items-center gap-3 text-sm">
        <select value={filterRegionId ?? ""} onChange={(e) => { onFilterRegion(e.target.value ? Number(e.target.value) : null); onPageChange(0); }}
          className="px-2 py-1 border rounded text-sm">
          <option value="">{"Все регионы"}</option>
          {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={filterCategoryId ?? ""} onChange={(e) => { onFilterCategory(e.target.value ? Number(e.target.value) : null); onPageChange(0); }}
          className="px-2 py-1 border rounded text-sm">
          <option value="">{"Все категории"}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input type="checkbox" checked={uncategorizedOnly} onChange={(e) => { onUncategorizedOnly(e.target.checked); onPageChange(0); }} />
          {"Без категории"}
        </label>
      </div>

      {/* Tasks panel */}
      {visibleTasks.length > 0 && (
        <div className="px-4 py-3 border-b bg-gray-50/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">{"Задачи парсинга"}</span>
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              {hasActiveTasks && <span>{"обновление каждые 2 сек"}</span>}
              <button onClick={() => setShowCompleted(!showCompleted)} className="hover:text-gray-600">
                {showCompleted ? "Скрыть завершённые" : "Показать все"}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {visibleTasks.map((t) => {
              const label = `${t.retailer_category_name || "?"} × ${t.region_name || "?"}`;
              const isRunning = t.status === "running";
              const pct = t.progress_total ? (t.progress_current / t.progress_total) * 100 : (isRunning ? 33 : 0);
              return (
                <div key={t.id} className={`px-3 py-2 rounded text-xs flex items-center gap-3 ${t.status === "failed" ? "bg-red-50" : "bg-white border"}`}>
                  <span className="w-3">
                    {t.status === "running" && <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />}
                    {t.status === "queued" && <span className="text-gray-400">{"\u23F3"}</span>}
                    {t.status === "done" && <span className="text-green-600">{"\u2713"}</span>}
                    {t.status === "cancelled" && <span className="text-gray-400">{"\u2715"}</span>}
                    {t.status === "failed" && <span className="text-red-500">{"\u26A0"}</span>}
                  </span>
                  <span className="w-44 truncate">{label}</span>
                  {isRunning && (
                    <div className="flex-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {!isRunning && <span className="flex-1 text-gray-400">{STATUS_LABEL[t.status]}</span>}
                  {isRunning && <span className="text-gray-500 w-20">{`стр. ${t.progress_current}${t.progress_total ? "/" + t.progress_total : ""}`}</span>}
                  {(t.offers_created > 0 || t.offers_updated > 0) && (
                    <span className="text-green-600 font-medium">{`+${t.offers_created}`}{t.offers_updated > 0 && ` (${t.offers_updated})`}</span>
                  )}
                  {t.status === "failed" && (
                    <>
                      <span className="text-red-500 max-w-[200px] truncate" title={t.error_message || ""}>{t.error_message}</span>
                      <button onClick={() => handleRetry(t.id)} className="text-[11px] px-2 py-0.5 border border-red-300 text-red-600 rounded hover:bg-red-50">
                        {"повторить"}
                      </button>
                    </>
                  )}
                  {(t.status === "queued" || t.status === "running") && (
                    <button onClick={() => handleCancel(t.id)} className="text-gray-300 hover:text-red-500">{"\u2715"}</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="px-4 py-2 border-b bg-blue-50 flex items-center gap-3 text-sm">
          <span className="text-blue-600 font-medium">{selected.size + " выбрано"}</span>
          <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)} className="px-2 py-1 border rounded text-sm">
            <option value="">{"Категория..."}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={handleBulkUpdate} disabled={!bulkCategoryId || bulkSaving}
            className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50">
            {bulkSaving ? "..." : "Применить"}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-600">{"Сбросить"}</button>
        </div>
      )}

      {/* Offers table */}
      {offers.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">{"Нет офферов. Нажмите \u00ABНачать парсинг\u00BB для сбора данных."}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input type="checkbox" checked={selected.size === offers.length && offers.length > 0} onChange={toggleAll} />
                </th>
                <th className="text-left px-3 py-2">{"Название"}</th>
                <th className="text-right px-3 py-2">{"Цена"}</th>
                <th className="text-right px-3 py-2">{"Стар."}</th>
                <th className="text-center px-2 py-2">{"Нал."}</th>
                <th className="text-left px-3 py-2">{"Категория"}</th>
                <th className="text-left px-3 py-2">{"Регион"}</th>
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
                    {o.url ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{o.name}</a> : o.name}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{fmtPrice(o.price)}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-400 line-through">{o.price_old ? fmtPrice(o.price_old) : ""}</td>
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${o.is_available === null ? "bg-gray-300" : o.is_available ? "bg-green-500" : "bg-red-400"}`} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {o.category_id ? (
                      <span className={o.category_source === "manual" ? "text-blue-600 font-medium" : "text-gray-500"}>
                        {catById[o.category_id]?.name ?? `#${o.category_id}`}
                      </span>
                    ) : <span className="text-gray-300">{"\u2014"}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{regionById[o.region_id]?.name ?? ""}</td>
                  <td className="px-1 py-2">
                    <button onClick={() => onEdit(o)} className="text-gray-400 hover:text-blue-600 text-sm">{"\u270E"}</button>
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
          <button onClick={() => onPageChange(page - 1)} disabled={page === 0} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30">{"\u2190"}</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p = i;
            if (totalPages > 7) {
              if (page < 3) p = i;
              else if (page > totalPages - 4) p = totalPages - 7 + i;
              else p = page - 3 + i;
            }
            return (
              <button key={p} onClick={() => onPageChange(p)}
                className={`px-2 py-1 rounded text-xs ${p === page ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}>{p + 1}</button>
            );
          })}
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30">{"\u2192"}</button>
        </div>
      )}
    </section>
  );
}
