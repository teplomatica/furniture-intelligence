"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";

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
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  legalEntities: LegalEntity[];
  editRecord?: Financial | null;
}

export function FinancialForm({ open, onClose, onSaved, legalEntities, editRecord }: Props) {
  const [legalEntityId, setLegalEntityId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [revenue, setRevenue] = useState("");
  const [netProfit, setNetProfit] = useState("");
  const [ebitda, setEbitda] = useState("");
  const [totalAssets, setTotalAssets] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editRecord) {
      setLegalEntityId(String(editRecord.legal_entity_id));
      setYear(editRecord.year);
      setRevenue(editRecord.revenue != null ? String(editRecord.revenue) : "");
      setNetProfit(editRecord.net_profit != null ? String(editRecord.net_profit) : "");
      setEbitda(editRecord.ebitda != null ? String(editRecord.ebitda) : "");
      setTotalAssets(editRecord.total_assets != null ? String(editRecord.total_assets) : "");
      setEmployeeCount(editRecord.employee_count != null ? String(editRecord.employee_count) : "");
    } else {
      setLegalEntityId(legalEntities[0]?.id ? String(legalEntities[0].id) : "");
      setYear(new Date().getFullYear() - 1);
      setRevenue(""); setNetProfit(""); setEbitda(""); setTotalAssets(""); setEmployeeCount("");
    }
    setError("");
  }, [editRecord, open, legalEntities]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      legal_entity_id: Number(legalEntityId),
      year,
      revenue: revenue ? Number(revenue) : null,
      net_profit: netProfit ? Number(netProfit) : null,
      ebitda: ebitda ? Number(ebitda) : null,
      total_assets: totalAssets ? Number(totalAssets) : null,
      employee_count: employeeCount ? Number(employeeCount) : null,
    };
    try {
      if (editRecord) {
        const { legal_entity_id, year, ...updateBody } = body;
        await api.patch(`/financials/${editRecord.id}`, updateBody);
      } else {
        await api.post("/financials", body);
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
    <Modal open={open} onClose={onClose} title={editRecord ? "Редактировать финансы" : "Добавить финансы"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Юрлицо *</label>
            <select value={legalEntityId} onChange={(e) => setLegalEntityId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" required disabled={!!editRecord}>
              <option value="">Выберите...</option>
              {legalEntities.map((le) => (
                <option key={le.id} value={le.id}>{le.legal_name}{le.inn ? ` (${le.inn})` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Год *</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg text-sm" required min={2015} max={2030} disabled={!!editRecord} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Выручка (тыс. руб.)</label>
            <input type="number" step="0.01" value={revenue} onChange={(e) => setRevenue(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Чистая прибыль (тыс. руб.)</label>
            <input type="number" step="0.01" value={netProfit} onChange={(e) => setNetProfit(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0.00" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">EBITDA (тыс. руб.)</label>
            <input type="number" step="0.01" value={ebitda} onChange={(e) => setEbitda(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Активы (тыс. руб.)</label>
            <input type="number" step="0.01" value={totalAssets} onChange={(e) => setTotalAssets(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0.00" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Сотрудники</label>
          <input type="number" value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
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
