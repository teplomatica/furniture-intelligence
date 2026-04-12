"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { CompanyForm } from "@/components/CompanyForm";

const SEGMENT_LABELS: Record<string, string> = {
  federal: "А: Федеральные сети",
  online: "Б: Онлайн-ритейлеры",
  premium: "В: Премиум",
  marketplace: "Г: Маркетплейсы",
};

const POSITIONING_LABELS: Record<string, string> = {
  budget: "Бюджет",
  mid: "Средний",
  premium: "Премиум",
};

interface Company {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  segment_group: string;
  positioning: string | null;
  notes: string | null;
  is_active: boolean;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);

  const loadCompanies = useCallback(() => {
    api.get<Company[]>("/companies?active_only=false")
      .then(setCompanies)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const grouped = companies.reduce<Record<string, Company[]>>((acc, c) => {
    (acc[c.segment_group] ||= []).push(c);
    return acc;
  }, {});

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Конкуренты</h1>
        <button
          onClick={() => { setEditCompany(null); setFormOpen(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          + Добавить
        </button>
      </div>

      {Object.entries(SEGMENT_LABELS).map(([group, label]) => {
        const items = grouped[group] || [];
        return (
          <section key={group} className="mb-8">
            <h2 className="text-lg font-semibold mb-3 text-gray-700">{label}</h2>
            {items.length === 0 ? (
              <p className="text-gray-400 text-sm">Нет данных</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2">Компания</th>
                      <th className="text-left px-4 py-2">Сайт</th>
                      <th className="text-left px-4 py-2">Позиционирование</th>
                      <th className="text-left px-4 py-2">Заметки</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{c.name}</td>
                        <td className="px-4 py-2">
                          {c.website ? (
                            <a href={`https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {c.website}
                            </a>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {c.positioning ? POSITIONING_LABELS[c.positioning] : "—"}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{c.notes || "—"}</td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => { setEditCompany(c); setFormOpen(true); }}
                            className="text-gray-400 hover:text-blue-600 text-sm"
                          >
                            ✎
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <CompanyForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadCompanies}
        editCompany={editCompany}
      />
    </div>
  );
}
