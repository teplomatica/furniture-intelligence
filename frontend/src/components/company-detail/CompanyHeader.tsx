"use client";

const SEGMENT_LABELS: Record<string, string> = {
  federal: "Федеральные сети",
  online: "Онлайн-ритейлеры",
  premium: "Премиум",
  marketplace: "Маркетплейсы",
};

const POSITIONING_LABELS: Record<string, string> = {
  budget: "Бюджет",
  mid: "Средний",
  premium: "Премиум",
};

interface Company {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  segment_group: string;
  positioning: string | null;
  notes: string | null;
  is_active: boolean;
  is_self: boolean;
}

interface Props {
  company: Company;
  onEdit: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  refreshing: boolean;
}

export function CompanyHeader({ company, onEdit, onRefresh, onDelete, refreshing }: Props) {
  return (
    <div className="bg-white rounded-lg border p-6 mb-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {company.name}
            {company.is_self && (
              <span className="ml-3 text-sm px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium align-middle">
                Мы
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            {company.website && (
              <a
                href={`https://${company.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                {company.website}
              </a>
            )}
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">
              {SEGMENT_LABELS[company.segment_group] || company.segment_group}
            </span>
            {company.positioning && (
              <span className="text-xs px-2 py-0.5 bg-blue-50 rounded text-blue-600">
                {POSITIONING_LABELS[company.positioning]}
              </span>
            )}
            {!company.is_active && (
              <span className="text-xs px-2 py-0.5 bg-red-50 rounded text-red-500">
                Неактивна
              </span>
            )}
          </div>
          {company.notes && (
            <p className="text-sm text-gray-500 mt-2">{company.notes}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {refreshing ? "Обновление..." : "Обновить данные"}
          </button>
          <button
            onClick={onEdit}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
          >
            {"Редактировать"}
          </button>
          {!company.is_self && (
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-red-50 text-red-500 rounded-lg text-sm hover:bg-red-100"
            >
              {"Удалить"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
