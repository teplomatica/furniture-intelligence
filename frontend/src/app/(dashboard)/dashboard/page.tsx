"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Metric = "revenue" | "net_profit" | "ebitda";

interface YearData {
  revenue: number | null;
  net_profit: number | null;
  ebitda: number | null;
  employee_count: number | null;
}

interface CompanySummary {
  company_id: number;
  company_name: string;
  slug: string;
  segment_group: string;
  is_self: boolean;
  years: Record<number, YearData>;
}

const METRIC_LABELS: Record<Metric, string> = {
  revenue: "Выручка",
  net_profit: "Прибыль",
  ebitda: "EBITDA",
};

function formatValue(val: number | null | undefined): string {
  if (val == null) return "\u2014";
  const abs = Math.abs(val);
  // val is in тыс. руб (thousands)
  if (abs >= 1_000_000) return (val / 1_000_000).toFixed(1) + " млрд";
  if (abs >= 1_000) return (val / 1_000).toFixed(1) + " млн";
  return val.toFixed(0) + " тыс";
}

function calcYoY(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (!current || !previous || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function YoYCell({ value }: { value: number | null }) {
  if (value == null) return <td className="px-3 py-2 text-right text-gray-300 text-xs">\u2014</td>;
  const isPositive = value >= 0;
  return (
    <td className={`px-3 py-2 text-right text-xs font-medium ${isPositive ? "text-green-600" : "text-red-500"}`}>
      {isPositive ? "+" : ""}{value.toFixed(1)}%
    </td>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("revenue");

  const loadData = useCallback(() => {
    api.get<CompanySummary[]>("/dashboard/financials")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Determine available years from data
  const allYears = Array.from(
    new Set(data.flatMap((c) => Object.keys(c.years).map(Number)))
  ).sort();

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Детализация по брендам</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(Object.entries(METRIC_LABELS) as [Metric, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                metric === key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-400">
          Нет финансовых данных. Добавьте данные на страницах компаний.
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-white text-xs">
                <th className="text-left px-4 py-3 font-medium sticky left-0 bg-gray-900 z-10">БРЕНД</th>
                {allYears.map((y) => (
                  <th key={y} className="text-right px-3 py-3 font-medium">{y}</th>
                ))}
                {allYears.length >= 2 && allYears.slice(0, -1).map((y, i) => (
                  <th key={`vs-${y}`} className="text-right px-3 py-3 font-medium text-gray-400">
                    vs {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((company) => {
                const latestYear = allYears[allYears.length - 1];
                return (
                  <tr
                    key={company.company_id}
                    className={`border-t hover:bg-gray-50 ${company.is_self ? "bg-blue-50/50" : ""}`}
                  >
                    <td className={`px-4 py-2.5 font-medium sticky left-0 z-10 ${company.is_self ? "bg-blue-50" : "bg-white"}`}>
                      <Link href={`/companies/${company.slug}`} className="text-blue-600 hover:underline">
                        {company.company_name}
                      </Link>
                      {company.is_self && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                          Мы
                        </span>
                      )}
                    </td>
                    {allYears.map((y) => {
                      const val = company.years[y]?.[metric];
                      return (
                        <td key={y} className="px-3 py-2.5 text-right font-mono text-gray-700">
                          {formatValue(val)}
                        </td>
                      );
                    })}
                    {allYears.length >= 2 && allYears.slice(0, -1).map((baseYear) => {
                      const baseVal = company.years[baseYear]?.[metric];
                      const latestVal = company.years[latestYear]?.[metric];
                      return <YoYCell key={`vs-${baseYear}`} value={calcYoY(latestVal, baseVal)} />;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Значения в {metric === "revenue" ? "выручке" : metric === "net_profit" ? "чистой прибыли" : "EBITDA"}, млн/млрд руб.
        Динамика рассчитана к последнему доступному году.
      </p>
    </div>
  );
}
