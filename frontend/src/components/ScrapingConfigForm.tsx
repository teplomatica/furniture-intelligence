"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";

interface Region { id: number; name: string; }

interface Config {
  id: number;
  company_id: number;
  region_id: number;
  has_region_selector: boolean;
  has_stock_filter: boolean;
  stock_filter_method: string;
  region_method: string;
  region_key: string | null;
  region_value: string | null;
  catalog_urls: string[] | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  companyId: number;
  regions: Region[];
  editConfig?: Config | null;
}

export function ScrapingConfigForm({ open, onClose, onSaved, companyId, regions, editConfig }: Props) {
  const [regionId, setRegionId] = useState("");
  const [catalogUrls, setCatalogUrls] = useState("");
  const [regionMethod, setRegionMethod] = useState("cookie");
  const [regionKey, setRegionKey] = useState("");
  const [regionValue, setRegionValue] = useState("");
  const [hasRegionSelector, setHasRegionSelector] = useState(true);
  const [hasStockFilter, setHasStockFilter] = useState(true);
  const [stockFilterMethod, setStockFilterMethod] = useState("visible");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editConfig) {
      setRegionId(String(editConfig.region_id));
      setCatalogUrls(editConfig.catalog_urls?.join("\n") || "");
      setRegionMethod(editConfig.region_method);
      setRegionKey(editConfig.region_key || "");
      setRegionValue(editConfig.region_value || "");
      setHasRegionSelector(editConfig.has_region_selector);
      setHasStockFilter(editConfig.has_stock_filter);
      setStockFilterMethod(editConfig.stock_filter_method);
      setIsActive(editConfig.is_active);
    } else {
      setRegionId(regions[0]?.id ? String(regions[0].id) : "");
      setCatalogUrls(""); setRegionMethod("cookie");
      setRegionKey(""); setRegionValue("");
      setHasRegionSelector(true); setHasStockFilter(true);
      setStockFilterMethod("visible"); setIsActive(true);
    }
    setError("");
  }, [editConfig, open, regions]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const urls = catalogUrls.split("\n").map((u) => u.trim()).filter(Boolean);
    const body = {
      company_id: companyId,
      region_id: Number(regionId),
      catalog_urls: urls.length > 0 ? urls : null,
      region_method: regionMethod,
      region_key: regionKey || null,
      region_value: regionValue || null,
      has_region_selector: hasRegionSelector,
      has_stock_filter: hasStockFilter,
      stock_filter_method: stockFilterMethod,
      is_active: isActive,
    };
    try {
      if (editConfig) {
        const { company_id, region_id, ...updateBody } = body;
        await api.patch(`/company-region-configs/${editConfig.id}`, updateBody);
      } else {
        await api.post("/company-region-configs", body);
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
    <Modal open={open} onClose={onClose} title={editConfig ? "Редактировать конфиг" : "Добавить конфиг парсинга"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Регион *</label>
          <select value={regionId} onChange={(e) => setRegionId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm" required disabled={!!editConfig}>
            <option value="">Выберите...</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Catalog URLs (по одному на строку)</label>
          <textarea value={catalogUrls} onChange={(e) => setCatalogUrls(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono" rows={3}
            placeholder="https://hoff.ru/catalog/divany/&#10;https://hoff.ru/catalog/krovati/" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Метод региона</label>
            <select value={regionMethod} onChange={(e) => setRegionMethod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="cookie">Cookie</option>
              <option value="url_param">URL param</option>
              <option value="header">Header</option>
              <option value="subdomain">Subdomain</option>
              <option value="none">Нет</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ключ</label>
            <input value={regionKey} onChange={(e) => setRegionKey(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="city_id"
              disabled={regionMethod === "none"} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Значение</label>
            <input value={regionValue} onChange={(e) => setRegionValue(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="1"
              disabled={regionMethod === "none"} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasRegionSelector} onChange={(e) => setHasRegionSelector(e.target.checked)} />
            Сайт поддерживает выбор региона
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hasStockFilter} onChange={(e) => setHasStockFilter(e.target.checked)} />
            Показывает наличие
          </label>
        </div>
        {hasStockFilter && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Метод фильтра наличия</label>
            <select value={stockFilterMethod} onChange={(e) => setStockFilterMethod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="visible">Видно на карточке</option>
              <option value="filter_required">Нужен фильтр "в наличии"</option>
              <option value="unavailable">Недоступно</option>
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Активен
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Отмена</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Сохранение..." : editConfig ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
