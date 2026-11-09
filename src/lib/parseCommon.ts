import { z } from "zod";
import type { Food } from "../../shared/types.ts";
import { searchFoods } from "./search.ts";

/** Shared by both ways of parsing (claude.ai and API key). */

export const MODEL = "claude-opus-5-5";

export const SYSTEM = `You turn a free-text food log, written in Hebrew, into a structured list of foods with nutrition values.

Work through the text item by item:
1. Split the text into individual foods/drinks. Infer the amount and unit the user ate (e.g. "2 פרוסות", "כוס", "150 גרם", "חצי"). When no amount is given, assume one typical serving and say so in the sourceNote.
2. For each item, pick nutrition values by this priority:
   a. "user": the user explicitly stated nutrition values for this item in the text (e.g. "יוגורט 120 קלוריות"). Use exactly what they wrote; fill in only the macros they didn't give, from the next sources.
   b. "library": the user's personal list of custom foods and recipes. Call search_my_foods for every item (try a shorter or alternative Hebrew name if the first search finds nothing). If there is a good match, use it and scale its per-serving values to the amount eaten.
   c. "web": search the web for the item. Prefer Israeli sources for Israeli products and brands (manufacturer sites, product labels, Israeli nutrition databases), and per-100g values that you then scale to the amount eaten.
   d. "reference": for plain, generic foods (an apple, an egg, white rice, olive oil) you may use standard nutrition-reference values (USDA / the Israeli Ministry of Health database) without searching.
3. Submit the final list with submit_food_log. Call it exactly once, at the end.

Rules:
- Item names, units and sourceNote must be in Hebrew.
- All nutrient values are for the full amount eaten (not per 100g): calories in kcal, carbs / protein / fat / fiber in grams. Round calories to whole numbers and macros to one decimal.
- "carbs" is total carbohydrates excluding dietary fiber when the source separates them (as Israeli labels do).
- sourceNote briefly says where the numbers came from and any assumption (e.g. "לפי אתר תנובה, 100 גרם = 98 קק"ל", "הנחתי פרוסה בינונית").
- meal: infer from the text (בוקר / צהריים / ערב / נשנוש) or use "unknown".
- notes: one short Hebrew sentence for anything the user should double-check, or an empty string.
- Do not invent foods the user did not mention.`;

export const submitValidator = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      amount: z.number(),
      unit: z.string(),
      meal: z.enum(["breakfast", "lunch", "dinner", "snack", "unknown"]),
      calories: z.number(),
      carbs: z.number(),
      protein: z.number(),
      fat: z.number(),
      fiber: z.number(),
      source: z.enum(["user", "library", "web", "reference"]),
      sourceNote: z.string(),
    }),
  ),
  notes: z.string(),
});

export function lookup(foods: Food[], query: string): string {
  const hits = searchFoods(foods, query);
  if (!hits.length) return `No items in the user's list match "${query}".`;
  return JSON.stringify(
    hits.map((f) => ({
      name: f.name,
      brand: f.brand,
      type: f.source === "loseit-recipe" ? "recipe" : "food",
      serving: `${f.servingAmount} ${f.servingUnit}${f.servingGrams ? ` (${f.servingGrams} g)` : ""}`,
      perServing: { calories: f.calories, carbs: f.carbs, protein: f.protein, fat: f.fat, fiber: f.fiber },
    })),
  );
}

