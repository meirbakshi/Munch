import Anthropic from "@anthropic-ai/sdk";
import type { Food, ParseResult } from "../../shared/types.ts";
import { MODEL, SYSTEM, submitValidator, lookup } from "./parseCommon.ts";

const MAX_ROUNDS = 12;

const submitSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "notes"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "amount", "unit", "meal", "calories", "carbs", "protein", "fat", "fiber", "source", "sourceNote"],
        properties: {
          name: { type: "string", description: "Food name in Hebrew" },
          amount: { type: "number" },
          unit: { type: "string", description: "Unit in Hebrew, e.g. גרם, יחידה, כוס, פרוסה, כף" },
          meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack", "unknown"] },
          calories: { type: "number" },
          carbs: { type: "number" },
          protein: { type: "number" },
          fat: { type: "number" },
          fiber: { type: "number" },
          source: { type: "string", enum: ["user", "library", "web", "reference"] },
          sourceNote: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
} as const;

const tools: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "search_my_foods",
    description:
      "Search the user's personal list of custom foods and recipes (imported from Lose It). Returns matching items with nutrition values per serving. Query with a short Hebrew (or English) food name.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string" } },
    },
    strict: true,
  },
  {
    name: "submit_food_log",
    description: "Submit the final structured list of foods. Call exactly once, after all lookups are done.",
    input_schema: submitSchema as unknown as Anthropic.Beta.BetaTool.InputSchema,
    strict: true,
  },
  { type: "web_search_20260209", name: "web_search", max_uses: 8 },
];

let client: { key: string; c: Anthropic } | null = null;
function getClient(apiKey: string): Anthropic {
  if (client?.key !== apiKey) {
    // The app has no backend: requests go straight from the browser to the Claude API,
    // using the key the user saved on their own device.
    client = { key: apiKey, c: new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) };
  }
  return client.c;
}

export class ParseError extends Error {}

async function run(text: string, foods: Food[], apiKey: string): Promise<ParseResult> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: text }];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await getClient(apiKey).beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools,
      messages,
    });

    if (response.stop_reason === "refusal") throw new ParseError("הבקשה נדחתה על ידי המודל.");
    if (response.stop_reason === "max_tokens") throw new ParseError("התשובה ארוכה מדי. נסו לפצל את הרישום.");

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue; // server-side web search loop paused; resend to resume

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

    const submit = toolUses.find((b) => b.name === "submit_food_log");
    if (submit) {
      const parsed = submitValidator.safeParse(submit.input);
      if (!parsed.success) throw new ParseError("המודל החזיר מבנה לא תקין.");
      return {
        notes: parsed.data.notes,
        items: parsed.data.items.map((it) => ({ ...it, meal: it.meal === "unknown" ? null : it.meal })),
      };
    }

    if (!toolUses.length) {
      // Model ended without submitting — nudge it once more.
      messages.push({ role: "user", content: "Please submit the result with submit_food_log." });
      continue;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((b) => {
      if (b.name === "search_my_foods") {
        const q = (b.input as { query?: unknown }).query;
        return { type: "tool_result", tool_use_id: b.id, content: lookup(foods, typeof q === "string" ? q : "") };
      }
      return { type: "tool_result", tool_use_id: b.id, content: `Unknown tool ${b.name}`, is_error: true };
    });
    messages.push({ role: "user", content: results });
  }
  throw new ParseError("הניתוח לקח יותר מדי צעדים. נסו לפצל את הרישום.");
}

export async function parseFoodText(text: string, foods: Food[], apiKey: string): Promise<ParseResult> {
  try {
    return await run(text, foods, apiKey);
  } catch (err) {
    if (err instanceof ParseError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new ParseError("מפתח ה-API שגוי. בדקו אותו בהגדרות.");
    if (err instanceof Anthropic.PermissionDeniedError) throw new ParseError("למפתח ה-API אין הרשאה לבקשה הזו.");
    if (err instanceof Anthropic.RateLimitError) throw new ParseError("יותר מדי בקשות, נסו שוב בעוד רגע.");
    if (err instanceof Anthropic.APIConnectionError) throw new ParseError("אין חיבור לשירות הניתוח. בדקו את החיבור לאינטרנט.");
    if (err instanceof Anthropic.APIError) throw new ParseError(`שגיאה בשירות הניתוח (${err.status}).`);
    throw err;
  }
}
