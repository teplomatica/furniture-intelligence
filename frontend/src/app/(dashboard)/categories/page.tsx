"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { CategoryForm } from "@/components/CategoryForm";

interface PriceSegment {
  id: number;
  name: string;
  price_min: number | null;
  price_max: number | null;
}

interface Category {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  level: number;
  price_segments: PriceSegment[];
}

function formatPrice(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString("ru-RU") + " ₽";
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const loadCategories = useCallback(() => {
    api.get<Category[]>("/categories")
      .then(setCategories)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const topLevel = categories.filter((c) => c.level === 1);

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Категории</h1>
        <button
          onClick={() => setFormOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          + Добавить
        </button>
      </div>
      {topLevel.map((cat) => {
        const children = categories.filter((c) => c.parent_id === cat.id);
        return (
          <section key={cat.id} className="mb-8 bg-white rounded-lg border p-4">
            <h2 className="text-lg font-semibold mb-3">{cat.name}</h2>
            {cat.price_segments.length > 0 && (
              <div className="flex gap-2 mb-3">
                {cat.price_segments.map((seg) => (
                  <span key={seg.id} className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                    {seg.name}: {formatPrice(seg.price_min)} — {formatPrice(seg.price_max)}
                  </span>
                ))}
              </div>
            )}
            {children.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {children.map((ch) => (
                  <span key={ch.id} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                    {ch.name}
                  </span>
                ))}
              </div>
            )}
          </section>
        );
      })}
      <CategoryForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={loadCategories}
        categories={categories}
      />
    </div>
  );
}
