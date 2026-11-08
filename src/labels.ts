import type { EntrySource, Meal } from "../shared/types.ts";

export const MEALS: { key: Meal; label: string }[] = [
  { key: "breakfast", label: "ארוחת בוקר" },
  { key: "lunch", label: "ארוחת צהריים" },
  { key: "dinner", label: "ארוחת ערב" },
  { key: "snack", label: "נשנושים" },
];

export const MEAL_LABEL: Record<Meal, string> = Object.fromEntries(MEALS.map((m) => [m.key, m.label])) as Record<Meal, string>;

export const SOURCE_LABEL: Record<EntrySource, string> = {
  user: "לפי הרישום שלך",
  library: "מהרשימה שלי",
  web: "מהרשת",
  reference: "ערך מקובל",
  manual: "ידני",
};

export function mealByTime(d = new Date()): Meal {
  const h = d.getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
