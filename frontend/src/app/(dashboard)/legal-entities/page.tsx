"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { LegalEntityForm } from "@/components/LegalEntityForm";

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
  details: Array<{ company: string; status: string; legal_name?: string; inn?: string; error?: string }>;
}

export default function LegalEntitiesPage() {
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<DiscoverResult | null>(null);

  const loadEntities = useCallback(() => {
    api.get<LegalEntity[]>("/legal-entities")
      .then(setEntities)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadEntities(); }, [loadEntities]);

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
                loadEntities();
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
            Результат автопоиска: найдено {discoverResult.discovered}, пропущено {discoverResult.skipped}
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
                {d.error && <span className="text-red-400 text-xs">{d.error}</span>}
              </div>
            ))}
          </div>
          <button onClick={() => setDiscoverResult(null)} className="mt-2 text-xs text-gray-400 hover:text-gray-600">Закрыть</button>
        </div>
      )}
      {entities.length === 0 ? (
        <p className="text-gray-400">Юрлица ещё не добавлены. Добавьте через API или интерфейс.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">Название</th>
                <th className="text-left px-4 py-2">ИНН</th>
                <th className="text-left px-4 py-2">ОГРН</th>
                <th className="text-left px-4 py-2">Регион</th>
                <th className="text-left px-4 py-2">Год основания</th>
                <th className="text-left px-4 py-2">Руководитель</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((le) => (
                <tr key={le.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">
                    {le.legal_name}
                    {le.is_primary && <span className="ml-2 text-xs text-blue-500">основное</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{le.inn || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{le.ogrn || "—"}</td>
                  <td className="px-4 py-2">{le.region || "—"}</td>
                  <td className="px-4 py-2">{le.founded_year || "—"}</td>
                  <td className="px-4 py-2">{le.manager_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LegalEntityForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadEntities}
      />
    </div>
  );
}
