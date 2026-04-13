"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { TrafficForm } from "@/components/TrafficForm";

interface Company {
  id: number;
  name: string;
  website: string | null;
  segment_group: string;
}

interface Traffic {
  id: number;
  company_id: number;
  period: string;
  monthly_visits: number | null;
  bounce_rate: number | null;
  avg_visit_duration_sec: number | null;
  pages_per_visit: number | null;
  source: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  federal: "A: Федеральные сети",
  online: "Б: Онлайн-ритейлеры",
  premium: "В: Премиум",
  marketplace: "Г: Маркетплейсы",
};

function fmtVisits(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return v.toLocaleString("ru-RU");
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(1) + "%";
}

export default function TrafficPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [traffic, setTraffic] = useState<Traffic[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Traffic | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      api.get<Company[]>("/companies?active_only=false"),
      api.get<Traffic[]>("/traffic"),
    ])
      .then(([c, t]) => { setCompanies(c); setTraffic(t); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const trafficByCompany = traffic.reduce<Record<number, Traffic[]>>((acc, t) => {
    (acc[t.company_id] ||= []).push(t);
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
        <h1 className="text-2xl font-bold">Веб-трафик</h1>
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
                const items = trafficByCompany[company.id] || [];
                return (
                  <div key={company.id} className="bg-white rounded-lg border">
                    <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
                      <div>
                        <span className="font-semibold">{company.name}</span>
                        {company.website && (
                          <span className="ml-2 text-gray-400 text-xs">{company.website}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {items.length === 0 ? "нет данных" : `${items.length} записей`}
                      </span>
                    </div>
                    {items.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-gray-500 text-xs">
                            <tr>
                              <th className="text-left px-4 py-2">Период</th>
                              <th className="text-right px-4 py-2">Визиты</th>
                              <th className="text-right px-4 py-2">Bounce</th>
                              <th className="text-right px-4 py-2">Ср. время</th>
                              <th className="text-right px-4 py-2">Стр./визит</th>
                              <th className="w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((t) => (
                              <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50">
                                <td className="px-4 py-2 font-medium">{t.period}</td>
                                <td className="px-4 py-2 text-right font-mono">{fmtVisits(t.monthly_visits)}</td>
                                <td className="px-4 py-2 text-right">{fmtPct(t.bounce_rate)}</td>
                                <td className="px-4 py-2 text-right">{fmtDuration(t.avg_visit_duration_sec)}</td>
                                <td className="px-4 py-2 text-right">{t.pages_per_visit?.toFixed(1) ?? "—"}</td>
                                <td className="px-2 py-2">
                                  <button
                                    onClick={() => { setEditRecord(t); setFormOpen(true); }}
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
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-400">Нет данных по трафику</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <TrafficForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadData}
        companies={companies}
        editRecord={editRecord}
      />
    </div>
  );
}
