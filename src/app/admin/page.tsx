"use client";

import { useEffect, useMemo, useState } from "react";
import { DecimalInput } from "@/components/DecimalInput";
import { formatTenge } from "@/lib/format";
import type { CatalogItem, PriceCatalog } from "@/lib/types";

type Tab = "materials" | "panel";

interface CatalogResponse extends PriceCatalog {
  calculatedIds: string[];
}

const TAB_LABELS: Record<Tab, string> = { materials: "Материалы", panel: "Щит" };

/** Новой позиции нужен свой идентификатор — он внутренний, лишь бы не совпал. */
function newItemId(): string {
  return `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

export default function AdminPricesPage() {
  const [catalog, setCatalog] = useState<PriceCatalog | null>(null);
  const [calculatedIds, setCalculatedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>("materials");
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyResponse(data: CatalogResponse) {
    setCatalog({ materials: data.materials, panel: data.panel, labor: data.labor });
    setCalculatedIds(new Set(data.calculatedIds ?? []));
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/prices");
        if (!res.ok) throw new Error("Не удалось загрузить прайс");
        applyResponse((await res.json()) as CatalogResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updateItem(id: string, patch: Partial<CatalogItem>) {
    if (!catalog) return;
    setCatalog({
      ...catalog,
      [tab]: catalog[tab].map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
    setDirty(true);
    setMessage(null);
  }

  function addItem() {
    if (!catalog) return;
    const item: CatalogItem = { id: newItemId(), name: "", unit: "шт", price: 0 };
    setCatalog({ ...catalog, [tab]: [...catalog[tab], item] });
    setDirty(true);
    setMessage(null);
    setQuery("");
  }

  function removeItem(item: CatalogItem) {
    if (!catalog) return;
    if (!window.confirm(`Удалить позицию «${item.name || item.id}» из прайса?`)) return;
    setCatalog({ ...catalog, [tab]: catalog[tab].filter((i) => i.id !== item.id) });
    setDirty(true);
    setMessage(null);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить");
      applyResponse(data as CatalogResponse);
      setDirty(false);
      setMessage("Прайс обновлён");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const items: CatalogItem[] = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    if (!q) return catalog[tab];
    return catalog[tab].filter((item) => item.name.toLowerCase().includes(q));
  }, [catalog, tab, query]);

  if (loading) return <p className="text-slate-500">Загрузка прайса…</p>;
  if (!catalog) return <p className="text-red-600">{error ?? "Нет данных"}</p>;

  const total = catalog[tab].length;

  return (
    <div className="space-y-5 pb-24 sm:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Прайс-лист</h1>
        <p className="mt-1 text-slate-600">
          Название, единицу и цену можно менять, позиции — добавлять. Цены сохраняются на
          сервере и действуют для всех новых КП; уже сохранённые КП не пересчитываются.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {TAB_LABELS[key]}
            <span className="ml-2 text-xs opacity-80">{catalog[key].length}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={addItem}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          + Позиция
        </button>
      </div>

      {query && (
        <p className="text-xs text-slate-500">
          Показано {items.length} из {total}
        </p>
      )}

      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Таблица — для компьютера. */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:block">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3">Наименование</th>
              <th className="w-28 px-3 py-3">Ед.</th>
              <th className="w-36 px-3 py-3">Цена, ₸</th>
              <th className="w-28 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={item.name}
                    placeholder="Название позиции"
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    className="w-full rounded border border-slate-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                    className="w-full rounded border border-slate-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <DecimalInput
                    value={item.price}
                    onChange={(price) => updateItem(item.id, { price })}
                    className="w-full rounded border border-slate-200 px-2 py-1"
                  />
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {formatTenge(item.price)} ₸
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {calculatedIds.has(item.id) ? (
                    <span
                      className="text-xs text-slate-400"
                      title="Позиция участвует в автоматическом расчёте: если её удалить, строка пропадёт из будущих КП"
                    >
                      в расчёте
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                      className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      Удалить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Карточки — для телефона. */}
      <div className="space-y-3 sm:hidden">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <input
              type="text"
              value={item.name}
              placeholder="Название позиции"
              onChange={(e) => updateItem(item.id, { name: e.target.value })}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm font-medium"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-xs text-slate-500">Единица</span>
                <input
                  type="text"
                  value={item.unit}
                  onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                  className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="block text-xs text-slate-500">Цена, ₸</span>
                <DecimalInput
                  value={item.price}
                  onChange={(price) => updateItem(item.id, { price })}
                  className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <div className="mt-2 text-right">
              {calculatedIds.has(item.id) ? (
                <span className="text-xs text-slate-400">участвует в расчёте</span>
              ) : (
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Удалить позицию
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* На телефоне кнопка сохранения прилипает к низу: список длинный. */}
      <div className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить прайс"}
        </button>
        <span className="text-xs text-slate-500">
          {dirty ? "Есть несохранённые изменения" : "Всё сохранено"}
        </span>
      </div>
    </div>
  );
}
