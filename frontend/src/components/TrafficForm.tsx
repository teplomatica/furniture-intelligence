"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";

interface Company {
  id: number;
  name: string;
}

interface Traffic {
  id: number;
  company_id: number;
  period: string;
  monthly_visits: number | null;
  bounce_rate: number | null;
  avg_visit_duration_sec: number | null;
  pages_per_visit: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  companies: Company[];
  editRecord?: Traffic | null;
}

function defaultPeriod(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function TrafficForm({ open, onClose, onSaved, companies, editRecord }: Props) {
  const [companyId, setCompanyId] = useState("");
  const [period, setPeriod] = useState(defaultPeriod());
  const [monthlyVisits, setMonthlyVisits] = useState("");
  const [bounceRate, setBounceRate] = useState("");
  const [avgDuration, setAvgDuration] = useState("");
  const [pagesPerVisit, setPagesPerVisit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editRecord) {
      setCompanyId(String(editRecord.company_id));
      setPeriod(editRecord.period);
      setMonthlyVisits(editRecord.monthly_visits != null ? String(editRecord.monthly_visits) : "");
      setBounceRate(editRecord.bounce_rate != null ? String(editRecord.bounce_rate) : "");
      setAvgDuration(editRecord.avg_visit_duration_sec != null ? String(editRecord.avg_visit_duration_sec) : "");
      setPagesPerVisit(editRecord.pages_per_visit != null ? String(editRecord.pages_per_visit) : "");
    } else {
      setCompanyId(companies[0]?.id ? String(companies[0].id) : "");
      setPeriod(defaultPeriod());
      setMonthlyVisits(""); setBounceRate(""); setAvgDuration(""); setPagesPerVisit("");
    }
    setError("");
  }, [editRecord, open, companies]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      company_id: Number(companyId),
      period,
      monthly_visits: monthlyVisits ? Number(monthlyVisits) : null,
      bounce_rate: bounceRate ? Number(bounceRate) : null,
      avg_visit_duration_sec: avgDuration ? Number(avgDuration) : null,
      pages_per_visit: pagesPerVisit ? Number(pagesPerVisit) : null,
    };
    try {
      if (editRecord) {
        const { company_id, period, ...updateBody } = body;
        await api.patch(`/traffic/${editRecord.id}`, updateBody);
      } else {
        await api.post("/traffic", body);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editRecord ? "Редактировать трафик" : "Добавить трафик"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Компания *</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" required disabled={!!editRecord}>
              <option value="">Выберите...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Период *</label>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" required disabled={!!editRecord} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Визиты/мес.</label>
            <input type="number" value={monthlyVisits} onChange={(e) => setMonthlyVisits(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bounce rate (%)</label>
            <input type="number" step="0.01" value={bounceRate} onChange={(e) => setBounceRate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0.00" min="0" max="100" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ср. время визита (сек.)</label>
            <input type="number" value={avgDuration} onChange={(e) => setAvgDuration(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Стр./визит</label>
            <input type="number" step="0.01" value={pagesPerVisit} onChange={(e) => setPagesPerVisit(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0.00" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Отмена</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Сохранение..." : editRecord ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
