"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";

interface Company {
  id: number;
  name: string;
}

interface DataNewtonResult {
  inn: string | null;
  ogrn: string | null;
  legal_name: string | null;
  address: string | null;
  region: string | null;
  manager_name: string | null;
  founded_year: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  companyId?: number;
}

export function LegalEntityForm({ open, onClose, onSaved, companyId: fixedCompanyId }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [inn, setInn] = useState("");
  const [ogrn, setOgrn] = useState("");
  const [legalName, setLegalName] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // DataNewton search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DataNewtonResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (open) {
      if (fixedCompanyId) {
        setCompanyId(fixedCompanyId);
      } else {
        api.get<Company[]>("/companies").then(setCompanies);
        setCompanyId("");
      }
      setInn(""); setOgrn(""); setLegalName("");
      setIsPrimary(false); setSearchQuery(""); setSearchResults([]); setError("");
    }
  }, [open, fixedCompanyId]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await api.get<DataNewtonResult[]>(
        `/legal-entities/search/datanewton?query=${encodeURIComponent(searchQuery)}`
      );
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function fillFromResult(r: DataNewtonResult) {
    setInn(r.inn || "");
    setOgrn(r.ogrn || "");
    setLegalName(r.legal_name || "");
    setSearchResults([]);
    setSearchQuery("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) { setError("Выберите компанию"); return; }
    setSaving(true);
    setError("");
    try {
      await api.post("/legal-entities", {
        company_id: companyId,
        inn: inn || null,
        ogrn: ogrn || null,
        legal_name: legalName,
        is_primary: isPrimary,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Добавить юрлицо">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* DataNewton search */}
        <div className="bg-gray-50 rounded-lg p-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Поиск в DataNewton</label>
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch())}
              className="flex-1 px-3 py-1.5 border rounded-lg text-sm"
              placeholder="Название или ИНН"
            />
            <button type="button" onClick={handleSearch} disabled={searching}
              className="px-3 py-1.5 bg-gray-200 rounded-lg text-sm hover:bg-gray-300 disabled:opacity-50">
              {searching ? "..." : "Найти"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {searchResults.map((r, i) => (
                <button
                  key={i} type="button"
                  onClick={() => fillFromResult(r)}
                  className="w-full text-left px-2 py-1.5 hover:bg-blue-50 rounded text-xs"
                >
                  <span className="font-medium">{r.legal_name}</span>
                  <span className="text-gray-400 ml-2">ИНН: {r.inn || "—"}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Компания *</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}
            className="w-full px-3 py-2 border rounded-lg text-sm" required disabled={!!fixedCompanyId}>
            <option value="">— выберите —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Юр. название *</label>
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ИНН</label>
            <input value={inn} onChange={(e) => setInn(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ОГРН</label>
            <input value={ogrn} onChange={(e) => setOgrn(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
          Основное юрлицо компании
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Отмена</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Сохранение..." : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
