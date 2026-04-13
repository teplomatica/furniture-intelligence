"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";

interface Region {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  city_firecrawl: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editRegion?: Region | null;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z\u0430-\u044f\u04510-9]+/g, "-").replace(/^-|-$/g, "");
}

export function RegionForm({ open, onClose, onSaved, editRegion }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editRegion) {
      setName(editRegion.name);
      setSlug(editRegion.slug);
      setSortOrder(editRegion.sort_order);
    } else {
      setName(""); setSlug(""); setSortOrder(0);
    }
    setError("");
  }, [editRegion, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const body = { name, slug: slug || slugify(name), sort_order: sortOrder };
    try {
      if (editRegion) {
        await api.patch(`/regions/${editRegion.id}`, body);
      } else {
        await api.post("/regions", body);
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
    <Modal open={open} onClose={onClose} title={editRegion ? "Редактировать регион" : "Добавить регион"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
          <input value={name} onChange={(e) => { setName(e.target.value); if (!editRegion) setSlug(slugify(e.target.value)); }}
            className="w-full px-3 py-2 border rounded-lg text-sm" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="auto-generated" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Порядок сортировки</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Отмена</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Сохранение..." : editRegion ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
