"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTenge } from "@/lib/format";

interface OfferListItem {
  id: string;
  projectName: string;
  clientName: string;
  totalAmount: number;
  updatedAt: string;
  sourceFileName: string;
}

export default function OffersPage() {
  const [offers, setOffers] = useState<OfferListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/offers");
        if (!res.ok) throw new Error("Не удалось загрузить список");
        const data = (await res.json()) as OfferListItem[];
        if (!cancelled) setOffers(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Сохранённые КП</h1>
          <p className="mt-1 text-slate-600">Все сформированные коммерческие предложения.</p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Новое КП
        </Link>
      </div>

      {loading && <p className="text-slate-500">Загрузка…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && offers.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          Пока нет сохранённых КП.{" "}
          <Link href="/" className="text-blue-600 hover:underline">
            Загрузить PDF
          </Link>
        </p>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {offers.map((offer) => (
          <li key={offer.id}>
            <Link
              href={`/offer/${offer.id}`}
              className="flex flex-col gap-2 px-5 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-slate-900">{offer.projectName}</p>
                {offer.clientName && (
                  <p className="text-sm text-slate-600">Заказчик: {offer.clientName}</p>
                )}
                {offer.sourceFileName && (
                  <p className="text-xs text-slate-400">{offer.sourceFileName}</p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold text-blue-700">{formatTenge(offer.totalAmount)} ₸</p>
                <p className="text-xs text-slate-500">
                  {new Date(offer.updatedAt).toLocaleString("ru-RU")}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
