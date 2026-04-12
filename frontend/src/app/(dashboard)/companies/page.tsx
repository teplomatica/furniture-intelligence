"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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

  useEffect(() => {
    api.get<Company[]>("/companies")
      .then(setCompanies)
      .finally(() => setLoading(false));
  }, []);

  const grouped = companies.reduce<Record<string, Company[]>>((acc, c) => {
    (acc[c.segment_group] ||= []).push(c);
    return acc;
  }, {});

  if (loading) return <div className="p-8 text-gray-500">Загрузка...</div>;

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Конкуренты</h1>
      {Object.entries(SEGMENT_LABELS).map(([group, label]) => {
        const items = grouped[group] || [];
        return (
          <section key={group} className="mb-8">
            <h2 className="text-lg font-semibold mb-3 text-gray-700">{label}</h2>
            {items.length === 0 ? (
              <p className="text-gray-400 text-sm">Нет данных</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2">Компания</th>
                      <th className="text-left px-4 py-2">Сайт</th>
                      <th className="text-left px-4 py-2">Позиционирование</th>
                      <th className="text-left px-4 py-2">Заметки</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
