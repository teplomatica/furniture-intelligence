"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { AssortmentForm } from "@/components/AssortmentForm";

interface Company {
  id: number;
  name: string;
  segment_group: string;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  level: number;
  parent_id: number | null;
}

interface Assortment {
  id: number;
  company_id: number;
  category_id: number;
  price_segment_id: number | null;
  sku_count: number | null;
  availability_pct: number | null;
  price_min: number | null;
  price_max: number | null;
  price_median: number | null;
  source: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  federal: "A: Федеральные сети",
  online: "Б: Онлайн-ритейлеры",
  premium: "В: Премиум",
  marketplace: "Г: Маркетплейсы",
};

function fmtPrice(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("ru-RU") + " \u20BD";
}

export default function AssortmentPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [assortment, setAssortment] = useState<Assortment[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Assortment | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      api.get<Company[]>("/companies?active_only=false"),
      api.get<Category[]>("/categories"),
      api.get<Assortment[]>("/assortment"),
    ])
      .then(([c, cat, a]) => { setCompanies(c); setCategories(cat); setAssortment(a); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const assortByCompany = assortment.reduce<Record<number, Assortment[]>>((acc, a) => {
    (acc[a.company_id] ||= []).push(a);
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
        <h1 className="text-2xl font-bold">Ассортимент</h1>
        <button
          onClick={() => { setEditRecord(null); setFormOpen(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          + Добавить
        </button>
      </div>

      {Object.entries(SEGMENT_LABELS).map(([group, label]) => {
        const groupCompanies = groupedCompanies[group] || [];
        if (groupCompanies.length === 0) return null;
        return (
          <section key={group} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">{label}</h2>
            <div className="space-y-3">
              {groupCompanies.map((company) => {
                const items = assortByCompany[company.id] || [];
                return (
                  <div key={company.id} className="bg-white rounded-lg border">
                    <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
                      <span className="font-semibold">{company.name}</span>
                      <span className="text-xs text-gray-400">
                        {items.length === 0 ? "нет данных" : `${items.length} позиций`}
                      </span>
                    </div>
                    {items.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-gray-500 text-xs">
                            <tr>
                              <th className="text-left px-4 py-2">Категория</th>
                              <th className="text-right px-4 py-2">SKU</th>
                              <th className="text-right px-4 py-2">Наличие</th>
                              <th className="text-right px-4 py-2">Мин. цена</th>
                              <th className="text-right px-4 py-2">Макс. цена</th>
                              <th className="text-right px-4 py-2">Медиана</th>
                              <th className="w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((a) => {
                              const cat = catById[a.category_id];
                              return (
                                <tr key={a.id} className="border-t border-gray-50 hover:bg-gray-50">
                                  <td className="px-4 py-2 font-medium">{cat?.name ?? `#${a.category_id}`}</td>
                                  <td className="px-4 py-2 text-right font-mono">{a.sku_count ?? "—"}</td>
                                  <td className="px-4 py-2 text-right">{a.availability_pct != null ? `${a.availability_pct}%` : "—"}</td>
                                  <td className="px-4 py-2 text-right font-mono">{fmtPrice(a.price_min)}</td>
                                  <td className="px-4 py-2 text-right font-mono">{fmtPrice(a.price_max)}</td>
                                  <td className="px-4 py-2 text-right font-mono">{fmtPrice(a.price_median)}</td>
                                  <td className="px-2 py-2">
                                    <button
                                      onClick={() => { setEditRecord(a); setFormOpen(true); }}
                                      className="text-gray-400 hover:text-blue-600 text-sm"
                                    >
                                      &#9998;
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-400">Нет данных по ассортименту</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <AssortmentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadData}
        companies={companies}
        categories={categories}
        editRecord={editRecord}
      />
    </div>
  );
}
