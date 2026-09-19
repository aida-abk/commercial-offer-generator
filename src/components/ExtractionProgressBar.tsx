"use client";

import { formatDuration, type ExtractProgressEvent } from "@/lib/extract-progress";

export function ExtractionProgressBar({
  progress,
  message,
  etaSeconds,
  elapsedSeconds,
}: {
  progress: number;
  message: string;
  etaSeconds: number;
  elapsedSeconds: number;
} & Partial<ExtractProgressEvent>) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-blue-900">{message}</span>
        <span className="tabular-nums text-blue-700">{progress}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-blue-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-blue-800">
        <span>Прошло: {formatDuration(elapsedSeconds)}</span>
        <span>{etaSeconds > 0 ? `Осталось ${formatDuration(etaSeconds)}` : "Завершение…"}</span>
      </div>
    </div>
  );
}
