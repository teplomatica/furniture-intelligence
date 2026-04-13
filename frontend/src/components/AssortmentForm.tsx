"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";

interface Company {
  id: number;
  name: string;
}

interface Category {
  id: number;
  name: string;
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
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  companies: Company[];
  categories: Category[];
  editRecord?: Assortment | null;
}

export function AssortmentForm({ open, onClose, onSaved, companies, categories, editRecord }: Props) {
  const [companyId, setCompanyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [skuCount, setSkuCount] = useState("");
  const [availabilityPct, setAvailabilityPct] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [priceMedian, setPriceMedian] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editRecord) {
      setCompanyId(String(editRecord.company_id));
      setCategoryId(String(editRecord.category_id));
      setSkuCount(editRecord.sku_count != null ? String(editRecord.sku_count) : "");
      setAvailabilityPct(editRecord.availability_pct != null ? String(editRecord.availability_pct) : "");
      setPriceMin(editRecord.price_min != null ? String(editRecord.price_min) : "");
      setPriceMax(editRecord.price_max != null ? String(editRecord.price_max) : "");
      setPriceMedian(editRecord.price_median != null ? String(editRecord.price_median) : "");
    } else {
      setCompanyId(companies[0]?.id ? String(companies[0].id) : "");
      setCategoryId(categories[0]?.id ? String(categories[0].id) : "");
      setSkuCount(""); setAvailabilityPct(""); setPriceMin(""); setPriceMax(""); setPriceMedian("");
    }
    setError("");
  }, [editRecord, open, companies, categories]);

  const categoryLabel = (cat: Category) => {
    const indent = cat.level > 1 ? "\u00A0\u00A0".repeat(cat.level - 1) + "└ " : "";
    return indent + cat.name;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = {
      company_id: Number(companyId),
      category_id: Number(categoryId),
      sku_count: skuCount ? Number(skuCount) : null,
      availability_pct: availabilityPct ? Number(availabilityPct) : null,
      price_min: priceMin ? Number(priceMin) : null,
      price_max: priceMax ? Number(priceMax) : null,
      price_median: priceMedian ? Number(priceMedian) : null,
    };
    try {
      if (editRecord) {
        const { company_id, category_id, ...updateBody } = body;
        await api.patch(`/assortment/${editRecord.id}`, updateBody);
      } else {
        await api.post("/assortment", body);
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
    <Modal open={open} onClose={onClose} title={editRecord ? "Редактировать ассортимент" : "Добавить ассортимент"}>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Категория *</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" required disabled={!!editRecord}>
              <option value="">Выберите...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{categoryLabel(cat)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Кол-во SKU</label>
            <input type="number" value={skuCount} onChange={(e) => setSkuCount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Наличие (%)</label>
            <input type="number" step="0.01" value={availabilityPct} onChange={(e) => setAvailabilityPct(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0.00" min="0" max="100" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Цена мин.</label>
            <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Цена макс.</label>
            <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Медиана</label>
            <input type="number" value={priceMedian} onChange={(e) => setPriceMedian(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
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
