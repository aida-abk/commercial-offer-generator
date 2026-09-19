"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ExtractionProgressBar } from "@/components/ExtractionProgressBar";
import { formatTenge } from "@/lib/format";
import type { ExtractCompleteEvent, ExtractStreamEvent } from "@/lib/extract-progress";
import type { AnalyzedPdfPage, ExtractedProject } from "@/lib/types";

type WizardStep = "form" | "processing" | "confirm" | "done";

interface VariantSummary {
  totalAmount: number;
  panelCount: number;
}

interface DraftPayload {
  extracted: ExtractedProject;
  analyzedPages?: AnalyzedPdfPage[];
  variants?: Record<string, VariantSummary>;
  sourceFileName?: string;
}

/** Совпадает с conduit.includeAboveAreaSqM в config/calculation-rules.json. */
const CONDUIT_DEFAULT_AREA_SQM = 100;

const emptyManual: ExtractedProject = {
  projectName: "",
  clientName: "",
  totalAreaSqM: 90,
  outlets: 50,
  switches: 25,
  lightPoints: 13,
  utpPoints: 4,
  warmFloorCircuits: 0,
  notes: [],
};

async function readExtractStream(
  response: Response,
  onProgress: (event: ExtractStreamEvent) => void,
): Promise<ExtractCompleteEvent> {
  if (!response.body) {
    throw new Error("Пустой ответ сервера");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete: ExtractCompleteEvent | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as ExtractStreamEvent;
      onProgress(event);
      if (event.type === "complete") complete = event;
      if (event.type === "error") throw new Error(event.message);
    }
  }

  if (!complete) {
    throw new Error("Обработка завершилась без результата");
  }
  return complete;
}

export default function HomePage() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [step, setStep] = useState<WizardStep>("form");
  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [manual, setManual] = useState<ExtractedProject>(emptyManual);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [etaSeconds, setEtaSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [confirmProjectName, setConfirmProjectName] = useState("");
  const [confirmClientName, setConfirmClientName] = useState("");
  const [confirmArea, setConfirmArea] = useState(90);
  const [confirmUseConduit, setConfirmUseConduit] = useState(false);

  const [offerId, setOfferId] = useState<string | null>(null);
  const [variants, setVariants] = useState<Record<string, VariantSummary> | null>(null);
  const [finalExtracted, setFinalExtracted] = useState<ExtractedProject | null>(null);

  const extractedRef = useRef<ExtractedProject | null>(null);
  useEffect(() => {
    extractedRef.current = draft?.extracted ?? null;
  }, [draft]);

  // Площадь и наличие гофры меняют смету, поэтому предпросмотр по брендам
  // пересчитывается прямо на шаге подтверждения.
  useEffect(() => {
    if (step !== "confirm") return;
    const base = extractedRef.current;
    if (!base || confirmArea <= 0) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base,
          totalAreaSqM: confirmArea,
          useConduit: confirmUseConduit,
          notes: base.notes ?? [],
        }),
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) return;
          const next = Object.fromEntries(
            Object.entries(
              data.variants as Record<string, { totalAmount: number; panel?: unknown[] }>,
            ).map(([k, v]) => [
              k,
              { totalAmount: v.totalAmount, panelCount: v.panel?.length ?? 0 },
            ]),
          );
          setDraft((prev) => (prev ? { ...prev, variants: next } : prev));
        })
        .catch(() => {});
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [step, confirmArea, confirmUseConduit]);

  function startElapsedTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds((Date.now() - start) / 1000);
    }, 500);
  }

  function stopElapsedTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function openConfirmFromDraft(payload: DraftPayload) {
    const area = payload.extracted.totalAreaSqM || 90;
    setDraft(payload);
    setConfirmProjectName(payload.extracted.projectName || "");
    setConfirmClientName(payload.extracted.clientName || "");
    setConfirmArea(area);
    setConfirmUseConduit(
      payload.extracted.useConduit ?? area > CONDUIT_DEFAULT_AREA_SQM,
    );
    setStep("confirm");
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Выберите PDF-файл проекта");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("PDF больше 100 МБ.");
      return;
    }

    setError(null);
    setLoading(true);
    setStep("processing");
    setProgress(0);
    setProgressMessage("Загрузка PDF…");
    setEtaSeconds(60);
    setElapsedSeconds(0);
    startElapsedTimer();

    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Ошибка извлечения");
      }

      const complete = await readExtractStream(res, (event) => {
        if (event.type === "progress") {
          setProgress(event.progress);
          setProgressMessage(event.message);
          setEtaSeconds(event.etaSeconds);
          setElapsedSeconds(event.elapsedSeconds);
        }
      });

      setProgress(100);
      openConfirmFromDraft({
        extracted: complete.extracted,
        analyzedPages: complete.analyzedPages,
        variants: complete.variants,
        sourceFileName: complete.sourceFileName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      setStep("form");
    } finally {
      stopElapsedTimer();
      setLoading(false);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...manual, notes: manual.notes ?? [] }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        openConfirmFromDraft({
          extracted: { ...manual, notes: manual.notes ?? [] },
          variants: Object.fromEntries(
            Object.entries(
              data.variants as Record<string, { totalAmount: number; panel?: unknown[] }>,
            ).map(([k, v]) => [
              k,
              { totalAmount: v.totalAmount, panelCount: v.panel?.length ?? 0 },
            ]),
          ),
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Ошибка расчёта");
      })
      .finally(() => setLoading(false));
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;

    if (!confirmProjectName.trim()) {
      setError("Укажите название проекта");
      return;
    }
    if (!confirmArea || confirmArea <= 0) {
      setError("Укажите площадь объекта");
      return;
    }

    setError(null);
    setLoading(true);

    const extractedData: ExtractedProject = {
      ...draft.extracted,
      projectName: confirmProjectName.trim(),
      clientName: confirmClientName.trim(),
      totalAreaSqM: confirmArea,
      useConduit: confirmUseConduit,
    };

    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: confirmProjectName.trim(),
          clientName: confirmClientName.trim(),
          sourceFileName: draft.sourceFileName ?? "",
          extractedData,
          analyzedPages: draft.analyzedPages ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка создания КП");

      setOfferId(data.id as string);
      setFinalExtracted(extractedData);
      setVariants(
        data.brandVariants
          ? Object.fromEntries(
              Object.entries(
                data.brandVariants as Record<string, { totalAmount: number; panel?: unknown[] }>,
              ).map(([k, v]) => [
                k,
                { totalAmount: v.totalAmount, panelCount: v.panel?.length ?? 0 },
              ]),
            )
          : draft.variants ?? null,
      );
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  function resetWizard() {
    setStep("form");
    setDraft(null);
    setOfferId(null);
    setVariants(null);
    setFinalExtracted(null);
    setError(null);
    setProgress(0);
  }

  function goToOffer() {
    if (offerId) router.push(`/offer/${offerId}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Новое коммерческое предложение</h1>
        <p className="mt-2 text-slate-600">
          Загрузите PDF проекта или введите объёмы вручную — система сформирует 3 варианта КП.
        </p>
      </div>

      {step === "form" && (
        <>
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

          <form
            onSubmit={mode === "upload" ? handleUploadSubmit : handleManualSubmit}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
          >
            {mode === "upload" ? (
              <>
                <label className="block text-sm font-medium text-slate-700">PDF проекта</label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-slate-500">
                  Обычно занимает 1–2 минуты в зависимости от размера PDF.
                </p>
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
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
                      onChange={(e) =>
                        setManual({ ...manual, [key]: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || (mode === "upload" && !file)}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {mode === "upload" ? "Извлечь и рассчитать" : "Далее — данные проекта"}
            </button>
            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
          </form>
        </>
      )}

      {step === "processing" && (
        <ExtractionProgressBar
          progress={progress}
          message={progressMessage}
          etaSeconds={etaSeconds}
          elapsedSeconds={elapsedSeconds}
        />
      )}

      {step === "confirm" && draft && (
        <form
          onSubmit={handleConfirmSubmit}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Данные проекта</h2>
            <p className="mt-1 text-sm text-slate-600">
              Проверьте и укажите название, заказчика и площадь — после этого будет сформировано КП.
            </p>
          </div>

          {draft.analyzedPages && draft.analyzedPages.filter((p) => p.selected).length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">Использованы страницы PDF:</p>
              <ul className="mt-1 list-inside list-disc text-amber-800">
                {draft.analyzedPages
                  .filter((p) => p.selected)
                  .map((p) => (
                    <li key={p.pageNumber}>
                      Стр. {p.pageNumber}: {p.title ?? p.matchedKeywords[0] ?? "электрика"}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <dl className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Розетки</dt>
              <dd className="font-semibold">{draft.extracted.outlets}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Выключатели</dt>
              <dd className="font-semibold">{draft.extracted.switches}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Свет / UTP</dt>
              <dd className="font-semibold">
                {draft.extracted.lightPoints} / {draft.extracted.utpPoints}
              </dd>
            </div>
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">
                Название проекта <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={confirmProjectName}
                onChange={(e) => setConfirmProjectName(e.target.value)}
                placeholder="ЖК Aididar, кв. 90 м²"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700">Заказчик</span>
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={confirmClientName}
                onChange={(e) => setConfirmClientName(e.target.value)}
                placeholder="ФИО или название компании"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Площадь, м² <span className="text-red-500">*</span>
              </span>
              <input
                type="number"
                required
                min={1}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={confirmArea}
                onChange={(e) => setConfirmArea(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex items-start gap-3 sm:col-span-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={confirmUseConduit}
                onChange={(e) => setConfirmUseConduit(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium text-slate-700">Прокладка в гофре ПВХ</span>
                <span className="block text-xs text-slate-500">
                  {confirmUseConduit
                    ? "В смету войдёт гофра ПВХ (~70% от метража основного кабеля) и клипсы монтажного пистолета."
                    : "Без гофры — крепёж на площадки монтажного пистолета. На небольших площадях это даёт заказчику экономию."}
                </span>
              </span>
            </label>
          </div>

          {draft.variants && (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["schneider-easy9", "Schneider Easy 9"],
                ["chint", "CHINT"],
                ["legrand", "Legrand"],
              ].map(([key, label]) => (
                <div key={key} className="rounded-lg border border-dashed border-slate-200 p-3 text-sm">
                  <p className="text-slate-500">{label}</p>
                  <p className="font-bold text-blue-700">
                    {formatTenge(draft.variants![key]?.totalAmount ?? 0)} ₸
                  </p>
                  <p className="text-xs text-slate-400">предварительно</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={resetWizard}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Назад
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Формирование КП…" : "Сформировать КП"}
            </button>
          </div>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </form>
      )}

      {step === "done" && finalExtracted && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">КП готово</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Объект</dt>
              <dd className="font-medium">{confirmProjectName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Заказчик</dt>
              <dd className="font-medium">{confirmClientName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Площадь</dt>
              <dd className="font-medium">{confirmArea} м²</dd>
            </div>
          </dl>

          {variants && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["schneider-easy9", "Schneider Easy 9"],
                ["chint", "CHINT"],
                ["legrand", "Legrand"],
              ].map(([key, label]) => (
                <div key={key} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-lg font-bold text-blue-700">
                    {formatTenge(variants[key]?.totalAmount ?? 0)} ₸
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={goToOffer}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Открыть и редактировать КП
            </button>
            <button
              type="button"
              onClick={resetWizard}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Новое КП
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
