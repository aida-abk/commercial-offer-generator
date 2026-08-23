"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatTenge } from "@/lib/format";
import type { ExtractedProject } from "@/lib/types";

interface ExtractSummary {
  projectName: string;
  grandTotal: number;
  laborCount: number;
  materialsCount: number;
  panelCount: number;
}

const emptyManual: ExtractedProject = {
  projectName: "",
  totalAreaSqM: 90,
  outlets: 50,
  switches: 25,
  lightPoints: 13,
  utpPoints: 4,
  warmFloorCircuits: 0,
  notes: [],
};

export default function HomePage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedProject | null>(null);
  const [summary, setSummary] = useState<ExtractSummary | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [manual, setManual] = useState<ExtractedProject>(emptyManual);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setExtracted(null);
    setSummary(null);
    setOfferId(null);

    try {
      if (mode === "upload") {
        if (!file) {
          setError("Выберите PDF-файл проекта");
          return;
        }
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/extract", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка извлечения данных");
        setExtracted(data.extracted as ExtractedProject);
        setSummary(data.summary as ExtractSummary);
        setOfferId(data.id as string);
      } else {
        const res = await fetch("/api/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extractedData: manual, projectName: manual.projectName || "Новый объект" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка создания КП");
        setExtracted(data.extractedData as ExtractedProject);
        setSummary({
          projectName: data.projectName,
          grandTotal: data.totalAmount,
          laborCount: data.lineItems.labor.length,
          materialsCount: data.lineItems.materials.length,
          panelCount: data.lineItems.panel.length,
        });
        setOfferId(data.id as string);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }

  function goToOffer() {
    if (offerId) router.push(`/offer/${offerId}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Новое коммерческое предложение</h1>
        <p className="mt-2 text-slate-600">
          Загрузите PDF проекта или введите объёмы вручную — система сформирует смету JT Electrics.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "upload" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}
        >
          Загрузить PDF
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${mode === "manual" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}
        >
          Ввести вручную
        </button>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        {mode === "upload" ? (
          <>
            <label className="block text-sm font-medium text-slate-700">PDF проекта</label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">Название объекта</span>
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={manual.projectName}
                onChange={(e) => setManual({ ...manual, projectName: e.target.value })}
                placeholder="ЖК Aididar, 90 м²"
              />
            </label>
            {(
              [
                ["totalAreaSqM", "Площадь, м²"],
                ["outlets", "Розетки"],
                ["switches", "Выключатели"],
                ["lightPoints", "Точки света"],
                ["utpPoints", "UTP / интернет"],
                ["warmFloorCircuits", "Контуры тёплого пола"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={manual[key]}
                  onChange={(e) => setManual({ ...manual, [key]: Number(e.target.value) || 0 })}
                />
              </label>
            ))}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || (mode === "upload" && !file)}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Обработка…" : mode === "upload" ? "Извлечь и рассчитать" : "Рассчитать КП"}
        </button>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>

      {extracted && summary && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Результат</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Объект</dt>
              <dd className="font-medium">{summary.projectName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Площадь, м²</dt>
              <dd className="font-medium">{extracted.totalAreaSqM}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Розетки / выключатели</dt>
              <dd className="font-medium">{extracted.outlets} / {extracted.switches}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Итого</dt>
              <dd className="text-xl font-bold text-blue-700">{formatTenge(summary.grandTotal)} ₸</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={goToOffer}
            className="mt-6 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Открыть и редактировать КП
          </button>
        </section>
      )}
    </div>
  );
}
