"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";

interface Region { id: number; name: string; }
interface Category { id: number; name: string; level: number; parent_id: number | null; }

interface Offer {
  id: number;
  company_id: number;
  region_id: number;
  name: string;
  url: string | null;
  sku: string | null;
  price: number | null;
  price_old: number | null;
  is_available: boolean | null;
  category_id: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  companyId: number;
  regions: Region[];
  categories: Category[];
  editRecord?: Offer | null;
}

export function OfferForm({ open, onClose, onSaved, companyId, regions, categories, editRecord }: Props) {
  const [regionId, setRegionId] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [priceOld, setPriceOld] = useState("");
  const [isAvailable, setIsAvailable] = useState<string>("unknown");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editRecord) {
      setRegionId(String(editRecord.region_id));
      setName(editRecord.name);
      setUrl(editRecord.url || "");
      setSku(editRecord.sku || "");
      setPrice(editRecord.price != null ? String(editRecord.price) : "");
      setPriceOld(editRecord.price_old != null ? String(editRecord.price_old) : "");
      setIsAvailable(editRecord.is_available === null ? "unknown" : editRecord.is_available ? "yes" : "no");
      setCategoryId(editRecord.category_id ? String(editRecord.category_id) : "");
    } else {
      setRegionId(regions[0]?.id ? String(regions[0].id) : "");
      setName(""); setUrl(""); setSku(""); setPrice(""); setPriceOld("");
      setIsAvailable("unknown"); setCategoryId("");
    }
    setError("");
  }, [editRecord, open, regions]);

  const categoryLabel = (cat: Category) => {
    const indent = cat.level > 1 ? "\u00A0\u00A0".repeat(cat.level - 1) + "\u2514 " : "";
    return indent + cat.name;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body: any = {
      company_id: companyId,
      region_id: Number(regionId),
      name,
      url: url || null,
      sku: sku || null,
      price: price ? Number(price) : null,
      price_old: priceOld ? Number(priceOld) : null,
      is_available: isAvailable === "unknown" ? null : isAvailable === "yes",
      category_id: categoryId ? Number(categoryId) : null,
    };
    try {
      if (editRecord) {
        const { company_id, region_id, ...updateBody } = body;
        await api.patch(`/offers/${editRecord.id}`, updateBody);
      } else {
        await api.post("/offers", body);
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
    <Modal open={open} onClose={onClose} title={editRecord ? "Редактировать оффер" : "Добавить оффер"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Регион *</label>
            <select value={regionId} onChange={(e) => setRegionId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" required>
              <option value="">Выберите...</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Авто</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{categoryLabel(cat)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название товара *</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU / Артикул</label>
            <input value={sku} onChange={(e) => setSku(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Цена</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Старая цена</label>
            <input type="number" value={priceOld} onChange={(e) => setPriceOld(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Наличие</label>
            <select value={isAvailable} onChange={(e) => setIsAvailable(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="unknown">Неизвестно</option>
              <option value="yes">В наличии</option>
              <option value="no">Нет в наличии</option>
            </select>
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
