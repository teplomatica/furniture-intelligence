"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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

export default function LegalEntitiesPage() {
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<LegalEntity[]>("/legal-entities")
      .then(setEntities)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Юридические лица</h1>
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
    </div>
  );
}
