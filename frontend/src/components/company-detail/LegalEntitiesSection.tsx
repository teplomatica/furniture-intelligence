"use client";

interface LegalEntity {
  id: number;
  company_id: number;
  inn: string | null;
  ogrn: string | null;
  legal_name: string;
  address: string | null;
  region: string | null;
  founded_year: number | null;
  manager_name: string | null;
  is_primary: boolean;
}

interface Props {
  entities: LegalEntity[];
  onAdd: () => void;
  onDelete: (id: number, name: string) => void;
}

export function LegalEntitiesSection({ entities, onAdd, onDelete }: Props) {
  return (
    <section className="bg-white rounded-lg border mb-4">
      <div className="px-4 py-3 flex items-center justify-between border-b bg-gray-50 rounded-t-lg">
        <h2 className="font-semibold text-gray-700">Юридические лица</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{entities.length} записей</span>
          <button onClick={onAdd} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            + Добавить
          </button>
        </div>
      </div>
      {entities.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          Нет юрлиц. Нажмите «Обновить данные» для автопоиска или добавьте вручную.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {entities.map((le) => (
            <div key={le.id} className="px-4 py-3 flex items-center gap-4 text-sm hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{le.legal_name}</span>
                {le.is_primary && (
                  <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">основное</span>
                )}
              </div>
              <span className="font-mono text-xs text-gray-500 whitespace-nowrap">
                {le.inn ? `ИНН: ${le.inn}` : "—"}
              </span>
              <span className="font-mono text-xs text-gray-400 whitespace-nowrap">
                {le.ogrn ? `ОГРН: ${le.ogrn}` : ""}
              </span>
              <span className="text-xs text-gray-400 w-24">{le.region || ""}</span>
              <span className="text-xs text-gray-400 w-10">{le.founded_year || ""}</span>
              <button
                onClick={() => onDelete(le.id, le.legal_name)}
                className="text-gray-300 hover:text-red-500"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
