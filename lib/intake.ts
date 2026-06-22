import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { capInput, screenText, MAX_INPUT_CHARS, type ScreenResult } from "@/lib/ai/screen";

// The structured shape we extract from a free-text CBO meal request.
export const RECURRENCES = ["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type Recurrence = (typeof RECURRENCES)[number];
export type Confidence = "high" | "medium" | "low";

export const intakeFieldsSchema = z.object({
  cbo: z.string().nullable(),
  quantity: z.number().int().positive().nullable(),
  deliveryDate: z.string().nullable(), // ISO YYYY-MM-DD
  recurrence: z.enum(RECURRENCES).nullable(),
  dietaryConstraints: z.array(z.string()),
  location: z.string().nullable(),
  notes: z.string().nullable(),
});
export type IntakeFields = z.infer<typeof intakeFieldsSchema>;

export type ConfidenceFlags = Partial<
  Record<keyof IntakeFields, Confidence>
>;

export interface IntakeParseResult {
  fields: IntakeFields;
  confidence: ConfidenceFlags;
  modelUsed: string;
}

const MODEL = "claude-haiku-4-5";

/** Hard cap on intake free-text length — bounds token cost and parse work.
 * TODO: pair with durable per-client rate limiting (Vercel KV/Upstash) for
 * full cost-DoS protection. */
export const MAX_INTAKE_CHARS = MAX_INPUT_CHARS;

/** Trim and truncate intake text to the cost cap. Delegates to the shared screen. */
export function capIntakeInput(raw: string): string {
  return capInput(raw);
}

/**
 * Pure input safety screen — runs BEFORE any model call. Thin wrapper over the
 * shared `screenText` primitive (lib/ai/screen.ts) so intake and the "ask"
 * search box share one injection denylist + control-char + length guard.
 */
export function screenIntakeInput(raw: string): ScreenResult {
  return screenText(raw);
}

const TOOL: Anthropic.Tool = {
  name: "submit_meal_request",
  description:
    "Record the structured meal request extracted from a community-based organization's message.",
  input_schema: {
    type: "object",
    properties: {
      cbo: {
        type: ["string", "null"],
        description: "Name of the community-based organization making the request.",
      },
      quantity: {
        type: ["integer", "null"],
        description: "Number of meals requested per delivery.",
      },
      deliveryDate: {
        type: ["string", "null"],
        description: "First/next delivery date as an ISO 8601 date (YYYY-MM-DD). Resolve relative dates against today's date provided in the system prompt.",
      },
      recurrence: {
        type: ["string", "null"],
        enum: [...RECURRENCES, null],
        description: "How often deliveries should repeat.",
      },
      dietaryConstraints: {
        type: "array",
        items: { type: "string" },
        description:
          "Dietary requirements mentioned (e.g. halal, kosher, low-sodium, diabetic-friendly, vegetarian).",
      },
      location: {
        type: ["string", "null"],
        description: "Delivery location / neighborhood if stated.",
      },
      notes: {
        type: ["string", "null"],
        description: "Any other operationally relevant detail.",
      },
      confidence: {
        type: "object",
        description:
          "Your confidence for each extracted field. Use 'low' when the field was guessed or absent.",
        properties: {
          cbo: { type: "string", enum: ["high", "medium", "low"] },
          quantity: { type: "string", enum: ["high", "medium", "low"] },
          deliveryDate: { type: "string", enum: ["high", "medium", "low"] },
          recurrence: { type: "string", enum: ["high", "medium", "low"] },
          dietaryConstraints: { type: "string", enum: ["high", "medium", "low"] },
          location: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    required: ["cbo", "quantity", "deliveryDate", "dietaryConstraints", "confidence"],
  },
};

/**
 * Parse a free-text meal request into structured fields + per-field confidence.
 * Uses the Anthropic API when ANTHROPIC_API_KEY is set; otherwise falls back to a
 * deterministic parser so the demo always works offline.
 */
export async function parseIntakeEmail(
  raw: string,
  today: Date = new Date(),
): Promise<IntakeParseResult> {
  const capped = capIntakeInput(raw);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return deterministicParse(capped);

  const client = new Anthropic({ apiKey: key });
  const todayStr = today.toISOString().slice(0, 10);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      `You extract structured meal-request data for Rethink Food's intake queue. ` +
      `Today's date is ${todayStr}. Resolve relative dates (e.g. "next Wednesday") against it. ` +
      `Only extract what is present; never invent a quantity or date. Mark absent/guessed fields low confidence. ` +
      `Always call the submit_meal_request tool.`,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: capped }],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    // Model failed to use the tool — fall back rather than crash the demo.
    return deterministicParse(capped);
  }

  const input = block.input as Record<string, unknown>;
  const confidence = (input.confidence ?? {}) as ConfidenceFlags;
  const fields = intakeFieldsSchema.parse({
    cbo: input.cbo ?? null,
    quantity: input.quantity ?? null,
    deliveryDate: input.deliveryDate ?? null,
    recurrence: (input.recurrence as Recurrence | null) ?? null,
    dietaryConstraints: Array.isArray(input.dietaryConstraints)
      ? input.dietaryConstraints
      : [],
    location: input.location ?? null,
    notes: input.notes ?? null,
  });

  return { fields, confidence, modelUsed: MODEL };
}

// ----------------------------------------------------------------------------
// Deterministic fallback — regex/keyword based. Good enough to demo the flow
// without an API key, and used as a safety net if the model misbehaves.
// ----------------------------------------------------------------------------
const DIET_KEYWORDS = [
  "halal", "kosher", "vegetarian", "vegan", "low-sodium", "low sodium",
  "lower-sodium", "lower sodium", "diabetic", "gluten-free", "gluten free",
  "dairy-free", "nut-free",
];

export function deterministicParse(raw: string): IntakeParseResult {
  const text = raw.toLowerCase();

  // Allow a few words between the number and the unit ("250 halal meals").
  const qtyMatch = raw.match(
    /\b(\d{2,4})\b[^\d.]{0,20}?\b(?:meals?|portions?|servings?)\b/i,
  );
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : null;

  const dayOfWeek =
    /\bevery (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  let recurrence: Recurrence | null = null;
  if (/\bbi-?weekly|every other week\b/i.test(raw)) recurrence = "BIWEEKLY";
  else if (/\bweekly|every week|each week\b/i.test(raw) || dayOfWeek.test(raw))
    recurrence = "WEEKLY";
  else if (/\bmonthly|every month\b/i.test(raw)) recurrence = "MONTHLY";
  else if (/\bone-?time|just once|tomorrow\b/i.test(raw)) recurrence = "ONE_TIME";

  const dietaryConstraints = [...new Set(
    DIET_KEYWORDS.filter((k) => text.includes(k)).map((k) => k.replace(/\s/g, "-")),
  )];

  // crude CBO guess: a capitalized phrase before "needs/requests/would like"
  const cboMatch = raw.match(/([A-Z][A-Za-z.&'\- ]{2,40}?)\s+(?:needs|requests|would like|is requesting)/);
  const cbo = cboMatch ? cboMatch[1].trim() : null;

  return {
    fields: {
      cbo,
      quantity,
      deliveryDate: null,
      recurrence,
      dietaryConstraints,
      location: null,
      notes: null,
    },
    confidence: {
      cbo: cbo ? "medium" : "low",
      quantity: quantity ? "high" : "low",
      deliveryDate: "low",
      recurrence: recurrence ? "medium" : "low",
      dietaryConstraints: dietaryConstraints.length ? "medium" : "low",
      location: "low",
    },
    modelUsed: "deterministic-fallback",
  };
}
