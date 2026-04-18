"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Modal } from "@/components/Modal";

interface RefItem { id: number; name: string; slug: string; sort_order: number; is_active?: boolean; }
interface PriceSegment { id: number; category_id: number; name: string; price_min: number | null; price_max: number | null; sort_order: number; }
interface Category extends RefItem { parent_id: number | null; level: number; price_segments: PriceSegment[]; }
interface Region extends RefItem { city_firecrawl?: string | null; }

type Tab = "channels" | "positionings" | "categories" | "regions";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z\u0430-\u044f\u04510-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function ReferencesPage() {
  const [tab, setTab] = useState<Tab>("channels");
  const [channels, setChannels] = useState<RefItem[]>([]);
  const [positionings, setPositionings] = useState<RefItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<string>("");
  const [editItem, setEditItem] = useState<any>(null);
  const [segFormOpen, setSegFormOpen] = useState(false);
  const [editSeg, setEditSeg] = useState<PriceSegment | null>(null);
  const [segCatId, setSegCatId] = useState<number>(0);

  const load = useCallback(() => {
    Promise.all([
      api.get<RefItem[]>("/channels?active_only=false"),
      api.get<RefItem[]>("/positionings?active_only=false"),
      api.get<Category[]>("/categories"),
      api.get<Region[]>("/regions?active_only=false"),
    ]).then(([ch, pos, cat, reg]) => {
      setChannels(ch); setPositionings(pos); setCategories(cat); setRegions(reg);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openForm = (type: string, item: any = null) => {
    setFormType(type); setEditItem(item); setFormOpen(true);
  };

  const handleDelete = async (apiPath: string, id: number, name: string) => {
    if (!confirm(`Удалить "${name}"?`)) return;
    await api.delete(`${apiPath}/${id}`);
    load();
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "channels", label: "Каналы" },
    { key: "positionings", label: "Позиционирование" },
    { key: "categories", label: "Категории" },
    { key: "regions", label: "Регионы" },
  ];

  if (loading) return <div className="text-gray-400">{"Загрузка..."}</div>;

  const topCategories = categories.filter((c) => c.level === 1);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{"Справочники"}</h1>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === t.key ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Channels */}
      {tab === "channels" && (
        <SimpleTable items={channels} onAdd={() => openForm("channel")} onEdit={(i) => openForm("channel", i)} onDelete={(id, name) => handleDelete("/channels", id, name)} />
      )}

      {/* Positionings */}
      {tab === "positionings" && (
        <SimpleTable items={positionings} onAdd={() => openForm("positioning")} onEdit={(i) => openForm("positioning", i)} onDelete={(id, name) => handleDelete("/positionings", id, name)} />
      )}

      {/* Regions */}
      {tab === "regions" && (
        <SimpleTable items={regions} onAdd={() => openForm("region")} onEdit={(i) => openForm("region", i)} onDelete={(id, name) => handleDelete("/regions", id, name)} />
      )}

      {/* Categories — 3-level tree */}
      {tab === "categories" && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => openForm("category")} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
              {"+ Категория"}
            </button>
          </div>
          {topCategories.map((cat) => {
            const children = categories.filter((c) => c.parent_id === cat.id);
            return (
              <div key={cat.id} className="bg-white rounded-lg border mb-4">
                {/* Level 1: Category */}
                <div className="px-4 py-3 flex items-center justify-between bg-gray-100 rounded-t-lg border-b">
                  <div>
                    <span className="font-semibold text-gray-800">{cat.name}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{cat.slug}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditItem(null); setFormType("subcategory_of_" + cat.id); setFormOpen(true); }}
                      className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">{"+ Подкатегория"}</button>
                    <button onClick={() => { setEditSeg(null); setSegCatId(cat.id); setSegFormOpen(true); }}
                      className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded hover:bg-purple-100">{"+ Сегмент"}</button>
                    <button onClick={() => openForm("category", cat)} className="text-gray-400 hover:text-blue-600 text-sm">{"✎"}</button>
                    <button onClick={() => handleDelete("/categories", cat.id, cat.name)} className="text-gray-300 hover:text-red-500">&times;</button>
                  </div>
                </div>

                {/* Level 2: Subcategories */}
                {children.length > 0 && (
                  <div className="border-b">
                    {children.map((sub) => (
                      <div key={sub.id} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50 border-b border-gray-50 last:border-b-0">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-300 pl-2">{"\u2514"}</span>
                          <span className="text-sm font-medium text-gray-700">{sub.name}</span>
                          <span className="text-xs text-gray-400 font-mono">{sub.slug}</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => openForm("subcategory", sub)} className="text-gray-400 hover:text-blue-600 text-xs">{"✎"}</button>
                          <button onClick={() => handleDelete("/categories", sub.id, sub.name)} className="text-gray-300 hover:text-red-500 text-sm">&times;</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Level 3: Price segments */}
                {cat.price_segments.length > 0 && (
                  <div className="px-4 py-2 bg-purple-50/30">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-purple-400 font-medium">{"Ценовые сегменты:"}</span>
                      {cat.price_segments.map((seg) => (
                        <span key={seg.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-purple-100 rounded text-xs text-purple-700">
                          <span className="font-medium">{seg.name}</span>
                          <span className="text-purple-400">
                            {seg.price_min?.toLocaleString("ru-RU") || "0"} {"\u2014"} {seg.price_max?.toLocaleString("ru-RU") || "\u221E"} {"\u20BD"}
                          </span>
                          <button onClick={() => { setEditSeg(seg); setSegCatId(cat.id); setSegFormOpen(true); }} className="text-purple-300 hover:text-purple-600">{"✎"}</button>
                          <button onClick={() => handleDelete("/categories/price-segments", seg.id, seg.name)} className="text-purple-300 hover:text-red-500">&times;</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {children.length === 0 && cat.price_segments.length === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-400">{"Нет подкатегорий и сегментов"}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Generic form */}
      <RefForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} editItem={editItem} formType={formType} categories={topCategories} />

      {/* Price segment form */}
      <SegmentForm open={segFormOpen} onClose={() => setSegFormOpen(false)} onSaved={load} editSeg={editSeg} categoryId={segCatId} categories={categories} />
    </div>
  );
}

function SimpleTable({ items, onAdd, onEdit, onDelete }: {
  items: RefItem[];
  onAdd: () => void;
  onEdit: (item: RefItem) => void;
  onDelete: (id: number, name: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="px-4 py-3 flex justify-end border-b bg-gray-50 rounded-t-lg">
        <button onClick={onAdd} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">{"+ Добавить"}</button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-gray-500 text-xs bg-gray-50">
          <tr>
            <th className="text-left px-4 py-2">{"Название"}</th>
            <th className="text-left px-4 py-2">{"Slug"}</th>
            <th className="text-left px-4 py-2">{"Порядок"}</th>
            <th className="w-20"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2 font-medium">{item.name}</td>
              <td className="px-4 py-2 font-mono text-gray-500 text-xs">{item.slug}</td>
              <td className="px-4 py-2 text-gray-500">{item.sort_order}</td>
              <td className="px-2 py-2 flex gap-1">
                <button onClick={() => onEdit(item)} className="text-gray-400 hover:text-blue-600 text-sm">{"✎"}</button>
                <button onClick={() => onDelete(item.id, item.name)} className="text-gray-300 hover:text-red-500">&times;</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">{"Нет данных"}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RefForm({ open, onClose, onSaved, editItem, formType, categories }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  editItem: any; formType: string; categories: any[];
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editItem) {
      setName(editItem.name); setSlug(editItem.slug); setSortOrder(editItem.sort_order || 0);
      setParentId(editItem.parent_id ? String(editItem.parent_id) : "");
    } else {
      setName(""); setSlug(""); setSortOrder(0); setParentId("");
    }
    setError("");
  }, [editItem, open]);

  const isSubcategory = formType === "subcategory" || formType.startsWith("subcategory_of_");
  const apiPath = formType === "channel" ? "/channels" : formType === "positioning" ? "/positionings" : formType === "region" ? "/regions" : "/categories";

  // Auto-set parent for subcategory
  useEffect(() => {
    if (formType.startsWith("subcategory_of_") && !editItem?.parent_id) {
      const parentId = formType.split("_").pop() || "";
      setParentId(parentId);
    }
  }, [formType, editItem]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    const body: any = { name, slug: slug || slugify(name), sort_order: sortOrder };
    if (formType === "category" && parentId) body.parent_id = Number(parentId);
    try {
      if (editItem) { await api.patch(`${apiPath}/${editItem.id}`, body); }
      else { await api.post(apiPath, body); }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Ошибка"); }
    finally { setSaving(false); }
  }

  const title = editItem ? "Редактировать" : "Добавить";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {(formType === "category" || isSubcategory) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{"Родительская категория"}</label>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm"
              disabled={isSubcategory && !editItem}>
              <option value="">{"— корневая категория —"}</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Название *"}</label>
          <input value={name} onChange={(e) => { setName(e.target.value); if (!editItem) setSlug(slugify(e.target.value)); }}
            className="w-full px-3 py-2 border rounded-lg text-sm" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Slug"}</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">{"Отмена"}</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
            {saving ? "..." : editItem ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SegmentForm({ open, onClose, onSaved, editSeg, categoryId, categories }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  editSeg: PriceSegment | null; categoryId: number; categories: Category[];
}) {
  const [name, setName] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [parentId, setParentId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editSeg) {
      setName(editSeg.name);
      setPriceMin(editSeg.price_min != null ? String(editSeg.price_min) : "");
      setPriceMax(editSeg.price_max != null ? String(editSeg.price_max) : "");
      setParentId(String(editSeg.category_id));
      setSortOrder(editSeg.sort_order);
    } else {
      setName(""); setPriceMin(""); setPriceMax("");
      setParentId(String(categoryId)); setSortOrder(0);
    }
    setError("");
  }, [editSeg, open, categoryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editSeg) {
        await api.patch(`/categories/price-segments/${editSeg.id}`, {
          name, price_min: priceMin ? Number(priceMin) : null, price_max: priceMax ? Number(priceMax) : null, sort_order: sortOrder,
        });
      } else {
        await api.post("/categories/price-segments", {
          category_id: Number(parentId), name,
          price_min: priceMin ? Number(priceMin) : null, price_max: priceMax ? Number(priceMax) : null, sort_order: sortOrder,
        });
      }
      onSaved(); onClose();
    } catch (err: any) { setError(err.message || "Ошибка"); }
    finally { setSaving(false); }
  }

  const topCats = categories.filter((c) => c.level === 1);

  return (
    <Modal open={open} onClose={onClose} title={editSeg ? "Редактировать ценовой сегмент" : "Добавить ценовой сегмент"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Родительская категория"}</label>
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" disabled={!!editSeg}>
            {topCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Название *"}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" required placeholder="Бюджет" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{"Мин. цена (\u20BD)"}</label>
            <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{"Макс. цена (\u20BD)"}</label>
            <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="\u221E" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{"Порядок"}</label>
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">{"Отмена"}</button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
            {saving ? "..." : editSeg ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
