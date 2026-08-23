import OpenAI from "openai";
import type { ExtractedProject } from "./types";
import type { PdfPageImage } from "./pdf-to-images";

const EXTRACTION_SCHEMA = `{
  "projectName": "string",
  "clientName": "string (optional)",
  "totalAreaSqM": number,
  "outlets": number,
  "switches": number,
  "lightPoints": number,
  "utpPoints": number,
  "warmFloorCircuits": number,
  "estimatedCircuits": [{ "amps": 10|16|32|50, "count": number }],
  "notes": ["string"],
  "confidence": number between 0 and 1
}`;

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
    outlets: Number(parsed.outlets) || 0,
    switches: Number(parsed.switches) || 0,
    lightPoints: Number(parsed.lightPoints) || 0,
    utpPoints: Number(parsed.utpPoints) || 0,
    warmFloorCircuits: Number(parsed.warmFloorCircuits) || 0,
    estimatedCircuits: parsed.estimatedCircuits,
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
  };
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
          "You analyze Russian/Kazakh electrical and interior design PDF floor plans. " +
          "Count розетки (outlets), выключатели (switches), light points, UTP/data points, " +
          "warm floor circuits, and estimate total apartment area in m². Return strict JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Extract electrical quantities from these plan pages. Schema:\n${EXTRACTION_SCHEMA}\n` +
              "Prefer counts from dedicated sheets (РОЗЕТКИ, СВЕТ, ВЫКЛ). Add notes for uncertainty.",
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
