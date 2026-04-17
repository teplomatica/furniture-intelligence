"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Админ",
  editor: "Редактор",
  viewer: "Читатель",
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get<User[]>("/auth/users")
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleStatus = async (user: User) => {
    if (user.status === "active") {
      await api.patch(`/auth/users/${user.id}/deactivate`, {});
    } else {
      await api.patch(`/auth/users/${user.id}/activate`, {});
    }
    load();
  };

  const handleChangeRole = async (userId: number, role: string) => {
    await api.patch(`/auth/users/${userId}/role?role=${role}`, {});
    load();
  };

  if (loading) return <div className="text-gray-400">{"Загрузка..."}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{"Пользователи"}</h1>

      <div className="bg-white rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs">
            <tr>
              <th className="text-left px-4 py-2">{"Email"}</th>
              <th className="text-left px-4 py-2">{"Имя"}</th>
              <th className="text-left px-4 py-2">{"Роль"}</th>
              <th className="text-center px-4 py-2">{"Статус"}</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{u.email}</td>
                <td className="px-4 py-2 text-gray-500">{u.full_name || "\u2014"}</td>
                <td className="px-4 py-2">
                  <select
                    value={u.role}
                    onChange={(e) => handleChangeRole(u.id, e.target.value)}
                    className="px-1 py-0.5 border rounded text-xs"
                    disabled={u.role === "superadmin"}
                  >
                    <option value="viewer">{"Читатель"}</option>
                    <option value="editor">{"Редактор"}</option>
                    <option value="admin">{"Админ"}</option>
                    <option value="superadmin">{"Superadmin"}</option>
                  </select>
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.status === "active" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                    {u.status === "active" ? "Активен" : "Неактивен"}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  {u.role !== "superadmin" && (
                    <button
                      onClick={() => handleToggleStatus(u)}
                      className={`text-xs px-2 py-1 rounded ${u.status === "active" ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"}`}
                    >
                      {u.status === "active" ? "Деактивировать" : "Активировать"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
