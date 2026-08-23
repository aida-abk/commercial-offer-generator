"use client";

import { useEffect, useState } from "react";
import { formatTenge } from "@/lib/format";
import type { CatalogItem, PriceCatalog } from "@/lib/types";

type Tab = "materials" | "panel";

export default function AdminPricesPage() {
  const [catalog, setCatalog] = useState<PriceCatalog | null>(null);
  const [tab, setTab] = useState<Tab>("materials");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/prices");
        if (!res.ok) throw new Error("Не удалось загрузить прайс");
        setCatalog((await res.json()) as PriceCatalog);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updatePrice(index: number, price: number) {
    if (!catalog) return;
    const list = [...catalog[tab]];
    list[index] = { ...list[index], price };
    setCatalog({ ...catalog, [tab]: list });
  }

  async function handleSave() {
    if (!catalog) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/prices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(catalog),
      });
      if (!res.ok) throw new Error("Не удалось сохранить");
      setCatalog((await res.json()) as PriceCatalog);
      setMessage("Прайс обновлён");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-500">Загрузка прайса…</p>;
  if (!catalog) {
    return <p className="text-red-600">{error ?? "Нет данных"}</p>;
  }

  const items: CatalogItem[] = catalog[tab];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Прайс-лист материалов</h1>
        <p className="mt-1 text-slate-600">
          Редактирование цен в <code className="text-xs">config/price-catalog.json</code>
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["materials", "Материалы"],
            ["panel", "Щит"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === key
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Наименование</th>
              <th className="px-4 py-3">Ед.</th>
              <th className="px-4 py-3 w-36">Цена, ₸</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{item.id}</td>
                <td className="px-4 py-2">{item.name}</td>
                <td className="px-4 py-2 text-slate-600">{item.unit}</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={item.price}
                    onChange={(e) => updatePrice(index, Number(e.target.value) || 0)}
                    className="w-full rounded border border-slate-200 px-2 py-1"
                  />
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {formatTenge(item.price)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Сохранение…" : "Сохранить прайс"}
      </button>
    </div>
  );
}
