"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { CompanyForm } from "@/components/CompanyForm";

interface Channel { id: number; name: string; }
interface Positioning { id: number; name: string; }

interface Company {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  websites: string[] | null;
  segment_group: string;
  positioning: string | null;
  notes: string | null;
  is_active: boolean;
  is_self: boolean;
  channel_id: number | null;
  positioning_id: number | null;
}

interface CountItem {
  company_id?: number;
  legal_entity_id?: number;
  id: number;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [leCounts, setLeCounts] = useState<Record<number, number>>({});
  const [finCounts, setFinCounts] = useState<Record<number, number>>({});
  const [trafficCounts, setTrafficCounts] = useState<Record<number, number>>({});
  const [assortCounts, setAssortCounts] = useState<Record<number, number>>({});
  const [channels, setChannels] = useState<Channel[]>([]);
  const [positionings, setPositionings] = useState<Positioning[]>([]);

  const loadData = useCallback(() => {
    Promise.all([
      api.get<Company[]>("/companies?active_only=false"),
      api.get<CountItem[]>("/legal-entities"),
      api.get<CountItem[]>("/financials"),
      api.get<CountItem[]>("/traffic"),
      api.get<CountItem[]>("/assortment"),
      api.get<Channel[]>("/channels"),
      api.get<Positioning[]>("/positionings"),
    ])
      .then(([companies, les, fins, traffic, assort, chs, poss]) => {
        setChannels(chs);
        setPositionings(poss);
        setCompanies(companies);

        // Count legal entities per company
        const leMap: Record<number, number> = {};
        for (const le of les) {
          const cid = (le as any).company_id;
          leMap[cid] = (leMap[cid] || 0) + 1;
        }
        setLeCounts(leMap);

        // Count financials per company (via legal_entity → company mapping)
        const leToCompany: Record<number, number> = {};
        for (const le of les) {
          leToCompany[(le as any).id] = (le as any).company_id;
        }
        const finMap: Record<number, number> = {};
        for (const f of fins) {
          const cid = leToCompany[(f as any).legal_entity_id];
          if (cid) finMap[cid] = (finMap[cid] || 0) + 1;
        }
        setFinCounts(finMap);

        // Count traffic per company
        const trMap: Record<number, number> = {};
        for (const t of traffic) {
          const cid = (t as any).company_id;
          trMap[cid] = (trMap[cid] || 0) + 1;
        }
        setTrafficCounts(trMap);

        // Count assortment per company
        const aMap: Record<number, number> = {};
        for (const a of assort) {
          const cid = (a as any).company_id;
          aMap[cid] = (aMap[cid] || 0) + 1;
        }
        setAssortCounts(aMap);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const chById = Object.fromEntries(channels.map((c) => [c.id, c]));
  const posById = Object.fromEntries(positionings.map((p) => [p.id, p]));
  const selfCompanies = companies.filter((c) => c.is_self);
  const competitors = companies.filter((c) => !c.is_self);
  const grouped = competitors.reduce<Record<number | string, Company[]>>((acc, c) => {
    const key = c.channel_id || "unassigned";
    (acc[key] ||= []).push(c);
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

      {selfCompanies.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-gray-700">Мы</h2>
          <div className="overflow-x-auto rounded-lg border-2 border-blue-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Компания</th>
                  <th className="text-left px-4 py-2">Сайт</th>
                  <th className="text-left px-4 py-2">Позиционирование</th>
                  <th className="text-left px-4 py-2">Данные</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {selfCompanies.map((c) => (
                  <tr key={c.id} className="hover:bg-blue-50/50">
                    <td className="px-4 py-2">
                      <Link href={`/companies/${c.slug}`} className="font-medium text-blue-600 hover:underline">
                        {c.name}
                      </Link>
                      <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Мы</span>
                    </td>
                    <td className="px-4 py-2">
                      {c.website ? (
                        <a href={`https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:underline">
                          {c.website}
                        </a>
                      ) : "\u2014"}
                    </td>
                    <td className="px-4 py-2">{c.positioning_id ? posById[c.positioning_id]?.name : "\u2014"}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${(leCounts[c.id] || 0) > 0 ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                          {leCounts[c.id] || 0} ЮЛ
                        </span>
                        <span className={`px-1.5 py-0.5 rounded ${(finCounts[c.id] || 0) > 0 ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-400"}`}>
                          {finCounts[c.id] || 0} фин
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={(e) => { e.stopPropagation(); setEditCompany(c); setFormOpen(true); }}
                        className="text-gray-400 hover:text-blue-600 text-sm">&#9998;</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {[...channels.map((ch) => ({ key: ch.id, label: ch.name })), ...(!grouped["unassigned"] ? [] : [{ key: "unassigned" as any, label: "Без канала" }])].map(({ key, label }) => {
        const items = grouped[key] || [];
        return (
          <section key={key} className="mb-8">
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
                      <th className="text-left px-4 py-2">Данные</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <Link href={`/companies/${c.slug}`} className="font-medium text-blue-600 hover:underline">
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          {c.website ? (
                            <a href={`https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:underline">
                              {c.website}
                            </a>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {c.positioning_id ? posById[c.positioning_id]?.name : "\u2014"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2 text-xs">
                            <span className={`px-1.5 py-0.5 rounded ${(leCounts[c.id] || 0) > 0 ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                              {leCounts[c.id] || 0} ЮЛ
                            </span>
                            <span className={`px-1.5 py-0.5 rounded ${(finCounts[c.id] || 0) > 0 ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-400"}`}>
                              {finCounts[c.id] || 0} фин
                            </span>
                            <span className={`px-1.5 py-0.5 rounded ${(trafficCounts[c.id] || 0) > 0 ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                              {trafficCounts[c.id] || 0} трафик
                            </span>
                            <span className={`px-1.5 py-0.5 rounded ${(assortCounts[c.id] || 0) > 0 ? "bg-orange-50 text-orange-600" : "bg-gray-100 text-gray-400"}`}>
                              {assortCounts[c.id] || 0} ассорт
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditCompany(c); setFormOpen(true); }}
                            className="text-gray-400 hover:text-blue-600 text-sm"
                          >
                            &#9998;
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
        onSaved={loadData}
        editCompany={editCompany}
      />
    </div>
  );
}
