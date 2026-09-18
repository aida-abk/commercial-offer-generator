import OpenAI from "openai";
import type { DedicatedCircuits, ExtractedProject, RoomSpec } from "./types";
import type { PdfPageImage } from "./pdf-to-images";

const EXTRACTION_SCHEMA = `{
  "projectName": "string",
  "clientName": "string (optional)",
  "totalAreaSqM": number,
  "ceilingHeightMeters": number,
  "panelLocation": "string — где стоит электрощит, например «у входа в квартиру»",
  "outlets": number,
  "switches": number,
  "lightPoints": number,
  "utpPoints": number,
  "warmFloorCircuits": number,
  "rooms": [{
    "name": "string",
    "areaSqM": number,
    "widthMeters": number,
    "lengthMeters": number,
    "panelToBoxMeters": number,
    "dropMeters": number,
    "outlets": number,
    "switches": number,
    "lightPoints": number,
    "utpPoints": number
  }],
  "dedicatedCircuits": {
    "fridge": number,
    "freezer": number,
    "airConditioners": number,
    "hob": number,
    "ovenMicrowave": number,
    "warmFloor": number
  },
  "notes": ["string"],
  "confidence": number between 0 and 1
}`;

const ROUTING_RULES = `КАК СЧИТАЕТСЯ ДЛИНА КАБЕЛЯ (по этому принципу и нужны размеры):
Кабель идёт от щита по дальней траектории: по потолку, затем вдоль стен до
распределительной коробки помещения. От коробки он идёт до точки и спускается
вниз к розетке, оттуда до следующей точки и снова вниз, и так далее.
Прокладка только по двум осям — по диагонали кабель не прокладывают, поэтому
нужны именно размеры стен и расстояния по чертежу, а не расстояние напрямую.

Кабели группируются по помещениям: в каждом помещении своя распределительная
коробка. Щит часто стоит у входа в квартиру.

Поэтому для каждого помещения важно снять с чертежа:
- габариты (widthMeters x lengthMeters) или площадь;
- panelToBoxMeters — трассу от щита до распределительной коробки помещения,
  считая по потолку и вдоль стен, а не по прямой;
- dropMeters — расстояние от потолка до розетки. Обычно указано на чертеже;
  если на чертеже его нет, оставь поле пустым, и система примет 3 м.

ОТДЕЛЬНЫЕ ГРУППЫ (каждая требует своего автомата):
- Холодильник — fridge
- Морозильник — freezer
- Кондиционер — airConditioners. Если кондиционеров несколько, нужно несколько
  групп, поэтому укажи их количество
- Варочная поверхность (электроплита) — hob. Единственная группа на кабеле 3*6 мм2
- Духовой шкаф и СВЧ — ovenMicrowave, это одна объединённая группа
- Тёплый пол — warmFloor
Все эти группы идут кабелем ВВГнг 3*2,5 мм2, и только варочная поверхность — 3*6 мм2.
Ищи эти потребители на плане расстановки мебели, плане розеток и в ведомости
мебельного наполнения.

ВАЖНО про поле outlets внутри rooms: не включай туда розетки потребителей,
у которых есть отдельная группа (холодильник, морозильник, кондиционер,
духовой шкаф со СВЧ) — они попадут в расчёт через dedicatedCircuits.
А вот в общем поле outlets на верхнем уровне учитывай все розетки, включая их.`;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

function parseExtractedJson(raw: string): ExtractedProject {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  const parsed = JSON.parse(jsonText) as ExtractedProject;
  return {
    projectName: parsed.projectName || "Без названия",
    clientName: parsed.clientName,
    totalAreaSqM: Number(parsed.totalAreaSqM) || 0,
    ceilingHeightMeters: positiveOrUndefined(parsed.ceilingHeightMeters),
    panelLocation: parsed.panelLocation,
    outlets: Number(parsed.outlets) || 0,
    switches: Number(parsed.switches) || 0,
    lightPoints: Number(parsed.lightPoints) || 0,
    utpPoints: Number(parsed.utpPoints) || 0,
    warmFloorCircuits: Number(parsed.warmFloorCircuits) || 0,
    rooms: parseRooms(parsed.rooms),
    dedicatedCircuits: parseDedicatedCircuits(parsed.dedicatedCircuits),
    estimatedCircuits: parsed.estimatedCircuits,
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
  };
}

function positiveOrUndefined(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseRooms(rooms: unknown): RoomSpec[] | undefined {
  if (!Array.isArray(rooms)) return undefined;
  const parsed = rooms
    .map((raw, i) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return {
        name: typeof r.name === "string" && r.name.trim() ? r.name : `Помещение ${i + 1}`,
        areaSqM: positiveOrUndefined(r.areaSqM),
        widthMeters: positiveOrUndefined(r.widthMeters),
        lengthMeters: positiveOrUndefined(r.lengthMeters),
        ceilingHeightMeters: positiveOrUndefined(r.ceilingHeightMeters),
        panelToBoxMeters: positiveOrUndefined(r.panelToBoxMeters),
        dropMeters: positiveOrUndefined(r.dropMeters),
        outlets: Number(r.outlets) || 0,
        switches: Number(r.switches) || 0,
        lightPoints: Number(r.lightPoints) || 0,
        utpPoints: Number(r.utpPoints) || 0,
      } satisfies RoomSpec;
    })
    .filter((r) => r.outlets + r.switches + r.lightPoints + r.utpPoints > 0);
  return parsed.length ? parsed : undefined;
}

function parseDedicatedCircuits(raw: unknown): DedicatedCircuits | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const source = raw as Record<string, unknown>;
  const keys: (keyof DedicatedCircuits)[] = [
    "fridge",
    "freezer",
    "airConditioners",
    "hob",
    "ovenMicrowave",
    "warmFloor",
  ];
  const result: DedicatedCircuits = {};
  let any = false;
  for (const key of keys) {
    const count = Math.max(0, Math.round(Number(source[key]) || 0));
    if (count > 0) {
      result[key] = count;
      any = true;
    }
  }
  return any ? result : undefined;
}

export async function extractProjectFromImages(
  images: PdfPageImage[],
): Promise<ExtractedProject> {
  if (images.length === 0) {
    throw new Error("No page images provided for vision extraction");
  }

  const client = getOpenAIClient();
  const imageContent = images.map((img) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
      detail: "high" as const,
    },
  }));

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Ты инженер-электрик и читаешь российские и казахстанские дизайн-проекты и " +
          "электрические чертежи квартир. Твоя задача — снять с чертежей данные для " +
          "сметы на черновые электромонтажные работы: количество точек по помещениям, " +
          "размеры и расстояния, а также потребителей, которым нужна отдельная группа. " +
          "Размеры на чертежах почти всегда в миллиметрах — переводи их в метры. " +
          "Отвечай строго одним JSON-объектом, без пояснений.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Сними с этих листов данные для расчёта электрики.\n\nСхема ответа:\n${EXTRACTION_SCHEMA}\n\n` +
              `${ROUTING_RULES}\n\n` +
              "Где что искать: количество точек — на листах «План розеток», «РОЗЕТКИ», " +
              "«План осветительных приборов», «СВЕТ», «План выключателей», «ВЫКЛ»; " +
              "габариты помещений — на обмерном плане и плане монтажа; площади — в " +
              "ведомости отделочных материалов; бытовую технику — на плане расстановки " +
              "мебели и в ведомости мебельного наполнения.\n" +
              "Если размер или расстояние на чертеже не указан, не выдумывай его: " +
              "оставь поле пустым и напиши об этом в notes. " +
              "Разбивку по помещениям заполняй только тем, что реально видно на планах; " +
              "если планов с точками нет, верни rooms пустым и заполни только общие " +
              "количества. Сумма точек по rooms не должна превышать общие количества.",
          },
          ...imageContent,
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Vision model returned empty response");
  }
  return parseExtractedJson(content);
}

export async function extractProjectFromPdfBuffer(
  pdfBuffer: Buffer,
  convert: (buf: Buffer) => Promise<PdfPageImage[]>,
): Promise<ExtractedProject> {
  const images = await convert(pdfBuffer);
  return extractProjectFromImages(images);
}
