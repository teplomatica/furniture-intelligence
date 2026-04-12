"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { LegalEntityForm } from "@/components/LegalEntityForm";

interface Company {
  id: number;
  name: string;
  website: string | null;
  segment_group: string;
}

interface LegalEntity {
  id: number;
  company_id: number;
  inn: string | null;
  ogrn: string | null;
  legal_name: string;
  address: string | null;
  region: string | null;
  founded_year: number | null;
  manager_name: string | null;
  is_primary: boolean;
}

interface DiscoverResult {
  discovered: number;
  skipped: number;
  details: Array<{ company: string; status: string; legal_name?: string; inn?: string; error?: string; method?: string }>;
}

const SEGMENT_LABELS: Record<string, string> = {
  federal: "А: Федеральные сети",
  online: "Б: Онлайн-ритейлеры",
  premium: "В: Премиум",
  marketplace: "Г: Маркетплейсы",
};

export default function LegalEntitiesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<DiscoverResult | null>(null);
  const [discoveringCompany, setDiscoveringCompany] = useState<number | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      api.get<Company[]>("/companies?active_only=false"),
      api.get<LegalEntity[]>("/legal-entities"),
    ])
      .then(([c, le]) => { setCompanies(c); setEntities(le); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const entitiesByCompany = entities.reduce<Record<number, LegalEntity[]>>((acc, le) => {
    (acc[le.company_id] ||= []).push(le);
    return acc;
  }, {});

  const groupedCompanies = companies.reduce<Record<string, Company[]>>((acc, c) => {
    (acc[c.segment_group] ||= []).push(c);
    return acc;
  }, {});

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Юридические лица</h1>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setDiscovering(true);
              setDiscoverResult(null);
              try {
                const result = await api.post<DiscoverResult>("/legal-entities/auto-discover", {});
                setDiscoverResult(result);
                loadData();
              } catch { }
              setDiscovering(false);
            }}
            disabled={discovering}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {discovering ? "Поиск..." : "Автопоиск DataNewton"}
          </button>
          <button
            onClick={() => setFormOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            + Добавить
          </button>
        </div>
      </div>

      {discoverResult && (
        <div className="mb-6 bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-2">
            Результат: найдено {discoverResult.discovered}, пропущено {discoverResult.skipped}
          </h3>
          <div className="space-y-1 text-sm max-h-48 overflow-y-auto">
            {discoverResult.details.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={d.status === "found" ? "text-green-600" : d.status === "error" ? "text-red-500" : "text-gray-400"}>
                  {d.status === "found" ? "+" : d.status === "error" ? "!" : "—"}
                </span>
                <span className="font-medium">{d.company}</span>
                {d.legal_name && <span className="text-gray-500">→ {d.legal_name}</span>}
                {d.inn && <span className="text-gray-400 font-mono text-xs">ИНН: {d.inn}</span>}
                {d.method && <span className="text-blue-400 text-xs">({d.method})</span>}
                {d.error && <span className="text-red-400 text-xs">{d.error}</span>}
              </div>
            ))}
          </div>
          <button onClick={() => setDiscoverResult(null)} className="mt-2 text-xs text-gray-400 hover:text-gray-600">Закрыть</button>
        </div>
      )}

      {Object.entries(SEGMENT_LABELS).map(([group, label]) => {
        const groupCompanies = groupedCompanies[group] || [];
        if (groupCompanies.length === 0) return null;
        return (
          <section key={group} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">{label}</h2>
            <div className="space-y-2">
              {groupCompanies.map((company) => {
                const les = entitiesByCompany[company.id] || [];
                return (
                  <div key={company.id} className="bg-white rounded-lg border">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{company.name}</span>
                        {company.website && (
                          <span className="ml-2 text-gray-400 text-xs">{company.website}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            setDiscoveringCompany(company.id);
                            try {
                              await api.post(`/legal-entities/discover/${company.id}`, {});
                              loadData();
                            } catch { }
                            setDiscoveringCompany(null);
                          }}
                          disabled={discoveringCompany === company.id}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded hover:bg-green-50 hover:text-green-600 disabled:opacity-50"
                        >
                          {discoveringCompany === company.id ? "..." : "Найти ЮЛ"}
                        </button>
                        <span className="text-xs text-gray-400">
                          {les.length === 0 ? "нет юрлиц" : `${les.length} юрлиц`}
                        </span>
                      </div>
                    </div>
                    {les.length > 0 && (
                      <div className="border-t">
                        {les.map((le) => (
                          <div key={le.id} className="px-4 py-2 flex items-center gap-4 text-sm hover:bg-gray-50 border-t border-gray-50 first:border-t-0">
                            <span className="text-gray-300 pl-2">└</span>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{le.legal_name}</span>
                              {le.is_primary && <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">основное</span>}
                            </div>
                            <span className="font-mono text-xs text-gray-500 whitespace-nowrap">{le.inn || "—"}</span>
                            <span className="text-xs text-gray-400 whitespace-nowrap w-20">{le.region || ""}</span>
                            <span className="text-xs text-gray-400 w-10">{le.founded_year || ""}</span>
                            <button
                              onClick={async () => {
                                if (confirm(`Удалить ${le.legal_name}?`)) {
                                  await api.delete(`/legal-entities/${le.id}`);
                                  setEntities(prev => prev.filter(e => e.id !== le.id));
                                }
                              }}
                              className="text-gray-300 hover:text-red-500"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <LegalEntityForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadData}
      />
    </div>
  );
}
