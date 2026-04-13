"use client";

interface Category {
  id: number;
  name: string;
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
  source: string;
}

interface Props {
  assortment: Assortment[];
  categories: Category[];
  onAdd: () => void;
  onEdit: (record: Assortment) => void;
}

function fmtPrice(v: number | null): string {
  if (v == null) return "\u2014";
  return v.toLocaleString("ru-RU") + " \u20BD";
}

export function AssortmentSection({ assortment, categories, onAdd, onEdit }: Props) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  return (
    <section className="bg-white rounded-lg border mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">Ассортимент</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{assortment.length} позиций</span>
          <button onClick={onAdd} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            + Добавить
          </button>
        </div>
      </div>
      {assortment.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          Нет данных по ассортименту. Добавьте вручную.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2">Категория</th>
                <th className="text-right px-4 py-2">SKU</th>
                <th className="text-right px-4 py-2">Наличие</th>
                <th className="text-right px-4 py-2">Мин. цена</th>
                <th className="text-right px-4 py-2">Макс. цена</th>
                <th className="text-right px-4 py-2">Медиана</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {assortment.map((a) => (
                <tr key={a.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{catById[a.category_id]?.name ?? `#${a.category_id}`}</td>
                  <td className="px-4 py-2 text-right font-mono">{a.sku_count ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-right">{a.availability_pct != null ? `${a.availability_pct}%` : "\u2014"}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtPrice(a.price_min)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtPrice(a.price_max)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtPrice(a.price_median)}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => onEdit(a)} className="text-gray-400 hover:text-blue-600 text-sm">
                      &#9998;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
