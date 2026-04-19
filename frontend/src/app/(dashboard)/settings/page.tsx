"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface Setting {
  id: number;
  key: string;
  value: string;
  description: string | null;
}

const GROUPS: Record<string, { label: string; keys: string[] }> = {
  debug: {
    label: "Debug",
    keys: ["debug_mode", "debug_max_api_calls", "debug_max_offers_per_page"],
  },
  scraping: {
    label: "Скрапинг",
    keys: ["max_pages_per_catalog", "rate_limit_seconds", "firecrawl_wait_for"],
  },
  cache: {
    label: "Кэш",
    keys: ["cache_ttl_days"],
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(() => {
    api.get<Setting[]>("/settings")
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async (key: string) => {
    setSaving(true);
    try {
      await api.patch(`/settings/${key}`, { value: editValue });
      setEditing(null);
      loadSettings();
    } catch {}
    setSaving(false);
  };

  const handleToggleDebug = async () => {
    const current = settings.find((s) => s.key === "debug_mode");
    if (!current) return;
    const newVal = current.value === "true" ? "false" : "true";
    await api.patch("/settings/debug_mode", { value: newVal });
    loadSettings();
  };

  const settingsByKey = Object.fromEntries(settings.map((s) => [s.key, s]));
  const debugMode = settingsByKey["debug_mode"]?.value === "true";

  if (loading) return <div className="text-gray-400">Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Настройки</h1>
        {debugMode && (
          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
            DEBUG MODE
          </span>
        )}
      </div>

      {debugMode && (
        <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <strong>{"Debug mode активен."}</strong>{" При запуске парсинга каждая задача ограничена: "}
          <strong>{"1 страница"}</strong>{" и "}<strong>{"не более 10 товаров"}</strong>{"."}
        </div>
      )}

      {Object.entries(GROUPS).map(([groupKey, group]) => (
        <section key={groupKey} className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {group.label}
          </h2>
          <div className="bg-white rounded-lg border divide-y">
            {group.keys.map((key) => {
              const s = settingsByKey[key];
              if (!s) return null;
              const isDebugToggle = key === "debug_mode";
              return (
                <div key={key} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-700">{s.key}</div>
                    {s.description && (
                      <div className="text-xs text-gray-400 mt-0.5">{s.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {isDebugToggle ? (
                      <button
                        onClick={handleToggleDebug}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          debugMode ? "bg-yellow-400" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            debugMode ? "left-6" : "left-0.5"
                          }`}
                        />
                      </button>
                    ) : editing === key ? (
                      <>
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-24 px-2 py-1 border rounded text-sm font-mono"
                          onKeyDown={(e) => e.key === "Enter" && handleSave(key)}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSave(key)}
                          disabled={saving}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          &times;
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-sm text-gray-600 bg-gray-50 px-2 py-0.5 rounded">
                          {s.value}
                        </span>
                        <button
                          onClick={() => { setEditing(key); setEditValue(s.value); }}
                          className="text-gray-400 hover:text-blue-600 text-sm"
                        >
                          &#9998;
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
