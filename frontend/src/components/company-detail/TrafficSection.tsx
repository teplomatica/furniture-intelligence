"use client";

interface Traffic {
  id: number;
  company_id: number;
  period: string;
  monthly_visits: number | null;
  bounce_rate: number | null;
  avg_visit_duration_sec: number | null;
  pages_per_visit: number | null;
  source: string;
}

interface Props {
  traffic: Traffic[];
  onAdd: () => void;
  onEdit: (record: Traffic) => void;
}

function fmtVisits(v: number | null): string {
  if (v == null) return "\u2014";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return v.toLocaleString("ru-RU");
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "\u2014";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}\u043C ${s}\u0441` : `${s}\u0441`;
}

export function TrafficSection({ traffic, onAdd, onEdit }: Props) {
  return (
    <section className="bg-white rounded-lg border mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">Веб-трафик</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{traffic.length} записей</span>
          <button onClick={onAdd} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            + Добавить
          </button>
        </div>
      </div>
      {traffic.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          Нет данных по трафику. Добавьте вручную.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2">Период</th>
                <th className="text-right px-4 py-2">Визиты</th>
                <th className="text-right px-4 py-2">Bounce</th>
                <th className="text-right px-4 py-2">Ср. время</th>
                <th className="text-right px-4 py-2">Стр./визит</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {traffic.map((t) => (
                <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{t.period}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtVisits(t.monthly_visits)}</td>
                  <td className="px-4 py-2 text-right">{t.bounce_rate != null ? `${t.bounce_rate.toFixed(1)}%` : "\u2014"}</td>
                  <td className="px-4 py-2 text-right">{fmtDuration(t.avg_visit_duration_sec)}</td>
                  <td className="px-4 py-2 text-right">{t.pages_per_visit?.toFixed(1) ?? "\u2014"}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => onEdit(t)} className="text-gray-400 hover:text-blue-600 text-sm">
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
