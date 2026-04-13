"use client";

interface LegalEntity {
  id: number;
  legal_name: string;
  inn: string | null;
}

interface Financial {
  id: number;
  legal_entity_id: number;
  year: number;
  revenue: number | null;
  net_profit: number | null;
  ebitda: number | null;
  total_assets: number | null;
  employee_count: number | null;
  source: string;
}

interface Props {
  entities: LegalEntity[];
  financials: Financial[];
  onAdd: () => void;
  onEdit: (record: Financial) => void;
}

function fmt(v: number | null): string {
  if (v == null) return "\u2014";
  return v.toLocaleString("ru-RU");
}

export function FinancialsSection({ entities, financials, onAdd, onEdit }: Props) {
  const finByLe = financials.reduce<Record<number, Financial[]>>((acc, f) => {
    (acc[f.legal_entity_id] ||= []).push(f);
    return acc;
  }, {});

  return (
    <section className="bg-white rounded-lg border mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">Финансы</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{financials.length} записей</span>
          <button onClick={onAdd} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            + Добавить
          </button>
        </div>
      </div>
      {entities.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          Добавьте юрлица, чтобы видеть финансовые данные
        </div>
      ) : financials.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          Нет финансовых данных. Нажмите «Обновить данные» для синхронизации из DataNewton.
        </div>
      ) : (
        entities.map((le) => {
          const fins = finByLe[le.id] || [];
          if (fins.length === 0) return null;
          return (
            <div key={le.id}>
              <div className="px-4 py-2 text-sm text-gray-500 border-b bg-gray-50/50">
                {le.legal_name}
                {le.inn && <span className="ml-2 font-mono text-xs text-gray-400">ИНН: {le.inn}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-4 py-2">Год</th>
                      <th className="text-right px-4 py-2">Выручка</th>
                      <th className="text-right px-4 py-2">Чист. прибыль</th>
                      <th className="text-right px-4 py-2">EBITDA</th>
                      <th className="text-right px-4 py-2">Активы</th>
                      <th className="text-right px-4 py-2">Сотр.</th>
                      <th className="text-center px-4 py-2">Источник</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fins.map((f) => (
                      <tr key={f.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{f.year}</td>
                        <td className="px-4 py-2 text-right font-mono">{fmt(f.revenue)}</td>
                        <td className={`px-4 py-2 text-right font-mono ${f.net_profit != null && f.net_profit < 0 ? "text-red-500" : ""}`}>
                          {fmt(f.net_profit)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">{fmt(f.ebitda)}</td>
                        <td className="px-4 py-2 text-right font-mono">{fmt(f.total_assets)}</td>
                        <td className="px-4 py-2 text-right">{f.employee_count ?? "\u2014"}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${f.source === "datanewton" ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-500"}`}>
                            {f.source}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <button onClick={() => onEdit(f)} className="text-gray-400 hover:text-blue-600 text-sm">
                            &#9998;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
