"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTenge } from "@/lib/format";
import type { LineItem, OfferSections } from "@/lib/types";

type SectionKey = keyof OfferSections;

const SECTION_LABELS: Record<SectionKey, string> = {
  labor: "Работы",
  materials: "Материалы",
  panel: "Щит и автоматика",
};

function recalcItem(item: LineItem): LineItem {
  return { ...item, total: item.quantity * item.unitPrice };
}

function grandTotal(sections: OfferSections): number {
  return (["labor", "materials", "panel"] as SectionKey[]).reduce(
    (sum, key) => sum + sections[key].reduce((s, row) => s + row.total, 0),
    0,
  );
}

interface OfferPayload {
  id: string;
  projectName: string;
  clientName: string;
  laborPrice: number;
  lineItems: OfferSections;
  totalAmount: number;
}

function EditableSection({
  title,
  sectionKey,
  rows,
  onChange,
}: {
  title: string;
  sectionKey: SectionKey;
  rows: LineItem[];
  onChange: (key: SectionKey, rows: LineItem[]) => void;
}) {
  const sectionTotal = rows.reduce((s, r) => s + r.total, 0);

  function updateRow(index: number, patch: Partial<LineItem>) {
    const next = rows.map((row, i) =>
      i === index ? recalcItem({ ...row, ...patch }) : row,
    );
    onChange(sectionKey, next);
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
  const [sections, setSections] = useState<OfferSections | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => (sections ? grandTotal(sections) : 0), [sections]);

  const loadOffer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/offers/${id}`);
      if (!res.ok) throw new Error("КП не найдено");
      const data = (await res.json()) as OfferPayload;
      setOffer(data);
      setSections(data.lineItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadOffer();
  }, [loadOffer]);

  function handleSectionChange(key: SectionKey, rows: LineItem[]) {
    setSections((prev) => (prev ? { ...prev, [key]: rows } : prev));
  }

  async function handleSave() {
    if (!sections || !offer) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const laborPrice = sections.labor[0]?.unitPrice ?? offer.laborPrice;
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: sections,
          laborPrice,
          totalAmount: total,
        }),
      });
      if (!res.ok) throw new Error("Не удалось сохранить");
      const data = (await res.json()) as OfferPayload;
      setOffer(data);
      setSections(data.lineItems);
      setMessage("Сохранено");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  function handleDownloadPdf() {
    window.open(`/api/generate-pdf?id=${encodeURIComponent(id)}`, "_blank");
  }

  if (loading) {
    return <p className="text-slate-500">Загрузка КП…</p>;
  }

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

  if (!offer || !sections) return null;

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
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Скачать PDF
          </button>
        </div>
      </div>

      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {(Object.keys(SECTION_LABELS) as SectionKey[]).map((key) => (
        <EditableSection
          key={key}
          title={SECTION_LABELS[key]}
          sectionKey={key}
          rows={sections[key]}
          onChange={handleSectionChange}
        />
      ))}

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 text-right">
        <span className="text-sm font-medium text-slate-700">ИТОГО: </span>
        <span className="text-2xl font-bold text-blue-800">{formatTenge(total)} ₸</span>
      </div>
    </div>
  );
}
