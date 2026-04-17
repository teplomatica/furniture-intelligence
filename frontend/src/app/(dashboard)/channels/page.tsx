"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/Modal";

interface Channel { id: number; name: string; slug: string; sort_order: number; is_active: boolean; }
interface Positioning { id: number; name: string; slug: string; sort_order: number; is_active: boolean; }

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z\u0430-\u044f\u04510-9]+/g, "-").replace(/^-|-$/g, "");
}

function RefTable({ title, items, onAdd, onEdit }: {
  title: string;
  items: Array<{ id: number; name: string; slug: string; sort_order: number; is_active: boolean }>;
  onAdd: () => void;
  onEdit: (item: any) => void;
}) {
  return (
    <section className="bg-white rounded-lg border mb-6">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">{title}</h2>
        <button onClick={onAdd} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
          {"+ Добавить"}
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-gray-500 text-xs bg-gray-50">
          <tr>
            <th className="text-left px-4 py-2">{"Название"}</th>
            <th className="text-left px-4 py-2">{"Slug"}</th>
            <th className="text-left px-4 py-2">{"Порядок"}</th>
            <th className="text-center px-4 py-2">{"Статус"}</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2 font-medium">{item.name}</td>
              <td className="px-4 py-2 font-mono text-gray-500 text-xs">{item.slug}</td>
              <td className="px-4 py-2 text-gray-500">{item.sort_order}</td>
              <td className="px-4 py-2 text-center">
                <span className={`inline-block w-2 h-2 rounded-full ${item.is_active ? "bg-green-500" : "bg-red-400"}`} />
              </td>
              <td className="px-2 py-2">
                <button onClick={() => onEdit(item)} className="text-gray-400 hover:text-blue-600 text-sm">{"✎"}</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">{"Нет данных"}</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function RefForm({ open, onClose, onSaved, editItem, apiPath }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editItem: any | null;
  apiPath: string;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editItem) {
      setName(editItem.name); setSlug(editItem.slug); setSortOrder(editItem.sort_order);
    } else {
      setName(""); setSlug(""); setSortOrder(0);
    }
    setError("");
  }, [editItem, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const body = { name, slug: slug || slugify(name), sort_order: sortOrder };
    try {
      if (editItem) {
        await api.patch(`${apiPath}/${editItem.id}`, body);
      } else {
        await api.post(apiPath, body);
      }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Ошибка"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editItem ? "Редактировать" : "Добавить"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Название *"}</label>
          <input value={name} onChange={(e) => { setName(e.target.value); if (!editItem) setSlug(slugify(e.target.value)); }}
            className="w-full px-3 py-2 border rounded-lg text-sm" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Slug"}</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Порядок"}</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">{"Отмена"}</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? "..." : editItem ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [positionings, setPositionings] = useState<Positioning[]>([]);
  const [loading, setLoading] = useState(true);
  const [chFormOpen, setChFormOpen] = useState(false);
  const [posFormOpen, setPosFormOpen] = useState(false);
  const [editCh, setEditCh] = useState<Channel | null>(null);
  const [editPos, setEditPos] = useState<Positioning | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api.get<Channel[]>("/channels?active_only=false"),
      api.get<Positioning[]>("/positionings?active_only=false"),
    ]).then(([ch, pos]) => { setChannels(ch); setPositionings(pos); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-gray-400">{"Загрузка..."}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{"Справочники"}</h1>

      <RefTable
        title="Каналы"
        items={channels}
        onAdd={() => { setEditCh(null); setChFormOpen(true); }}
        onEdit={(item) => { setEditCh(item); setChFormOpen(true); }}
      />
      <RefForm open={chFormOpen} onClose={() => setChFormOpen(false)} onSaved={load} editItem={editCh} apiPath="/channels" />

      <RefTable
        title="Позиционирование"
        items={positionings}
        onAdd={() => { setEditPos(null); setPosFormOpen(true); }}
        onEdit={(item) => { setEditPos(item); setPosFormOpen(true); }}
      />
      <RefForm open={posFormOpen} onClose={() => setPosFormOpen(false)} onSaved={load} editItem={editPos} apiPath="/positionings" />
    </div>
  );
}
