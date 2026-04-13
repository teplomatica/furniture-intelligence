"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { FinancialForm } from "@/components/FinancialForm";

interface Company {
  id: number;
  name: string;
  segment_group: string;
}

interface LegalEntity {
  id: number;
  company_id: number;
  legal_name: string;
  inn: string | null;
}

interface Financial {
  id: number;
  legal_entity_id: number;
  year: number;
  revenue: number | null;
  net_profit: number | null;
  ebitda: number | null;
  total_assets: number | null;
  employee_count: number | null;
  source: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  federal: "A: Федеральные сети",
  online: "Б: Онлайн-ритейлеры",
  premium: "В: Премиум",
  marketplace: "Г: Маркетплейсы",
};

function fmt(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("ru-RU");
}

export default function FinancialsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);
  const [financials, setFinancials] = useState<Financial[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Financial | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      api.get<Company[]>("/companies?active_only=false"),
      api.get<LegalEntity[]>("/legal-entities"),
      api.get<Financial[]>("/financials"),
    ])
      .then(([c, le, f]) => { setCompanies(c); setLegalEntities(le); setFinancials(f); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const leById = Object.fromEntries(legalEntities.map((le) => [le.id, le]));
  const lesByCompany = legalEntities.reduce<Record<number, LegalEntity[]>>((acc, le) => {
    (acc[le.company_id] ||= []).push(le);
    return acc;
  }, {});
  const finByLe = financials.reduce<Record<number, Financial[]>>((acc, f) => {
    (acc[f.legal_entity_id] ||= []).push(f);
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
        <h1 className="text-2xl font-bold">Финансы</h1>
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
                const les = lesByCompany[company.id] || [];
                const hasData = les.some((le) => (finByLe[le.id] || []).length > 0);
                if (les.length === 0) return null;

                return (
                  <div key={company.id} className="bg-white rounded-lg border">
                    <div className="px-4 py-3 font-semibold border-b bg-gray-50 rounded-t-lg">
                      {company.name}
                    </div>
                    {les.map((le) => {
                      const fins = finByLe[le.id] || [];
                      return (
                        <div key={le.id}>
                          <div className="px-4 py-2 text-sm text-gray-500 border-b bg-gray-50/50">
                            {le.legal_name}
                            {le.inn && <span className="ml-2 font-mono text-xs text-gray-400">ИНН: {le.inn}</span>}
                          </div>
                          {fins.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="text-gray-500 text-xs">
                                  <tr>
                                    <th className="text-left px-4 py-2">Год</th>
                                    <th className="text-right px-4 py-2">Выручка</th>
                                    <th className="text-right px-4 py-2">Чист. прибыль</th>
                                    <th className="text-right px-4 py-2">EBITDA</th>
                                    <th className="text-right px-4 py-2">Активы</th>
                                    <th className="text-right px-4 py-2">Сотр.</th>
                                    <th className="text-center px-4 py-2">Источник</th>
                                    <th className="w-10"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {fins.map((f) => (
                                    <tr key={f.id} className="border-t border-gray-50 hover:bg-gray-50">
                                      <td className="px-4 py-2 font-medium">{f.year}</td>
                                      <td className="px-4 py-2 text-right font-mono">{fmt(f.revenue)}</td>
                                      <td className={`px-4 py-2 text-right font-mono ${f.net_profit != null && f.net_profit < 0 ? "text-red-500" : ""}`}>
                                        {fmt(f.net_profit)}
                                      </td>
                                      <td className="px-4 py-2 text-right font-mono">{fmt(f.ebitda)}</td>
                                      <td className="px-4 py-2 text-right font-mono">{fmt(f.total_assets)}</td>
                                      <td className="px-4 py-2 text-right">{f.employee_count ?? "—"}</td>
                                      <td className="px-4 py-2 text-center">
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${f.source === "datanewton" ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-500"}`}>
                                          {f.source}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2">
                                        <button
                                          onClick={() => { setEditRecord(f); setFormOpen(true); }}
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
                            <div className="px-4 py-3 text-sm text-gray-400">Нет финансовых данных</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <FinancialForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadData}
        legalEntities={legalEntities}
        editRecord={editRecord}
      />
    </div>
  );
}
