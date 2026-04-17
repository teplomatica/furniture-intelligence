"use client";
import { useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Ошибка регистрации");
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="text-4xl mb-4">{"✅"}</div>
          <h1 className="text-xl font-bold mb-2">{"Регистрация завершена"}</h1>
          <p className="text-sm text-gray-500 mb-6">
            {"Ваша учётная запись создана. Обратитесь к администратору для активации."}
          </p>
          <Link href="/login" className="text-blue-600 hover:underline text-sm">
            {"Вернуться на страницу входа"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-xl font-bold mb-6 text-center">{"Регистрация"}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{"Имя"}</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Иван Иванов" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{"Email *"}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{"Пароль *"}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" required minLength={6} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? "Регистрация..." : "Зарегистрироваться"}
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">
          {"Уже есть аккаунт? "}
          <Link href="/login" className="text-blue-600 hover:underline">{"Войти"}</Link>
        </p>
      </div>
    </div>
  );
}
