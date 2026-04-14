"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Metric = "revenue" | "ebitda" | "net_profit";
type SortMode = "alpha" | "revenue" | "ebitda" | "net_profit";

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

const METRIC_TABS: { key: Metric; label: string }[] = [
  { key: "revenue", label: "Выручка" },
  { key: "ebitda", label: "EBITDA" },
  { key: "net_profit", label: "Прибыль" },
];

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "alpha", label: "А-Я" },
  { key: "revenue", label: "Выручка" },
  { key: "ebitda", label: "EBITDA" },
  { key: "net_profit", label: "Прибыль" },
];

function formatValue(val: number | null | undefined): string {
  if (val == null) return "\u2014";
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return (val / 1_000_000).toFixed(1) + " млрд";
  if (abs >= 1_000) return (val / 1_000).toFixed(1) + " млн";
  return val.toFixed(0) + " тыс";
}

function calcYoY(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (!current || !previous || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatYoY(value: number | null): string {
  if (value == null) return "";
  return (value >= 0 ? "+" : "") + value.toFixed(1) + "%";
}

function getLatestValue(company: CompanySummary, metric: string, years: number[]): number {
  for (let i = years.length - 1; i >= 0; i--) {
    const val = company.years[years[i]]?.[metric as keyof YearData] as number | null;
    if (val != null) return val;
  }
  return 0;
}

export default function DashboardPage() {
  const [data, setData] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("revenue");
  const [sortMode, setSortMode] = useState<SortMode>("alpha");

  const loadData = useCallback(() => {
    api.get<CompanySummary[]>("/dashboard/financials")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const allYears = Array.from(
    new Set(data.flatMap((c) => Object.keys(c.years).map(Number)))
  ).sort();

  // Split & sort
  const selfCompanies = data.filter((c) => c.is_self);
  const competitors = data.filter((c) => !c.is_self);

  const sorted = [...competitors].sort((a, b) => {
    if (sortMode === "alpha") return a.company_name.localeCompare(b.company_name, "ru");
    const valA = getLatestValue(a, sortMode, allYears);
    const valB = getLatestValue(b, sortMode, allYears);
    return valB - valA; // desc
  });

  if (loading) return <div className="text-gray-400">{"Загрузка..."}</div>;

  const renderRow = (company: CompanySummary) => (
    <tr
      key={company.company_id}
      className={`border-t hover:bg-gray-50 ${company.is_self ? "bg-blue-50/50" : ""}`}
    >
      <td className={`px-4 py-2 font-medium sticky left-0 z-10 ${company.is_self ? "bg-blue-50" : "bg-white"}`}>
        <Link href={`/companies/${company.slug}`} className="text-blue-600 hover:underline">
          {company.company_name}
        </Link>
        {company.is_self && (
          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
            {"Мы"}
          </span>
        )}
      </td>
      {allYears.map((y, idx) => {
        const val = company.years[y]?.[metric];
        const prevYear = idx > 0 ? allYears[idx - 1] : null;
        const prevVal = prevYear ? company.years[prevYear]?.[metric] : null;
        const yoy = calcYoY(val, prevVal);
        const yoyStr = formatYoY(yoy);
        const absStr = formatValue(val);
        const hasValue = val != null;
        const hasYoY = yoy !== null;

        return (
          <td key={y} className="px-3 py-1.5 text-right align-middle" style={{ minWidth: 80 }}>
            {hasYoY ? (
              <>
                <div className={`text-sm font-semibold leading-tight ${yoy >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {yoyStr}
                </div>
                <div className="text-[11px] text-gray-400 font-mono leading-tight">{absStr}</div>
              </>
            ) : hasValue ? (
              <>
                <div className="text-sm font-mono text-gray-700 leading-tight">{absStr}</div>
                <div className="text-[11px] text-gray-300 leading-tight">{"\u00A0"}</div>
              </>
            ) : (
              <div className="text-sm text-gray-300">{"\u2014"}</div>
            )}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{"Детализация по брендам"}</h1>
        <div className="flex items-center gap-4">
          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">{"Сортировка:"}</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="text-xs px-2 py-1 border rounded bg-white"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
          {/* Metric tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {METRIC_TABS.map(({ key, label }) => (
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
      </div>

      {data.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center text-gray-400">
          {"Нет финансовых данных. Добавьте данные на страницах компаний."}
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-white text-xs">
                <th className="text-left px-4 py-3 font-medium sticky left-0 bg-gray-900 z-10">{"БРЕНД"}</th>
                {allYears.map((y) => (
                  <th key={y} className="text-right px-3 py-3 font-medium">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Self company always first */}
              {selfCompanies.map(renderRow)}
              {selfCompanies.length > 0 && sorted.length > 0 && (
                <tr><td colSpan={allYears.length + 1} className="h-1 bg-gray-200"></td></tr>
              )}
              {/* Competitors sorted */}
              {sorted.map(renderRow)}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        {METRIC_TABS.find((t) => t.key === metric)?.label || ""}{", млн/млрд руб. Динамика YoY к предыдущему году."}
      </p>
    </div>
  );
}
