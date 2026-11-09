import type { Food, ParseResult } from "../../shared/types.ts";
import { isSampleError, type SampleFn } from "./claude.ts";
import { MODEL, lookup, submitValidator } from "./parseCommon.ts";

/**
 * Parsing inside claude.ai: Claude runs on the viewer's own account through the
 * artifact `sample` capability. It can search the user's food library (a page tool),
 * but it can't browse the web, so non-library foods use standard reference values.
 */
const INSTRUCTIONS = `You turn a free-text food log, written in Hebrew, into a structured list of foods with nutrition values.

Work through the text item by item:
1. Split the text into individual foods/drinks. Infer the amount and unit the user ate (e.g. "2 פרוסות", "כוס", "150 גרם", "חצי"). When no amount is given, assume one typical serving and say so in the sourceNote.
2. For each item, pick nutrition values by this priority:
   a. "user": the user explicitly stated nutrition values for this item in the text (e.g. "יוגורט 120 קלוריות"). Use exactly what they wrote; fill in only the macros they didn't give, from the next sources.
   b. "library": the user's personal list of custom foods and recipes. Call search_my_foods for every item (try a shorter or alternative Hebrew name if the first search finds nothing). If there is a good match, use it and scale its per-serving values to the amount eaten.
   c. "reference": otherwise, use your best knowledge of standard nutrition values (the Israeli Ministry of Health database, USDA, and the labels of Israeli products and brands you know). Prefer per-100g values that you then scale to the amount eaten. You cannot browse the web.

Rules:
- Item names, units and sourceNote must be in Hebrew.
- All nutrient values are for the full amount eaten (not per 100g): calories in kcal, carbs / protein / fat / fiber in grams. Round calories to whole numbers and macros to one decimal.
- "carbs" is total carbohydrates excluding dietary fiber when the source separates them (as Israeli labels do).
- sourceNote briefly says where the numbers came from and any assumption (e.g. "לפי תווית תנובה, 100 גרם = 98 קק"ל", "הנחתי פרוסה בינונית").
- meal: infer from the text (בוקר / צהריים / ערב / נשנוש) or use "unknown".
- notes: one short Hebrew sentence for anything the user should double-check (for example values you are unsure of for a specific branded product), or an empty string.
- Do not invent foods the user did not mention.

When you are done, reply with ONLY one JSON object, no other text, in this shape:
{"items":[{"name":"ביצה קשה","amount":2,"unit":"יחידה","meal":"breakfast","calories":143,"carbs":0.7,"protein":12.6,"fat":9.5,"fiber":0,"source":"reference","sourceNote":"ערכים סטנדרטיים לביצה בינונית"}],"notes":""}
meal is one of "breakfast", "lunch", "dinner", "snack", "unknown". source is one of "user", "library", "reference".`;

const MESSAGES: Record<string, string> = {
  not_granted: "לא אישרת לדף להשתמש ב-Claude. אפשר לאשר מחדש בטעינה הבאה של הדף, ובינתיים להוסיף פריטים ידנית.",
  sampling_disabled: "Claude לא זמין בחשבון הזה.",
  rate_limited: "הגעת למגבלת השימוש ב-Claude כרגע. נסו שוב מאוחר יותר.",
  session_expired: "צריך להתחבר מחדש ל-claude.ai.",
  refused: "הבקשה נדחתה. נסו לנסח את הרישום אחרת.",
  prompt_too_large: "הרישום ארוך מדי. נסו לפצל אותו.",
  invalid_json: "התשובה לא התקבלה במבנה הנכון. נסו שוב.",
  empty_completion: "לא התקבלה תשובה. נסו לנסח אחרת.",
  tools_unavailable: "החיפוש ברשימת המזונות שלך לא זמין בתצוגה הזו.",
  cancelled: "הניתוח בוטל.",
};

export async function parseWithClaude(text: string, foods: Food[], sample: SampleFn, signal?: AbortSignal): Promise<ParseResult> {
  let raw: unknown;
  try {
    raw = await sample.json(`${INSTRUCTIONS}\n\nThe food log:\n<log>\n${text}\n</log>`, {
      model: MODEL,
      modelTier: "default",
      effort: "medium",
      signal,
      tools: [
        {
          name: "search_my_foods",
          description:
            "Search the user's personal list of custom foods and recipes (imported from Lose It). Returns matching items with nutrition values per serving. Query with a short Hebrew (or English) food name.",
          inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
          execute: ({ query }) => lookup(foods, typeof query === "string" ? query : ""),
        },
      ],
    });
  } catch (e) {
    if (isSampleError(e)) throw new Error(MESSAGES[e.code] ?? "שגיאה זמנית בשירות הניתוח. נסו שוב.");
    throw e;
  }
  const parsed = submitValidator.safeParse(raw);
  if (!parsed.success) throw new Error("התשובה לא התקבלה במבנה הנכון. נסו שוב.");
  return {
    notes: parsed.data.notes,
    items: parsed.data.items.map((it) => ({ ...it, meal: it.meal === "unknown" ? null : it.meal })),
  };
}
