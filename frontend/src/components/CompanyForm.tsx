"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";

const SEGMENT_OPTIONS = [
  { value: "federal", label: "А: Федеральные сети" },
  { value: "online", label: "Б: Онлайн-ритейлеры" },
  { value: "premium", label: "В: Премиум" },
  { value: "marketplace", label: "Г: Маркетплейсы" },
];

const POSITIONING_OPTIONS = [
  { value: "", label: "— не указано —" },
  { value: "budget", label: "Бюджет" },
  { value: "mid", label: "Средний" },
  { value: "premium", label: "Премиум" },
];

interface Company {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  websites: string[] | null;
  segment_group: string;
  positioning: string | null;
  notes: string | null;
  is_self?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editCompany?: Company | null;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function CompanyForm({ open, onClose, onSaved, editCompany }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [website, setWebsite] = useState("");
  const [extraWebsites, setExtraWebsites] = useState<string[]>([]);
  const [segmentGroup, setSegmentGroup] = useState("federal");
  const [positioning, setPositioning] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editCompany) {
      setName(editCompany.name);
      setSlug(editCompany.slug);
      setWebsite(editCompany.website || "");
      setExtraWebsites(editCompany.websites || []);
      setSegmentGroup(editCompany.segment_group);
      setPositioning(editCompany.positioning || "");
      setNotes(editCompany.notes || "");
    } else {
      setName(""); setSlug(""); setWebsite(""); setExtraWebsites([]);
      setSegmentGroup("federal"); setPositioning(""); setNotes("");
    }
    setError("");
  }, [editCompany, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const allWebsites = extraWebsites.filter((w) => w.trim());
    const body = {
      name,
      slug: slug || slugify(name),
      website: website || null,
      websites: allWebsites.length > 0 ? allWebsites : null,
      segment_group: segmentGroup,
      positioning: positioning || null,
      notes: notes || null,
    };
    try {
      if (editCompany) {
        await api.patch(`/companies/${editCompany.id}`, body);
      } else {
        await api.post("/companies", body);
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
    <Modal open={open} onClose={onClose} title={editCompany ? "Редактировать конкурента" : "Добавить конкурента"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название *</label>
          <input value={name} onChange={(e) => { setName(e.target.value); if (!editCompany) setSlug(slugify(e.target.value)); }}
            className="w-full px-3 py-2 border rounded-lg text-sm" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono" placeholder="auto-generated" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Основной сайт"}</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="example.ru" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Дополнительные сайты"}</label>
          {extraWebsites.map((w, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <input
                value={w}
                onChange={(e) => { const arr = [...extraWebsites]; arr[i] = e.target.value; setExtraWebsites(arr); }}
                className="flex-1 px-3 py-1.5 border rounded-lg text-sm"
                placeholder="other-site.ru"
              />
              <button type="button" onClick={() => setExtraWebsites(extraWebsites.filter((_, j) => j !== i))}
                className="text-gray-300 hover:text-red-500 px-1">&times;</button>
            </div>
          ))}
          <button type="button" onClick={() => setExtraWebsites([...extraWebsites, ""])}
            className="text-xs text-blue-600 hover:text-blue-800">{"+ Добавить сайт"}</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Группа *</label>
            <select value={segmentGroup} onChange={(e) => setSegmentGroup(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              {SEGMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Позиционирование</label>
            <select value={positioning} onChange={(e) => setPositioning(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              {POSITIONING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Заметки</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Отмена</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Сохранение..." : editCompany ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
