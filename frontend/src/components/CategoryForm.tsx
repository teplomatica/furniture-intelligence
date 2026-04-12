"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";

interface Category {
  id: number;
  name: string;
  level: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function CategoryForm({ open, onClose, onSaved, categories }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setName(""); setSlug(""); setParentId(""); setError(""); }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/categories", {
        name,
        slug: slug || slugify(name),
        parent_id: parentId || null,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const topLevel = categories.filter((c) => c.level === 1);

  return (
    <Modal open={open} onClose={onClose} title="Добавить категорию">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Родительская категория</label>
          <select value={parentId} onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : "")}
            className="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="">— корневая (топ-уровень) —</option>
            {topLevel.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
          <input value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }}
            className="w-full px-3 py-2 border rounded-lg text-sm" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Отмена</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? "..." : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
