"use client";

import { DecimalInput } from "@/components/DecimalInput";
import { aggregateRooms, makeRoom, nextRoomId } from "@/lib/rooms";
import { formatMeasure } from "@/lib/format";
import { ROOM_TYPE_LABELS } from "@/lib/types";
import type { Room, RoomType } from "@/lib/types";

interface Props {
  rooms: Room[];
  onChange: (rooms: Room[]) => void;
}

type NumericField =
  | "areaSqM"
  | "outlets"
  | "lightPoints"
  | "lightGroups"
  | "switchesSingle"
  | "switchesTwoWay"
  | "switchesThreeWay"
  | "warmFloorLoops"
  | "airConditioners"
  | "utpPoints";

const COLUMNS: { key: NumericField; label: string; hint: string; width: string }[] = [
  { key: "areaSqM", label: "м²", hint: "Площадь помещения", width: "w-16" },
  { key: "outlets", label: "Роз.", hint: "Розеток в помещении", width: "w-14" },
  { key: "lightPoints", label: "Свет", hint: "Точек света (софиты, люстры, бра)", width: "w-14" },
  { key: "lightGroups", label: "Гр.", hint: "Групп света = мест управления. Софиты внутри группы идут шлейфом", width: "w-14" },
  { key: "switchesSingle", label: "Выкл.", hint: "Обычные выключатели (мест)", width: "w-14" },
  { key: "switchesTwoWay", label: "Прох.", hint: "Проходные выключатели (мест, обычно 2)", width: "w-14" },
  { key: "switchesThreeWay", label: "3 мест", hint: "Управление из 3 мест (мест, 3)", width: "w-14" },
  { key: "warmFloorLoops", label: "Т/пол", hint: "Контуров тёплого пола — на каждый отдельная группа", width: "w-14" },
  { key: "airConditioners", label: "Конд.", hint: "Внутренних блоков кондиционера — на каждый отдельная группа", width: "w-14" },
  { key: "utpPoints", label: "UTP", hint: "Точек UTP (ТВ-зоны, кабинет)", width: "w-14" },
];

export function RoomsEditor({ rooms, onChange }: Props) {
  const totals = aggregateRooms(rooms);

  function update(id: string, patch: Partial<Room>) {
    onChange(rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRoom() {
    onChange([
      ...rooms,
      makeRoom({ id: nextRoomId(), name: "Новое помещение", type: "other", areaSqM: 10 }),
    ]);
  }

  function removeRoom(id: string) {
    onChange(rooms.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Помещения из проекта</h3>
          <p className="text-xs text-slate-500">
            Заполнено автоматически из проекта. Быстрая сверка: итоги в нижней строке обычно
            совпадают с таблицей на листе плана («Розеточная группа», столбец «Кол-во») —
            правьте только то, что разошлось.
          </p>
          <p className="text-xs text-slate-500">
            По каждому помещению считаются группы: свет — автомат 10А, розетки — 16А. Кухня всегда
            получает 4 группы, кондиционер и тёплый пол — свои.
          </p>
        </div>
        <button
          type="button"
          onClick={addRoom}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          + Помещение
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Помещение</th>
              <th className="px-2 py-2 text-left font-medium">Тип</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-1 py-2 text-center font-medium" title={c.hint}>
                  {c.label}
                </th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rooms.map((room) => (
              <tr key={room.id}>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    className="w-36 rounded border border-slate-200 px-2 py-1 text-sm"
                    value={room.name}
                    onChange={(e) => update(room.id, { name: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    className="w-40 rounded border border-slate-200 px-2 py-1 text-sm"
                    value={room.type}
                    onChange={(e) => update(room.id, { type: e.target.value as RoomType })}
                  >
                    {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((t) => (
                      <option key={t} value={t}>
                        {ROOM_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-1 py-1.5 text-center">
                    {/* Площадь дробная — ей нужно поле с запятой; точек всегда целое число. */}
                    {c.key === "areaSqM" ? (
                      <DecimalInput
                        value={room.areaSqM}
                        onChange={(v) => update(room.id, { areaSqM: v })}
                        maxDecimals={2}
                        title={c.hint}
                        className={`${c.width} rounded border border-slate-200 px-1 py-1 text-center text-sm`}
                      />
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        title={c.hint}
                        className={`${c.width} rounded border border-slate-200 px-1 py-1 text-center text-sm`}
                        value={room[c.key]}
                        onChange={(e) => update(room.id, { [c.key]: Number(e.target.value) || 0 })}
                      />
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeRoom(room.id)}
                    className="text-xs text-slate-400 hover:text-red-600"
                    title="Удалить помещение"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 text-xs font-medium text-slate-600">
            <tr>
              <td className="px-2 py-2" colSpan={2}>
                Итого: {rooms.length} помещений
              </td>
              <td className="px-1 py-2 text-center">{formatMeasure(totals.totalAreaSqM)}</td>
              <td className="px-1 py-2 text-center">{totals.outlets}</td>
              <td className="px-1 py-2 text-center">{totals.lightPoints}</td>
              <td className="px-1 py-2" />
              <td className="px-1 py-2 text-center" colSpan={3}>
                выкл. {totals.switches}
              </td>
              <td className="px-1 py-2 text-center">{totals.warmFloorCircuits}</td>
              <td className="px-1 py-2 text-center">{totals.airConditioners}</td>
              <td className="px-1 py-2 text-center">{totals.utpPoints}</td>
              <td className="px-2 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Сумма площадей помещений — {formatMeasure(totals.totalAreaSqM)} м². Площадь объекта в поле выше
        задаётся отдельно: по ней считаются работы и расходники.
      </p>
    </div>
  );
}
