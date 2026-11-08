import type { Food } from "../shared/types.ts";

/** Normalise Hebrew/English text for fuzzy matching. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // niqqud & cantillation
    .replace(/[ךםןףץ]/g, (c) => ({ ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" })[c]!)
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 0);
}

function tokenScore(q: string, t: string): number {
  if (q === t) return 1;
  if (t.startsWith(q) || q.startsWith(t)) return 0.8;
  // allow one leading Hebrew prefix letter (e.g. "הקוטג" vs "קוטג")
  if (q.length > 2 && /^[הובלמשכ]/.test(q) && q.slice(1) === t) return 0.85;
  if (t.length > 2 && /^[הובלמשכ]/.test(t) && t.slice(1) === q) return 0.85;
  if (q.length >= 3 && t.includes(q)) return 0.6;
  return 0;
}

export function searchFoods(foods: Food[], query: string, limit = 8): Food[] {
  const qt = tokens(query);
  if (!qt.length) return [];
  const nq = normalize(query);
  const scored = foods.map((f) => {
    const text = `${f.name} ${f.brand ?? ""}`;
    const ft = tokens(text);
    let sum = 0;
    for (const q of qt) sum += Math.max(0, ...ft.map((t) => tokenScore(q, t)));
    let score = sum / qt.length;
    if (normalize(text).includes(nq)) score += 0.5;
    return { f, score };
  });
  return scored
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.f);
}
