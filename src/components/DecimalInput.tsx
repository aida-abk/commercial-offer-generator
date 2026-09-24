"use client";

import { useEffect, useState } from "react";
import { formatQuantity, parseDecimalInput } from "@/lib/format";

interface Props {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  maxDecimals?: number;
  placeholder?: string;
  title?: string;
}

/**
 * Поле для дробных чисел (площадь, метры). Намеренно не <input type="number">:
 * там браузер с английской локалью молча съедает запятую, и «86,4» становится
 * «864». Здесь принимаются оба разделителя, а при потере фокуса значение
 * приводится к привычному виду.
 */
export function DecimalInput({
  value,
  onChange,
  className,
  maxDecimals = 2,
  placeholder,
  title,
}: Props) {
  const [text, setText] = useState(() => (value ? formatQuantity(value, maxDecimals) : ""));

  // Значение может измениться снаружи (пересчёт, загрузка проекта) — тогда
  // поле обновляем, но не мешаем пользователю, пока он печатает то же число.
  useEffect(() => {
    if (parseDecimalInput(text) !== value) {
      setText(value ? formatQuantity(value, maxDecimals) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      placeholder={placeholder}
      title={title}
      onChange={(e) => {
        const raw = e.target.value;
        // Разрешаем только цифры и один разделитель — буквы в площадь не нужны.
        if (!/^[\d]*[.,]?[\d]*$/.test(raw)) return;
        setText(raw);
        onChange(parseDecimalInput(raw));
      }}
      onBlur={() => setText(value ? formatQuantity(value, maxDecimals) : "")}
    />
  );
}
