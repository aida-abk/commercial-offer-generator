"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTenge } from "@/lib/format";
import type {
  AnalyzedPdfPage,
  BrandVariants,
  LineItem,
  OfferSections,
  PanelBrandId,
} from "@/lib/types";

const BRAND_LABELS: Record<PanelBrandId, string> = {
  "schneider-easy9": "Schneider Easy 9",
  chint: "CHINT",
  legrand: "Legrand",
};

type SectionKey = keyof OfferSections;

function recalcItem(item: LineItem): LineItem {
  return { ...item, total: item.quantity * item.unitPrice };
}

function sumRows(rows: LineItem[]): number {
  return rows.reduce((s, r) => s + r.total, 0);
}

interface OfferPayload {
  id: string;
  projectName: string;
  clientName: string;
  laborPrice: number;
  lineItems: OfferSections;
  brandVariants: BrandVariants;
  activeBrand: PanelBrandId;
  analyzedPages: AnalyzedPdfPage[];
  totalAmount: number;
}

function EditableMaterialsTable({
  rows,
  onChange,
}: {
  rows: LineItem[];
  onChange: (rows: LineItem[]) => void;
}) {
  function updateRow(index: number, patch: Partial<LineItem>) {
    onChange(rows.map((row, i) => (i === index ? recalcItem({ ...row, ...patch }) : row)));
  }

  function addRow() {
    onChange([
      ...rows,
      {
        id: `custom-${Date.now()}`,
        name: "Новая позиция",
        unit: "шт",
        quantity: 1,
        unitPrice: 0,
        total: 0,
        section: "materials",
      },
    ]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  const sectionTotal = sumRows(rows);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="font-semibold text-slate-900">2. Материалы (лист «Товары»)</h2>
        <button
          type="button"
          onClick={addRow}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          + Добавить строку
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">№</th>
              <th className="px-3 py-2">Наименование</th>
              <th className="px-3 py-2 w-16">Ед.</th>
              <th className="px-3 py-2 w-24">Кол-во</th>
              <th className="px-3 py-2 w-32">Цена</th>
              <th className="px-3 py-2 w-32 text-right">Сумма</th>
              <th className="px-3 py-2 w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.id}-${index}`} className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                    className="w-full min-w-[14rem] rounded border border-slate-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={row.unit}
                    onChange={(e) => updateRow(index, { unit: e.target.value })}
                    className="w-full rounded border border-slate-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={row.quantity}
                    onChange={(e) =>
                      updateRow(index, { quantity: Number(e.target.value) || 0 })
                    }
                    className="w-full rounded border border-slate-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={row.unitPrice}
                    onChange={(e) =>
                      updateRow(index, { unitPrice: Number(e.target.value) || 0 })
                    }
                    className="w-full rounded border border-slate-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatTenge(row.total)}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="text-red-500 hover:text-red-700"
                    title="Удалить"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={5} className="px-3 py-2 text-right">
                Итого по материалам
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatTenge(sectionTotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function EditableSection({
  title,
  rows,
  onChange,
}: {
  title: string;
  rows: LineItem[];
  onChange: (rows: LineItem[]) => void;
}) {
  const sectionTotal = sumRows(rows);

  function updateRow(index: number, patch: Partial<LineItem>) {
    onChange(rows.map((row, i) => (i === index ? recalcItem({ ...row, ...patch }) : row)));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Наименование</th>
              <th className="px-3 py-2 w-16">Ед.</th>
              <th className="px-3 py-2 w-24">Кол-во</th>
              <th className="px-3 py-2 w-32">Цена</th>
              <th className="px-3 py-2 w-32 text-right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.id}-${index}`} className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                    className="w-full min-w-[12rem] rounded border border-slate-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2 text-slate-600">{row.unit}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={row.quantity}
                    onChange={(e) =>
                      updateRow(index, { quantity: Number(e.target.value) || 0 })
                    }
                    className="w-full rounded border border-slate-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={row.unitPrice}
                    onChange={(e) =>
                      updateRow(index, { unitPrice: Number(e.target.value) || 0 })
                    }
                    className="w-full rounded border border-slate-200 px-2 py-1"
                  />
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatTenge(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={4} className="px-3 py-2 text-right">
                Итого по разделу
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatTenge(sectionTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function OfferEditorPage() {
  const params = useParams();
  const id = params.id as string;
  const [offer, setOffer] = useState<OfferPayload | null>(null);
  const [labor, setLabor] = useState<LineItem[]>([]);
  const [materials, setMaterials] = useState<LineItem[]>([]);
  const [brandVariants, setBrandVariants] = useState<BrandVariants | null>(null);
  const [activeBrand, setActiveBrand] = useState<PanelBrandId>("schneider-easy9");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activePanel = brandVariants?.[activeBrand]?.panel ?? [];

  const activeTotal = useMemo(() => {
    if (!brandVariants) return 0;
    const laborTotal = sumRows(labor);
    const materialsTotal = sumRows(materials);
    const panelTotal = sumRows(activePanel);
    return laborTotal + materialsTotal + panelTotal;
  }, [labor, materials, activePanel, brandVariants]);

  const loadOffer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/offers/${id}`);
      if (!res.ok) throw new Error("КП не найдено");
      const data = (await res.json()) as OfferPayload;
      setOffer(data);
      setLabor(data.lineItems.labor);
      setMaterials(data.lineItems.materials);
      setBrandVariants(data.brandVariants);
      setActiveBrand(data.activeBrand ?? "schneider-easy9");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadOffer();
  }, [loadOffer]);

  function handlePanelChange(rows: LineItem[]) {
    if (!brandVariants) return;
    const laborTotal = sumRows(labor);
    const materialsTotal = sumRows(materials);
    const panelTotal = sumRows(rows);
    setBrandVariants({
      ...brandVariants,
      [activeBrand]: {
        panel: rows,
        totalAmount: laborTotal + materialsTotal + panelTotal,
      },
    });
  }

  function handleMaterialsChange(rows: LineItem[]) {
    setMaterials(rows);
    if (!brandVariants) return;
    const laborTotal = sumRows(labor);
    const materialsTotal = sumRows(rows);
    const updated = { ...brandVariants };
    for (const brand of Object.keys(updated) as PanelBrandId[]) {
      updated[brand] = {
        ...updated[brand],
        totalAmount: laborTotal + materialsTotal + sumRows(updated[brand].panel),
      };
    }
    setBrandVariants(updated);
  }

  function handleLaborChange(rows: LineItem[]) {
    setLabor(rows);
    if (!brandVariants) return;
    const laborTotal = sumRows(rows);
    const materialsTotal = sumRows(materials);
    const updated = { ...brandVariants };
    for (const brand of Object.keys(updated) as PanelBrandId[]) {
      updated[brand] = {
        ...updated[brand],
        totalAmount: laborTotal + materialsTotal + sumRows(updated[brand].panel),
      };
    }
    setBrandVariants(updated);
  }

  async function handleSave() {
    if (!brandVariants || !offer) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    const lineItems: OfferSections = {
      labor,
      materials,
      panel: brandVariants[activeBrand].panel,
    };

    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems,
          brandVariants,
          activeBrand,
          laborPrice: labor[0]?.unitPrice ?? offer.laborPrice,
          totalAmount: brandVariants[activeBrand].totalAmount,
        }),
      });
      if (!res.ok) throw new Error("Не удалось сохранить");
      const data = (await res.json()) as OfferPayload;
      setOffer(data);
      setLabor(data.lineItems.labor);
      setMaterials(data.lineItems.materials);
      setBrandVariants(data.brandVariants);
      setMessage("Сохранено");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf(brand: PanelBrandId) {
    if (!brandVariants || !offer) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    const lineItems: OfferSections = {
      labor,
      materials,
      panel: brandVariants[brand].panel,
    };

    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems,
          brandVariants,
          activeBrand: brand,
          laborPrice: labor[0]?.unitPrice ?? offer.laborPrice,
          totalAmount:
            sumRows(labor) +
            sumRows(materials) +
            sumRows(brandVariants[brand].panel),
        }),
      });
      if (!res.ok) throw new Error("Не удалось сохранить перед генерацией PDF");
      const data = (await res.json()) as OfferPayload;
      setOffer(data);
      setLabor(data.lineItems.labor);
      setMaterials(data.lineItems.materials);
      setBrandVariants(data.brandVariants);
      setActiveBrand(brand);
      window.open(
        `/api/generate-pdf?id=${encodeURIComponent(id)}&brand=${encodeURIComponent(brand)}`,
        "_blank",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка перед PDF");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-slate-500">Загрузка КП…</p>;

  if (error && !offer) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{error}</p>
        <Link href="/offers" className="text-blue-600 hover:underline">
          ← К списку
        </Link>
      </div>
    );
  }

  if (!offer || !brandVariants) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/offers" className="text-sm text-blue-600 hover:underline">
            ← Все КП
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{offer.projectName}</h1>
          {offer.clientName && (
            <p className="text-slate-600">Заказчик: {offer.clientName}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>

      {offer.analyzedPages?.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <h3 className="font-semibold text-amber-900">Анализ PDF — выбранные страницы</h3>
          <ul className="mt-2 space-y-1 text-amber-800">
            {offer.analyzedPages
              .filter((p) => p.selected)
              .map((p) => (
                <li key={p.pageNumber}>
                  Стр. {p.pageNumber}: {(p.title ?? p.matchedKeywords.join(", ")) || "электрика"}{" "}
                  (оценка {p.score})
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(BRAND_LABELS) as PanelBrandId[]).map((brand) => (
          <button
            key={brand}
            type="button"
            onClick={() => setActiveBrand(brand)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              activeBrand === brand
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {BRAND_LABELS[brand]}
            <span className="ml-2 text-xs opacity-80">
              {formatTenge(brandVariants[brand].totalAmount)} ₸
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(BRAND_LABELS) as PanelBrandId[]).map((brand) => (
          <button
            key={`pdf-${brand}`}
            type="button"
            onClick={() => void handleDownloadPdf(brand)}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : `PDF — ${BRAND_LABELS[brand]}`}
          </button>
        ))}
      </div>

      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <EditableSection title="1. Работы" rows={labor} onChange={handleLaborChange} />
      <EditableMaterialsTable rows={materials} onChange={handleMaterialsChange} />
      <EditableSection
        title={`3. Щит и автоматика — ${BRAND_LABELS[activeBrand]}`}
        rows={activePanel}
        onChange={handlePanelChange}
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 text-right">
        <span className="text-sm font-medium text-slate-700">
          ИТОГО ({BRAND_LABELS[activeBrand]}):{" "}
        </span>
        <span className="text-2xl font-bold text-blue-800">{formatTenge(activeTotal)} ₸</span>
      </div>
    </div>
  );
}
