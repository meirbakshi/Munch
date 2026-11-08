import type { Nutrients } from "../../shared/types.ts";

export const ZERO: Nutrients = { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 };

export function sum(items: Nutrients[]): Nutrients {
  return items.reduce(
    (acc, n) => ({
      calories: acc.calories + (n.calories || 0),
      carbs: acc.carbs + (n.carbs || 0),
      protein: acc.protein + (n.protein || 0),
      fat: acc.fat + (n.fat || 0),
      fiber: acc.fiber + (n.fiber || 0),
    }),
    { ...ZERO },
  );
}

export function scale(n: Nutrients, factor: number): Nutrients {
  const r1 = (x: number) => Math.round(x * factor * 10) / 10;
  return {
    calories: Math.round(n.calories * factor),
    carbs: r1(n.carbs),
    protein: r1(n.protein),
    fat: r1(n.fat),
    fiber: r1(n.fiber),
  };
}

/** kcal per gram used to express each macro as a share of the day's calories. */
export const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9, fiber: 2 } as const;

export type Macro = keyof typeof KCAL_PER_G;

export const MACROS: { key: Macro; label: string; color: string }[] = [
  { key: "carbs", label: "פחמימות", color: "var(--carbs)" },
  { key: "protein", label: "חלבון", color: "var(--protein)" },
  { key: "fat", label: "שומן", color: "var(--fat)" },
  { key: "fiber", label: "סיבים", color: "var(--fiber)" },
];

/** Share (0-100) of the day's calories that came from each macro. */
export function macroPercents(n: Nutrients): Record<Macro, number> {
  const kcal = (m: Macro) => n[m] * KCAL_PER_G[m];
  const total = n.calories > 0 ? n.calories : kcal("carbs") + kcal("protein") + kcal("fat") + kcal("fiber");
  const pct = (m: Macro) => (total > 0 ? (kcal(m) / total) * 100 : 0);
  return { carbs: pct("carbs"), protein: pct("protein"), fat: pct("fat"), fiber: pct("fiber") };
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString("he-IL", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
