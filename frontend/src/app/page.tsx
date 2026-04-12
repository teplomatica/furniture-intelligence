export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Furniture Intelligence</h1>
        <p className="text-gray-500">Анализ конкурентной среды рынка мебели</p>
        <a href="/companies" className="mt-6 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Конкуренты →
        </a>
      </div>
    </main>
  );
}
