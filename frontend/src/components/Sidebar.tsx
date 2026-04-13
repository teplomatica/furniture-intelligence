"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

const NAV = [
  { href: "/companies", label: "Конкуренты" },
  { href: "/categories", label: "Категории" },
  { href: "/legal-entities", label: "Юрлица" },
  { href: "/financials", label: "Финансы" },
  { href: "/traffic", label: "Трафик" },
  { href: "/assortment", label: "Ассортимент" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-white border-r min-h-screen p-4 flex flex-col">
      <Link href="/" className="text-lg font-bold mb-6 block">FI</Link>
      <nav className="flex-1 space-y-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-lg text-sm ${
              pathname.startsWith(item.href)
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <button
        onClick={() => api.logout()}
        className="px-3 py-2 text-sm text-gray-400 hover:text-red-500 text-left"
      >
        Выйти
      </button>
    </aside>
  );
}
