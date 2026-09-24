import OpenAI from "openai";
import { makeRoom, nextRoomId, roomTypeFromName, withRoomAggregates } from "./rooms";
import type { ExtractedProject, Room, RoomType } from "./types";
import type { PdfPageImage } from "./pdf-to-images";

const ROOM_TYPES: RoomType[] = [
  "kitchen",
  "living",
  "bedroom",
  "office",
  "hallway",
  "bathroom",
  "balcony",
  "utility",
  "other",
];

const EXTRACTION_SCHEMA = `{
  "projectName": "string",
  "clientName": "string (optional)",
  "totalAreaSqM": number,
  "rooms": [
    {
      "name": "string — как помещение названо в проекте",
      "type": "kitchen|living|bedroom|office|hallway|bathroom|balcony|utility|other",
      "areaSqM": number,
      "outlets": number,
      "lightPoints": number,
      "lightGroups": number,
      "switchesSingle": number,
      "switchesTwoWay": number,
      "switchesThreeWay": number,
      "warmFloorLoops": number,
      "airConditioners": number,
      "utpPoints": number
    }
  ],
  "leakSensor": boolean,
  "areaSource": "explication | plan | unknown — откуда взята общая площадь",
  "notes": ["string"],
  "confidence": number between 0 and 1
}`;

/** Правила предметной области — модель считает по ним, а не «на глаз». */
const DOMAIN_RULES = [
  "totalAreaSqM — ОБЩАЯ площадь объекта, включая балконы, санузлы и технические помещения. " +
    "Бери её из экспликации помещений («Экспликация помещений», «Ведомость помещений», столбец S, м²): " +
    "если в ней нет строки «Итого», сложи площади всех помещений сам. " +
    "Текст страниц дан ниже — экспликация обычно есть именно там.",
  "areaSqM у помещения — из той же экспликации. Если площади помещения в проекте нет, верни 0, а не выдумывай.",
  "Если общую площадь найти не удалось, верни totalAreaSqM = 0 и areaSource = \"unknown\". " +
    "Ноль лучше выдуманного числа: пользователь введёт площадь руками.",
  "Точки (розетки, светильники, выключатели, тёплый пол, кондиционеры, UTP) считай ПО ИЗОБРАЖЕНИЯМ " +
    "страниц — в текстовом слое их нет. Текст нужен только для экспликации, названий помещений и площадей.",
  "Смотри листы «План электрики», «План розеток», «План освещения», «План привязки осветительных приборов " +
    "к выключателям», «План тёплого пола». На них есть легенда условных обозначений — по ней отличай " +
    "розетку от выключателя и от светильника.",
  "Если на листе есть таблица спецификации («Розеточная группа», «Ведомость», «Экспликация оборудования», " +
    "столбец «Кол-во») — это главный источник. Сумма по всем помещениям ОБЯЗАНА совпасть с итогом из " +
    "таблицы: если в таблице 36 розеток, разнеси ровно 36 по комнатам. Недостачу отнеси к помещениям, " +
    "где значков больше всего.",
  "Проходной выключатель видно по тому, что одна и та же группа света управляется из двух мест " +
    "(два значка выключателя, связанные с одной группой) — это switchesTwoWay = 2, а не два обычных.",
  "Считай значки в границах каждого помещения и разноси их по комнатам из экспликации.",
  "Нули по всем помещениям недопустимы, если на планах видны значки: посчитай столько, сколько видишь, " +
    "и снизь confidence, если не уверен.",
  "lightPoints — все точки света в помещении (софиты, люстры, бра).",
  "lightGroups — сколько независимых групп света, то есть мест управления светом.",
  "switchesTwoWay — проходные выключатели (места). Их проектируют в проходах/коридорах и в спальнях (один у входа, второй у изголовья). В схеме обычно 2 места.",
  "switchesThreeWay — управление из 3 мест (3 места в схеме), встречается реже.",
  "warmFloorLoops — контуры электрического тёплого пола в этом помещении.",
  "airConditioners — внутренние блоки кондиционера в этом помещении.",
  "utpPoints — точки UTP: в квартирах это ТВ-зоны, плюс кабинет. Обычно 1-3 точки на объект.",
  "leakSensor — есть ли датчик протечки воды («Нептун»).",
  "projectName и clientName пиши ПО-РУССКИ, как они написаны в проекте (ЖК «София», а не Sofiya). " +
    "Если заказчик в проекте не указан — верни пустую строку. Никаких Unknown, N/A и прочих заглушек.",
  "notes пиши на русском языке.",
  "Если помещение видно на плане, но точки в нём не проставлены — верни 0, а не выдумывай.",
].join("\n- ");

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

/** Заглушки модели («Unknown», «N/A») не должны попадать в КП заказчику. */
const PLACEHOLDER_NAME = /^(unknown|n\/?a|none|null|no name|не указан[оаы]?|нет данных|[-—–.]+)$/i;

export function cleanName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER_NAME.test(trimmed)) return undefined;
  return trimmed;
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function normalizeRoom(raw: unknown): Room | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Помещение";
  const declared = typeof r.type === "string" ? (r.type as RoomType) : undefined;
  const type = declared && ROOM_TYPES.includes(declared) ? declared : roomTypeFromName(name);
  const areaRaw = Number(r.areaSqM);
  const lightPoints = toInt(r.lightPoints);

  return makeRoom({
    id: nextRoomId(),
    name,
    type,
    // Площадь не выдумываем: 0 означает «в проекте не указана».
    areaSqM: Number.isFinite(areaRaw) && areaRaw > 0 ? areaRaw : 0,
    outlets: toInt(r.outlets),
    lightPoints,
    // Групп света не может быть больше, чем точек.
    lightGroups: Math.max(1, Math.min(toInt(r.lightGroups, 1), Math.max(1, lightPoints))),
    switchesSingle: toInt(r.switchesSingle),
    switchesTwoWay: toInt(r.switchesTwoWay),
    switchesThreeWay: toInt(r.switchesThreeWay),
    warmFloorLoops: toInt(r.warmFloorLoops),
    airConditioners: toInt(r.airConditioners),
    utpPoints: toInt(r.utpPoints),
  });
}

function parseExtractedJson(raw: string): ExtractedProject {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;

  const rooms = Array.isArray(parsed.rooms)
    ? parsed.rooms.map(normalizeRoom).filter((r): r is Room => r !== null)
    : [];

  const notes = Array.isArray(parsed.notes) ? (parsed.notes as string[]) : [];
  if (rooms.length === 0) {
    notes.push("Помещения из проекта не распознаны — состав восстановлен по площади, проверьте вручную.");
  }

  const declaredArea = Number(parsed.totalAreaSqM) || 0;
  const roomsArea = rooms.reduce((s2, r) => s2 + r.areaSqM, 0);
  const totalAreaSqM = declaredArea > 0 ? declaredArea : roomsArea;
  const areaSource: ExtractedProject["areaSource"] =
    declaredArea > 0 ? "explication" : roomsArea > 0 ? "rooms" : "unknown";

  if (areaSource === "rooms") {
    notes.push(`Общая площадь не указана явно — сложена из площадей помещений: ${roomsArea.toFixed(1).replace(/\.0$/, "")} м².`);
  }
  if (areaSource === "unknown") {
    notes.push("Общую площадь в проекте найти не удалось — укажите её вручную.");
  }

  const project: ExtractedProject = {
    projectName: cleanName(parsed.projectName) ?? "Без названия",
    clientName: cleanName(parsed.clientName),
    totalAreaSqM,
    areaSource,
    outlets: toInt(parsed.outlets),
    switches: toInt(parsed.switches),
    lightPoints: toInt(parsed.lightPoints),
    utpPoints: toInt(parsed.utpPoints),
    warmFloorCircuits: toInt(parsed.warmFloorCircuits),
    rooms: rooms.length > 0 ? rooms : undefined,
    leakSensor: parsed.leakSensor !== false,
    notes,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
  };

  // Агрегаты всегда пересчитываются из комнат — они служат для совместимости.
  return withRoomAggregates(project);
}

/** Сколько символов текста страниц отдаём модели — экспликация короткая, но
 *  в альбомах текста бывает много, а лимит запроса общий с картинками. */
const MAX_TEXT_CHARS = 12_000;

function buildPagesTextBlock(texts?: Record<number, string>): string {
  if (!texts) return "";
  const parts: string[] = [];
  let used = 0;
  for (const [pageNumber, text] of Object.entries(texts)) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const chunk = `--- Страница ${pageNumber} ---\n${trimmed.slice(0, 3000)}`;
    if (used + chunk.length > MAX_TEXT_CHARS) break;
    parts.push(chunk);
    used += chunk.length;
  }
  if (parts.length === 0) {
    return (
      "\n\nТекстового слоя в PDF нет (скан или чертёж в кривых) — читай всё по изображениям " +
      "и будь осторожен с площадями: если не видишь цифр, верни 0."
    );
  }
  return (
    "\n\nТекст выбранных страниц. Отсюда бери ТОЛЬКО экспликацию (названия помещений и площади) " +
    "и название объекта — точек электрики в тексте нет, их считай по изображениям:\n" +
    parts.join("\n\n")
  );
}

/** Сколько листов уходит в один запрос: упирается в лимит токенов в минуту у аккаунта. */
function pagesPerRequest(): number {
  const value = Number(process.env.OPENAI_PAGES_PER_REQUEST);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 3;
}

function isRateLimitError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { status?: number }).status === 429 ||
      (err as { code?: string }).code === "rate_limit_exceeded")
  );
}

const RETRY_DELAYS_MS = [20_000, 45_000, 70_000];

/**
 * Простой счётчик токенов в минуту. Аккаунт ограничен по TPM, и без паузы
 * последние пачки просто исчерпывают повторы и теряют листы. Лучше подождать
 * заранее, чем потерять страницу проекта.
 */
const tpmWindow = { startedAt: 0, tokens: 0 };

function tpmBudget(): number {
  const value = Number(process.env.OPENAI_TPM_BUDGET);
  return Number.isFinite(value) && value > 0 ? value : 9_000;
}

/** Грубая оценка запроса: лист A3 в high detail ≈ 2200 токенов + промпт с текстом. */
function estimateBatchTokens(imageCount: number): number {
  return imageCount * 2_200 + 1_800;
}

async function reserveTokens(estimated: number): Promise<void> {
  const budget = tpmBudget();
  const now = Date.now();
  if (now - tpmWindow.startedAt >= 60_000) {
    tpmWindow.startedAt = now;
    tpmWindow.tokens = 0;
  }
  if (tpmWindow.tokens > 0 && tpmWindow.tokens + estimated > budget) {
    const wait = Math.max(0, 60_000 - (now - tpmWindow.startedAt));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    tpmWindow.startedAt = Date.now();
    tpmWindow.tokens = 0;
  }
  tpmWindow.tokens += estimated;
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err) || attempt === RETRY_DELAYS_MS.length) break;
      // Лимит токенов в минуту — ждём и повторяем, иначе распознавание просто упадёт.
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

function roomKey(room: Room): string {
  return room.name.trim().toLowerCase();
}

/** Берёт большее из двух значений: лист без розеток вернёт 0, лист с розетками — реальное число. */
function mergeRoomPair(a: Room, b: Room): Room {
  return {
    ...a,
    areaSqM: Math.max(a.areaSqM, b.areaSqM),
    outlets: Math.max(a.outlets, b.outlets),
    lightPoints: Math.max(a.lightPoints, b.lightPoints),
    lightGroups: Math.max(a.lightGroups, b.lightGroups),
    switchesSingle: Math.max(a.switchesSingle, b.switchesSingle),
    switchesTwoWay: Math.max(a.switchesTwoWay, b.switchesTwoWay),
    switchesThreeWay: Math.max(a.switchesThreeWay, b.switchesThreeWay),
    warmFloorLoops: Math.max(a.warmFloorLoops, b.warmFloorLoops),
    airConditioners: Math.max(a.airConditioners, b.airConditioners),
    utpPoints: Math.max(a.utpPoints, b.utpPoints),
  };
}

/**
 * Сводит комнаты из разных пачек листов. Одноимённые помещения (два балкона,
 * два санузла) сопоставляются по порядку, а не схлопываются в одно.
 */
function mergeRooms(base: Room[], next: Room[]): Room[] {
  const result = [...base];
  const slots = new Map<string, number[]>();
  base.forEach((room, index) => {
    const key = roomKey(room);
    slots.set(key, [...(slots.get(key) ?? []), index]);
  });

  const used = new Map<string, number>();
  for (const room of next) {
    const key = roomKey(room);
    const seen = used.get(key) ?? 0;
    used.set(key, seen + 1);
    const index = slots.get(key)?.[seen];
    if (index === undefined) {
      result.push(room);
      continue;
    }
    result[index] = mergeRoomPair(result[index], room);
  }
  return result;
}

/** Заметки пачек, которым не досталось планов, противоречат итогу — их убираем. */
const EMPTY_BATCH_NOTE = /не удалось определить количеств|не видн|не определен|не обнаружен/i;

/** Сводит ответы по пачкам листов в один проект. */
export function mergeProjects(parts: ExtractedProject[]): ExtractedProject {
  const merged = parts.reduce((acc, part) => {
    const rooms = mergeRooms(acc.rooms ?? [], part.rooms ?? []);
    const areaFromExplication =
      acc.areaSource === "explication"
        ? acc.totalAreaSqM
        : part.areaSource === "explication"
          ? part.totalAreaSqM
          : Math.max(acc.totalAreaSqM, part.totalAreaSqM);
    return {
      ...acc,
      projectName:
        acc.projectName && acc.projectName !== "Без названия" ? acc.projectName : part.projectName,
      clientName: acc.clientName ?? part.clientName,
      totalAreaSqM: areaFromExplication,
      areaSource:
        acc.areaSource === "explication" || part.areaSource === "explication"
          ? "explication"
          : rooms.some((r) => r.areaSqM > 0)
            ? "rooms"
            : "unknown",
      rooms,
      leakSensor: acc.leakSensor || part.leakSensor,
      notes: [...new Set([...acc.notes, ...part.notes])],
      confidence:
        acc.confidence !== undefined && part.confidence !== undefined
          ? Math.min(acc.confidence, part.confidence)
          : (acc.confidence ?? part.confidence),
    };
  });

  const hasPoints = (merged.rooms ?? []).some((r) => r.outlets > 0 || r.lightPoints > 0);
  return withRoomAggregates({
    ...merged,
    notes: hasPoints ? merged.notes.filter((n) => !EMPTY_BATCH_NOTE.test(n)) : merged.notes,
  });
}

/** Расход токенов на распознавание — по нему считается сгорание кредитов OpenAI. */
export interface ExtractionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
}

export interface ExtractProgress {
  (done: number, total: number, usage: ExtractionUsage): void;
}

/** Цена gpt-4o, $/1M токенов. Меняется — правится здесь. */
const PRICE_PER_MTOK = { input: 2.5, output: 10 };

export function usageCostUsd(usage: ExtractionUsage): number {
  return (
    (usage.promptTokens / 1_000_000) * PRICE_PER_MTOK.input +
    (usage.completionTokens / 1_000_000) * PRICE_PER_MTOK.output
  );
}

export async function extractProjectFromImages(
  images: PdfPageImage[],
  pageTexts?: Record<number, string>,
  onBatch?: ExtractProgress,
): Promise<ExtractedProject> {
  if (images.length === 0) {
    throw new Error("No page images provided for vision extraction");
  }

  const size = pagesPerRequest();
  const batches: PdfPageImage[][] = [];
  for (let i = 0; i < images.length; i += size) {
    batches.push(images.slice(i, i + size));
  }

  const parts: ExtractedProject[] = [];
  const failures: string[] = [];
  const usage: ExtractionUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
  };

  for (const [index, batch] of batches.entries()) {
    const batchTexts = pageTexts
      ? Object.fromEntries(batch.map((img) => [img.pageNumber, pageTexts[img.pageNumber] ?? ""]))
      : undefined;
    try {
      await reserveTokens(estimateBatchTokens(batch.length));
      const { project, usage: batchUsage } = await extractBatch(
        batch,
        batchTexts,
        index + 1,
        batches.length,
      );
      parts.push(project);
      usage.promptTokens += batchUsage.promptTokens;
      usage.completionTokens += batchUsage.completionTokens;
      usage.totalTokens += batchUsage.totalTokens;
      usage.requests += 1;
      // Уточняем окно фактическим расходом вместо оценки.
      tpmWindow.tokens += Math.max(
        0,
        batchUsage.totalTokens - estimateBatchTokens(batch.length),
      );
    } catch (err) {
      // Одна сбойная пачка не должна валить всё распознавание — остальные листы
      // уже обработаны, а пропуск виден в заметках.
      failures.push(
        `Листы ${batch.map((i) => i.pageNumber).join(", ")} не распознаны: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    onBatch?.(index + 1, batches.length, usage);
  }

  if (parts.length === 0) {
    throw new Error(failures.join("; ") || "Распознавание не дало результата");
  }

  const merged = parts.length === 1 ? withRoomAggregates(parts[0]) : mergeProjects(parts);
  return failures.length > 0
    ? { ...merged, notes: [...merged.notes, ...failures, "Проверьте количества вручную."] }
    : merged;
}

async function extractBatch(
  images: PdfPageImage[],
  pageTexts: Record<number, string> | undefined,
  batchNumber: number,
  batchCount: number,
): Promise<{ project: ExtractedProject; usage: ExtractionUsage }> {
  const client = getOpenAIClient();
  const imageContent = images.map((img) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
      detail: "high" as const,
    },
  }));

  const requestOnce = (extraInstruction: string) =>
    withRateLimitRetry(() =>
      client.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Ты разбираешь дизайн-проекты и проекты электрики на русском и казахском языке. " +
          "Твоя задача — выдать ПОКОМНАТНЫЙ состав: по каждому помещению из экспликации " +
          "посчитать розетки, точки света, выключатели, тёплый пол, кондиционеры и точки UTP. " +
          "Помещения и площади бери из экспликации, а значки точек считай по изображениям планов " +
          "(РОЗЕТКИ, СВЕТ, ВЫКЛЮЧАТЕЛИ, план электрики, план тёплого пола), сверяясь с легендой. " +
          "Это смета: пропущенная точка — это недостающий кабель и автомат, поэтому считай внимательно. " +
          "Возвращай строго JSON без пояснений.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Схема ответа:\n${EXTRACTION_SCHEMA}\n\nПравила:\n- ${DOMAIN_RULES}\n\n` +
              (batchCount > 1
                ? `Это листы ${images.map((i) => i.pageNumber).join(", ")} (пачка ${batchNumber} из ${batchCount}). ` +
                  "Заполняй то, что видно на этих листах; чего на них нет — оставляй 0. "
                : "") +
              "Перечисли ВСЕ помещения объекта, включая санузлы, балконы, гардеробные и коридоры. " +
              "В notes напиши, что осталось неясным." +
              extraInstruction +
              buildPagesTextBlock(pageTexts),
          },
          ...imageContent,
        ],
      },
    ],
      }),
    );

  let response = await requestOnce("");
  let content = response.choices[0]?.message?.content;

  // Иногда модель отвечает пустой строкой — например, если на листе нет ничего
  // по её части. Просим ещё раз, явно разрешив пустой результат.
  if (!content) {
    response = await requestOnce(
      "\n\nЕсли на этих листах нет нужных данных, всё равно верни корректный JSON " +
        "по схеме: rooms может быть пустым массивом, числа — нулями. Пустой ответ недопустим.",
    );
    content = response.choices[0]?.message?.content;
  }

  if (!content) {
    const choice = response.choices[0];
    // Пустой ответ бывает на листах без полезных данных; отказ модели приходит
    // отдельным полем refusal.
    const refusal = (choice?.message as { refusal?: string } | undefined)?.refusal;
    throw new Error(
      `Модель не вернула ответ по листам ${images.map((i) => i.pageNumber).join(", ")}` +
        (refusal ? `: ${refusal}` : "") +
        (choice?.finish_reason ? ` (причина: ${choice.finish_reason})` : ""),
    );
  }
  return {
    project: parseExtractedJson(content),
    usage: {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
      requests: 1,
    },
  };
}

export async function extractProjectFromPdfBuffer(
  pdfBuffer: Buffer,
  convert: (buf: Buffer) => Promise<PdfPageImage[]>,
  pageTexts?: Record<number, string>,
): Promise<ExtractedProject> {
  const images = await convert(pdfBuffer);
  return extractProjectFromImages(images, pageTexts);
}
