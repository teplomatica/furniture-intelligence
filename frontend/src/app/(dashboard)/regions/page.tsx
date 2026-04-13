"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { RegionForm } from "@/components/RegionForm";

interface Region {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  city_firecrawl: string | null;
}

export default function RegionsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRegion, setEditRegion] = useState<Region | null>(null);

  const loadRegions = useCallback(() => {
    api.get<Region[]>("/regions?active_only=false")
      .then(setRegions)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRegions(); }, [loadRegions]);

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Регионы</h1>
        <button
          onClick={() => { setEditRegion(null); setFormOpen(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          + Добавить
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">Название</th>
              <th className="text-left px-4 py-2">Slug</th>
              <th className="text-left px-4 py-2">Порядок</th>
              <th className="text-left px-4 py-2">Статус</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 font-mono text-gray-500">{r.slug}</td>
                <td className="px-4 py-2 text-gray-500">{r.sort_order}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${r.is_active ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                    {r.is_active ? "Активен" : "Неактивен"}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <button
                    onClick={() => { setEditRegion(r); setFormOpen(true); }}
                    className="text-gray-400 hover:text-blue-600 text-sm"
                  >
                    &#9998;
                  </button>
                </td>
              </tr>
            ))}
            {regions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Нет регионов</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RegionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadRegions}
        editRegion={editRegion}
      />
    </div>
  );
}
