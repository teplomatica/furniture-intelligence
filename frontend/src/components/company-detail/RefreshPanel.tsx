"use client";
import { useState } from "react";
import { streamSSE, SSEEvent } from "@/lib/sse";
import { Spinner } from "@/components/Spinner";

const STEP_ICONS: Record<string, string> = {
  start: "\u25B6",
  scraping: "\uD83D\uDD0D",
  scraped: "\uD83D\uDCC4",
  searching: "\uD83D\uDD0E",
  fetching: "\uD83D\uDD0E",
  configuring: "\u2699\uFE0F",
  parsing: "\uD83D\uDCCB",
  cache_hit: "\uD83D\uDCE6",
  saving: "\uD83D\uDCBE",
  done: "\u2705",
  complete: "\u2705",
  not_found: "\u274C",
  skipped: "\u23ED",
  error: "\u26A0\uFE0F",
  debug_limit: "\uD83D\uDEA7",
};

interface Region { id: number; name: string; }

interface Props {
  companyId: number;
  hasLegalEntities: boolean;
  hasOgrn: boolean;
  hasScrapingConfig: boolean;
  regions: Region[];
  onClose: () => void;
  onComplete: () => void;
}

export function RefreshPanel({ companyId, hasLegalEntities, hasOgrn, hasScrapingConfig, regions, onClose, onComplete }: Props) {
  const [sections, setSections] = useState<Record<string, boolean>>({
    legal_entities: !hasLegalEntities,
    financials: hasLegalEntities && hasOgrn,
    offers: false,
  });
  const [offerRegionId, setOfferRegionId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<SSEEvent[]>([]);

  const toggleSection = (key: string) => {
    if (running) return;
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRefresh = async () => {
    const selected = Object.entries(sections)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (selected.length === 0) return;

    setRunning(true);
    setEvents([]);

    const body: any = { sections: selected };
    if (selected.includes("offers") && offerRegionId) {
      body.region_id = Number(offerRegionId);
    }

    await streamSSE(`/companies/${companyId}/refresh`, body, (event) => {
      setEvents((prev) => [...prev, event]);
    });

    setRunning(false);
    onComplete();
  };

  return (
    <div className="bg-white rounded-lg border mb-6">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">Обновить данные</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
      </div>
      <div className="p-4">
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sections.legal_entities || false}
              onChange={() => toggleSection("legal_entities")}
              disabled={running}
            />
            <span>Юрлица (автопоиск)</span>
            {hasLegalEntities && (
              <span className="text-xs text-gray-400">уже есть</span>
            )}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sections.financials || false}
              onChange={() => toggleSection("financials")}
              disabled={running || !hasLegalEntities}
            />
            <span>Финансы (DataNewton)</span>
            {!hasLegalEntities && (
              <span className="text-xs text-gray-400">сначала добавьте юрлица</span>
            )}
            {hasLegalEntities && !hasOgrn && (
              <span className="text-xs text-gray-400">нет ОГРН</span>
            )}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" disabled />
            <span>Трафик</span>
            <span className="text-xs">нет автоисточника</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" disabled />
            <span>Ассортимент</span>
            <span className="text-xs">нет автоисточника</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sections.offers || false}
              onChange={() => toggleSection("offers")}
              disabled={running || !hasScrapingConfig}
            />
            <span>Офферы (Firecrawl)</span>
            {!hasScrapingConfig && (
              <span className="text-xs text-gray-400">настройте парсинг</span>
            )}
          </label>
          {sections.offers && (
            <div className="ml-6">
              <select value={offerRegionId} onChange={(e) => setOfferRegionId(e.target.value)}
                className="px-2 py-1 border rounded text-xs" disabled={running}>
                <option value="">Все регионы</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {!running && events.length === 0 && (
          <button
            onClick={handleRefresh}
            disabled={!Object.values(sections).some(Boolean)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            Обновить выбранные
          </button>
        )}

        {events.length > 0 && (
          <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
            {events.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span>{STEP_ICONS[e.step] || "\u00B7"}</span>
                {e.section && e.section !== "all" && (
                  <span className="text-gray-400 w-20 shrink-0">
                    {e.section === "legal_entities" ? "ЮЛ" : e.section === "financials" ? "Финансы" : e.section === "offers" ? "Офферы" : e.section}
                  </span>
                )}
                <span
                  className={
                    e.step === "done" || e.step === "complete"
                      ? "text-green-600 font-medium"
                      : e.step === "error"
                      ? "text-red-500"
                      : e.step === "not_found"
                      ? "text-orange-500"
                      : e.step === "skipped"
                      ? "text-gray-400"
                      : e.step === "debug_limit"
                      ? "text-yellow-600 font-medium"
                      : "text-gray-600"
                  }
                >
                  {e.message}
                </span>
                {running && i === events.length - 1 && !["done", "error", "not_found", "skipped", "complete"].includes(e.step) && (
                  <Spinner className="text-gray-400" />
                )}
              </div>
            ))}
          </div>
        )}

        {!running && events.length > 0 && (
          <button
            onClick={handleRefresh}
            disabled={!Object.values(sections).some(Boolean)}
            className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            Обновить ещё раз
          </button>
        )}
      </div>
    </div>
  );
}
