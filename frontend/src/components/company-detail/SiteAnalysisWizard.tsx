"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { streamSSE, SSEEvent } from "@/lib/sse";
import { Spinner } from "@/components/Spinner";
import { Modal } from "@/components/Modal";

interface Region { id: number; name: string; }
interface Category { id: number; name: string; }

interface SiteCategory {
  site_name: string;
  site_url: string;
  our_category: { id: number; name: string } | null;
  subcategories: Array<{
    site_name: string;
    site_url: string;
    our_category: { id: number; name: string } | null;
  }>;
}

interface SiteRegions {
  has_region_selector: boolean;
  method: string;
  key: string | null;
  cities: Array<{
    site_name: string;
    site_value: string;
    our_region: { id: number; name: string } | null;
  }>;
  notes: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  companyId: number;
  regions: Region[];
  categories: Category[];
  onApplied: () => void;
}

type WizardStep = "analyzing" | "mapping" | "applying" | "done";

export function SiteAnalysisWizard({ open, onClose, companyId, regions, categories, onApplied }: Props) {
  const [step, setStep] = useState<WizardStep>("analyzing");
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analysis results
  const [siteCategories, setSiteCategories] = useState<SiteCategory[]>([]);
  const [siteRegions, setSiteRegions] = useState<SiteRegions | null>(null);

  // Mapping state
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [categoryMappings, setCategoryMappings] = useState<Record<string, number>>({});
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [cityRegionMappings, setCityRegionMappings] = useState<Record<string, number>>({});

  const [applying, setApplying] = useState(false);

  const startAnalysis = async () => {
    setAnalyzing(true);
    setEvents([]);
    setError(null);
    setSiteCategories([]);
    setSiteRegions(null);
    setStep("analyzing");

    await streamSSE(`/companies/${companyId}/analyze`, {}, (event) => {
      setEvents((prev) => [...prev, event]);

      if (event.step === "categories_done" && event.categories) {
        const cats = event.categories as SiteCategory[];
        setSiteCategories(cats);
        // Pre-select all URLs and auto-mappings
        const urls = new Set<string>();
        const mappings: Record<string, number> = {};
        for (const cat of cats) {
          if (cat.site_url) {
            urls.add(cat.site_url);
            if (cat.our_category) mappings[cat.site_url] = cat.our_category.id;
          }
          for (const sub of cat.subcategories || []) {
            if (sub.site_url) {
              urls.add(sub.site_url);
              if (sub.our_category) mappings[sub.site_url] = sub.our_category.id;
            }
          }
        }
        setSelectedUrls(urls);
        setCategoryMappings(mappings);
      }

      if (event.step === "regions_done" && event.regions) {
        const regs = event.regions as SiteRegions;
        setSiteRegions(regs);
        // Pre-select auto-matched cities
        const cities = new Set<string>();
        const mappings: Record<string, number> = {};
        for (const city of regs.cities) {
          if (city.our_region) {
            cities.add(city.site_value);
            mappings[city.site_value] = city.our_region.id;
          }
        }
        setSelectedCities(cities);
        setCityRegionMappings(mappings);
      }

      if (event.step === "complete") {
        setStep("mapping");
      }
      if (event.step === "error") {
        setError(event.message);
      }
    });

    setAnalyzing(false);
  };

  const handleApply = async () => {
    if (!siteRegions) return;
    setApplying(true);

    const catMappings = Array.from(selectedUrls).map((url) => ({
      site_url: url,
      our_category_id: categoryMappings[url] || null,
    }));

    const cityMappings = Array.from(selectedCities)
      .filter((v) => cityRegionMappings[v])
      .map((v) => ({
        site_value: v,
        our_region_id: cityRegionMappings[v],
      }));

    try {
      await api.post(`/companies/${companyId}/apply-analysis`, {
        categories: catMappings,
        region_method: siteRegions.method,
        region_key: siteRegions.key,
        cities: cityMappings.length > 0 ? cityMappings : [{ site_value: "", our_region_id: regions[0]?.id }],
      });
      setStep("done");
      onApplied();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const toggleUrl = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const toggleCity = (value: string) => {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  // Auto-start analysis when wizard opens
  if (open && !analyzing && events.length === 0 && step === "analyzing") {
    startAnalysis();
  }

  return (
    <Modal open={open} onClose={onClose} title="Автонастройка парсинга">
      <div className="max-h-[70vh] overflow-y-auto space-y-4">

        {/* Analysis progress */}
        {step === "analyzing" && (
          <div className="space-y-1">
            {events.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span>{
                  e.step === "error" ? "\u26A0\uFE0F" :
                  e.step?.includes("done") || e.step === "complete" ? "\u2705" :
                  e.step?.includes("found") ? "\uD83D\uDCCB" :
                  "\uD83D\uDD0D"
                }</span>
                <span className={e.step === "error" ? "text-red-500" : "text-gray-600"}>{e.message}</span>
                {analyzing && i === events.length - 1 && !["complete", "error"].includes(e.step || "") && (
                  <Spinner className="text-gray-400" />
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Mapping step */}
        {step === "mapping" && (
          <>
            {/* Categories */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                {"Категории (" + selectedUrls.size + " выбрано)"}
              </h3>
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {/* Select all header */}
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-50 border-b sticky top-0">
                  <input
                    type="checkbox"
                    checked={selectedUrls.size === siteCategories.flatMap((c) => [c, ...(c.subcategories || [])]).filter((i) => i.site_url).length && selectedUrls.size > 0}
                    onChange={() => {
                      const allUrls = siteCategories.flatMap((c) => {
                        const urls = c.site_url ? [c.site_url] : [];
                        for (const s of c.subcategories || []) { if (s.site_url) urls.push(s.site_url); }
                        return urls;
                      });
                      if (selectedUrls.size === allUrls.length) {
                        setSelectedUrls(new Set());
                      } else {
                        setSelectedUrls(new Set(allUrls));
                      }
                    }}
                  />
                  <span className="flex-1 font-medium text-gray-500">{"Выбрать все"}</span>
                  <span className="text-gray-400 w-36 text-center">{"Наша категория"}</span>
                  <span className="text-gray-400 w-[120px] text-center">{"URL"}</span>
                </div>
                <div className="divide-y">
                  {siteCategories.flatMap((cat) => {
                    const items = [{ name: cat.site_name, url: cat.site_url, match: cat.our_category }];
                    for (const sub of cat.subcategories || []) {
                      items.push({ name: sub.site_name, url: sub.site_url, match: sub.our_category });
                    }
                    return items;
                  }).filter((item) => item.url).map((item) => (
                    <div key={item.url} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50">
                      <input type="checkbox" checked={selectedUrls.has(item.url)} onChange={() => toggleUrl(item.url)} />
                      <span className="flex-1 font-medium">{item.name}</span>
                      <select
                        value={categoryMappings[item.url] || ""}
                        onChange={(e) => setCategoryMappings((prev) => ({ ...prev, [item.url]: Number(e.target.value) }))}
                        className="px-1 py-0.5 border rounded text-xs w-36"
                      >
                        <option value="">{"--"}</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <span className="text-gray-400 text-[10px] w-[120px] truncate text-right">{item.url}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Regions */}
            {siteRegions && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Регионы
                  {siteRegions.has_region_selector ? (
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {"метод: " + siteRegions.method + ", ключ: " + (siteRegions.key || "\u2014")}
                    </span>
                  ) : (
                    <span className="ml-2 text-xs font-normal text-orange-500">выбор региона не обнаружен</span>
                  )}
                </h3>
                {siteRegions.notes && (
                  <p className="text-xs text-gray-400 mb-2">{siteRegions.notes}</p>
                )}
                {siteRegions.cities.length > 0 ? (
                  <div className="border rounded-lg max-h-36 overflow-y-auto">
                    {/* Select all header */}
                    <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-50 border-b sticky top-0">
                      <input
                        type="checkbox"
                        checked={selectedCities.size === siteRegions.cities.length && selectedCities.size > 0}
                        onChange={() => {
                          const allValues = siteRegions.cities.map((c) => c.site_value);
                          if (selectedCities.size === allValues.length) {
                            setSelectedCities(new Set());
                          } else {
                            setSelectedCities(new Set(allValues));
                          }
                        }}
                      />
                      <span className="flex-1 font-medium text-gray-500">{"Выбрать все"}</span>
                      <span className="text-gray-400 w-20 text-center">{"Значение"}</span>
                      <span className="text-gray-400 w-36 text-center">{"Наш регион"}</span>
                    </div>
                    <div className="divide-y">
                      {siteRegions.cities.map((city) => (
                        <div key={city.site_value} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50">
                          <input type="checkbox" checked={selectedCities.has(city.site_value)} onChange={() => toggleCity(city.site_value)} />
                          <span className="flex-1 font-medium">{city.site_name}</span>
                          <span className="text-gray-400 font-mono w-20 text-center">{city.site_value}</span>
                          <select
                            value={cityRegionMappings[city.site_value] || ""}
                            onChange={(e) => setCityRegionMappings((prev) => ({ ...prev, [city.site_value]: Number(e.target.value) }))}
                            className="px-1 py-0.5 border rounded text-xs w-36"
                          >
                            <option value="">{"--"}</option>
                            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Города не найдены. Конфиг будет создан без региона.</p>
                )}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => { setStep("analyzing"); setEvents([]); startAnalysis(); }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">
                Перезапустить анализ
              </button>
              <button onClick={handleApply} disabled={applying || selectedUrls.size === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                {applying ? "Применение..." : `Применить (${selectedUrls.size} URL, ${selectedCities.size} регионов)`}
              </button>
            </div>
          </>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="text-center py-4">
            <p className="text-green-600 font-medium mb-2">Настройки парсинга созданы</p>
            <p className="text-sm text-gray-500 mb-4">Теперь можно запустить сбор офферов через "Обновить данные"</p>
            <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              Закрыть
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
