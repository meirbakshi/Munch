import Papa from "papaparse";
import type { Food, FoodSource } from "../../shared/types.ts";

/** Columns we can map from a CSV to a food item. */
export type Field =
  | "name"
  | "brand"
  | "group"
  | "servings"
  | "servingAmount"
  | "servingUnit"
  | "servingGrams"
  | "calories"
  | "carbs"
  | "protein"
  | "fat"
  | "fiber"
  | "deleted";

export const FIELD_LABELS: Record<Field, string> = {
  name: "שם",
  brand: "מותג",
  group: "שם מתכון (לשורות רכיבים)",
  servings: "מספר מנות במתכון",
  servingAmount: "כמות במנה",
  servingUnit: "יחידת מנה",
  servingGrams: "משקל מנה (גרם)",
  calories: "קלוריות",
  carbs: "פחמימות (ג׳)",
  protein: "חלבון (ג׳)",
  fat: "שומן (ג׳)",
  fiber: "סיבים (ג׳)",
  deleted: "נמחק",
};

export type Mapping = Partial<Record<Field, string>>;

export interface CsvData {
  headers: string[];
  rows: Record<string, string>[];
}

export function readCsv(text: string): CsvData {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return { headers: res.meta.fields ?? [], rows: res.data };
}

const RULES: [Field, RegExp, RegExp?][] = [
  ["deleted", /deleted|נמחק/i],
  ["brand", /brand|מותג/i],
  ["servings", /^(number of |#\s*)?servings$|servings? per recipe|yield|מספר מנות/i],
  ["servingGrams", /gram|weight|\(g\)$|משקל/i, /fat|carb|protein|fib|sugar|sodium/i],
  ["servingUnit", /unit|יחיד/i],
  ["servingAmount", /serving (size|quantity|amount)|^quantity$|^amount$|^qty|^serving$|כמות/i],
  ["calories", /calor|kcal|energy|קלורי|אנרגיה/i, /from fat/i],
  ["carbs", /carb|פחמימ/i],
  ["protein", /protein|חלבון/i],
  ["fat", /^(total )?fat|שומן/i, /satur|trans|poly|mono|רווי/i],
  ["fiber", /fib|סיבים/i],
];

/** Guess which CSV column feeds which field, from the header names. */
export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  for (const [field, re, not] of RULES) {
    const h = headers.find((h) => !used.has(h) && re.test(h) && !(not && not.test(h)));
    if (h) {
      m[field] = h;
      used.add(h);
    }
  }
  // Name: prefer an ingredient/food name; when a separate recipe-name column exists, use it to group.
  const recipeCol = headers.find((h) => /recipe/i.test(h) && /name/i.test(h)) ?? headers.find((h) => /^recipe$/i.test(h));
  const ingredientCol = headers.find((h) => /ingredient|food/i.test(h) && /name/i.test(h));
  const plainName = headers.find((h) => /^(name|food|item|description|food name|שם)$/i.test(h));
  if (recipeCol && (ingredientCol || plainName) && recipeCol !== (ingredientCol ?? plainName)) {
    m.group = recipeCol;
    m.name = ingredientCol ?? plainName;
  } else {
    m.name = recipeCol ?? plainName ?? ingredientCol ?? headers.find((h) => /name|שם/i.test(h) && !used.has(h));
  }
  return m;
}

function num(v: string | undefined): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/,/g, "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function buildFoods(data: CsvData, m: Mapping, source: FoodSource): Omit<Food, "id">[] {
  const get = (row: Record<string, string>, f: Field) => (m[f] ? row[m[f]!] ?? "" : "");
  const rows = data.rows.filter((r) => {
    const del = get(r, "deleted").toLowerCase();
    return get(r, m.group ? "group" : "name").trim() && !(del === "true" || del === "yes" || del === "1");
  });

  if (m.group) {
    // Rows are ingredients: sum them per recipe and divide by the number of servings.
    const groups = new Map<string, Record<string, string>[]>();
    for (const r of rows) {
      const k = get(r, "group").trim();
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.entries()].map(([name, rs]) => {
      const servings = Math.max(1, num(get(rs[0], "servings")) || 1);
      const total = (f: Field) => rs.reduce((a, r) => a + num(get(r, f)), 0) / servings;
      return {
        name,
        source,
        servingAmount: 1,
        servingUnit: "מנה",
        calories: Math.round(total("calories")),
        carbs: round1(total("carbs")),
        protein: round1(total("protein")),
        fat: round1(total("fat")),
        fiber: round1(total("fiber")),
      };
    });
  }

  return rows.map((r) => {
    const servings = m.servings ? Math.max(1, num(get(r, "servings")) || 1) : 1;
    const per = (f: Field) => num(get(r, f)) / servings;
    const grams = num(get(r, "servingGrams"));
    return {
      name: get(r, "name").trim(),
      brand: get(r, "brand").trim() || undefined,
      source,
      servingAmount: m.servings ? 1 : num(get(r, "servingAmount")) || 1,
      servingUnit: m.servings ? "מנה" : get(r, "servingUnit").trim() || "מנה",
      servingGrams: grams > 0 ? grams : undefined,
      calories: Math.round(per("calories")),
      carbs: round1(per("carbs")),
      protein: round1(per("protein")),
      fat: round1(per("fat")),
      fiber: round1(per("fiber")),
    };
  });
}
