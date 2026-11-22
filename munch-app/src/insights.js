import { useSyncExternalStore } from "react";
import { getSample } from "./claude.js";
import { mutate } from "./store.js";
import {
  addDays, computeDays, currentSettings, expectedWeights, firstWeight, latestWeight, macroShares, planFor, plannedWeights, startDate, todayISO, weekStart,
} from "./calc.js";

/* ---------- what the analysis is based on: the user's own data, summarized ---------- */

const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;

/** A compact summary of the logs, weigh-ins and plan, small enough to send in one request. */
export function insightsInput(data) {
  const today = todayISO(), start = startDate(data), s = currentSettings(data);
  const days = computeDays(data, today), plan = plannedWeights(data, today), exp = expectedWeights(data, days);
  const byDate = new Map();
  for (const e of data.entries) { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); }
  const exByDate = new Map();
  for (const x of data.exercises || []) { if (!exByDate.has(x.date)) exByDate.set(x.date, []); exByDate.get(x.date).push(x); }

  // weeks (Sunday to Saturday), most recent 8
  const weeks = new Map();
  for (const [d, day] of days) {
    if (d === today) continue; // today is still in progress
    const k = weekStart(d);
    if (!weeks.has(k)) weeks.set(k, { week: k, days: 0, logged: 0, net: 0, food: 0, target: 0, withinTarget: 0, burned: 0, macros: { carbs: 0, protein: 0, fat: 0, fiber: 0 }, foods: new Map() });
    const w = weeks.get(k); w.days++;
    if (!day.logged) continue;
    w.logged++; w.net += day.eaten; w.food += day.food; w.target += day.target; w.burned += day.burned;
    if (day.eaten <= day.target) w.withinTarget++;
    for (const m of Object.keys(w.macros)) w.macros[m] += day.totals[m];
    for (const e of byDate.get(d) || []) { const n = e.name.trim(); const f = w.foods.get(n) || { times: 0, kcal: 0 }; f.times++; f.kcal += e.calories || 0; w.foods.set(n, f); }
  }
  const weekRows = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-8).map((w) => {
    const sh = macroShares(w.macros);
    return {
      week: w.week, daysInWeek: w.days, daysLogged: w.logged,
      avgNetKcal: w.logged ? r0(w.net / w.logged) : null, avgFoodKcal: w.logged ? r0(w.food / w.logged) : null, avgTargetKcal: w.logged ? r0(w.target / w.logged) : null,
      daysWithinTarget: w.withinTarget, exerciseKcal: r0(w.burned),
      energyShare: { carbs: r0(sh.carbs), protein: r0(sh.protein), fat: r0(sh.fat) },
      topFoodsByKcal: [...w.foods].sort((a, b) => b[1].kcal - a[1].kcal).slice(0, 12).map(([name, f]) => ({ name, times: f.times, kcal: r0(f.kcal) })),
    };
  });

  // the last 14 days in detail
  const recent = [];
  for (let d = addDays(today, -14); d < today; d = addDays(d, 1)) {
    const day = days.get(d); if (!day) continue;
    recent.push({
      date: d, logged: day.logged, netKcal: day.logged ? r0(day.eaten) : null, targetKcal: r0(day.target),
      items: (byDate.get(d) || []).map((e) => `${e.name} ${r0(e.calories)}`),
      exercise: (exByDate.get(d) || []).map((x) => `${x.name} ${r0(x.calories)}`),
    });
  }

  // weigh-ins against the plan and the log-based prediction
  const weighIns = [...data.weights].sort((a, b) => a.date.localeCompare(b.date)).map((w) => ({
    date: w.date, kg: w.kg, plannedKg: plan.has(w.date) ? r1(plan.get(w.date)) : null, predictedFromLogsKg: exp.has(w.date) ? r1(exp.get(w.date)) : null,
  }));

  return {
    today, startedOn: start, sex: s.sex,
    plan: { weeklyLossKg: r1(planFor(s, latestWeight(data)?.kg ?? firstWeight(data)?.kg, today).rate), targetWeightKg: s.targetWeightKg, startWeightKg: firstWeight(data)?.kg, minDailyKcal: s.minCalories },
    weeks: weekRows, last14Days: recent, weighIns,
  };
}

/** Identifies the data an analysis was made from; a new weigh-in makes it stale. */
export const insightsKey = (data) => {
  const lw = latestWeight(data);
  const logged = [...computeDays(data, todayISO()).values()].filter((d) => d.logged).length;
  return { weighIn: lw?.date || null, kg: lw?.kg ?? null, logged };
};

/** True when the saved analysis predates the latest weigh-in (a new one, or a changed weight). */
export const insightsStale = (data) => {
  const saved = data.insights, k = insightsKey(data);
  return !saved || saved.key?.weighIn !== k.weighIn || (saved.key?.kg ?? null) !== k.kg;
};

/* ---------- one shared run, so it can start from anywhere (e.g. right after a weigh-in) ---------- */

let run = { busy: false, error: null };
let ctl = null;
const subs = new Set();
const setRun = (patch) => { run = { ...run, ...patch }; subs.forEach((f) => f()); };
export const useInsightsRun = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => run);
export const stopInsights = () => ctl?.abort();

/** Analyzes the data and saves the result. Does nothing if a run is already in progress. */
export async function runInsights(data) {
  if (run.busy) return;
  ctl = new AbortController();
  setRun({ busy: true, error: null });
  try {
    const key = insightsKey(data);
    const items = await generateInsights(data, ctl.signal);
    await mutate((d) => void (d.insights = { generatedAt: new Date().toISOString(), key, items }));
  } catch (e) {
    if (!e.cancelled) setRun({ error: e.message });
  } finally {
    setRun({ busy: false });
  }
}

/* ---------- the analysis ---------- */

const INSTRUCTIONS = `You analyze one person's own calorie log and weigh-ins, from a personal weight-loss app used in Israel, and write a few insights for them, in Hebrew.

What you get: their plan; a summary per week (Sunday to Saturday: days logged, average net calories eaten (food minus exercise) against their average target, days within target, exercise, share of energy from carbs/protein/fat, and the foods that contributed the most calories); every food and exercise of the last 14 days; and every weigh-in with the weight the plan expected and the weight their logs predicted for it (the previous weigh-in minus the energy deficits logged since then / 7,700 kcal per kg, so each weigh-in's prediction covers only the period since the one before).

Write 3 to 5 insights. Each must come from THEIR data, not from general dietary advice:
- Habits: patterns that recur (e.g. weekend overeating, unlogged days, a food or snack that keeps appearing, evening eating, low protein days) and whether they show up in the weight.
- Foods that seem to matter: link foods or food types to outcomes only through the weigh-ins. E.g. a week with many desserts that still stayed within calories: if the weight then went down as planned, desserts within the limit don't seem to hurt them; if it dropped more than planned, they seem fine for them; if it didn't drop or rose, they may hurt more than their calories suggest. Say how sure you are; with few weigh-ins, say the evidence is thin.
- What to focus on more, and what they focus on too much (effort that doesn't show in the results).
- If the latest weigh-in differs from the log-based prediction by 1 kg or more, include one insight that assesses the likely reasons from the data: days with nothing logged, portions that were probably larger than logged, items with uncertain values (restaurant food, estimates), salty or high-carb foods around the weigh-in (water weight), or the daily-expenditure estimate being off.
General nutrition knowledge is allowed only to explain a pattern their data shows. No medical advice. Don't repeat the same point twice. Prefer fewer, sharper insights over many. Cite concrete numbers from the data (dates or weeks, kcal, kg).

Each insight: kind is "good" (something that works for them), "watch" (a habit that seems to hurt), "focus" (something to do more of), or "less" (something they can worry about less). title: up to 6 words. body: 1–3 short sentences, plain Hebrew, addressing the user in the right gender (sex is given). evidence: one short line with the numbers it's based on.

Reply with ONLY a JSON object: {"insights":[{"kind":"good","title":"","body":"","evidence":""}]}`;

const ERRORS = {
  not_granted: "לא אישרת לאפליקציה להשתמש ב-Claude. אפשר לאשר בפעם הבאה שתפתחו את האפליקציה.",
  sampling_disabled: "Claude לא זמין בחשבון הזה.",
  rate_limited: "הגעת למגבלת השימוש ב-Claude כרגע. נסו שוב מאוחר יותר.",
  session_expired: "צריך להתחבר מחדש ל-claude.ai.",
  invalid_json: "התשובה לא התקבלה בפורמט הנכון. נסו שוב.",
  prompt_too_large: "יש יותר מדי נתונים לניתוח אחד.",
};
const KINDS = ["good", "watch", "focus", "less"];

export async function generateInsights(data, signal) {
  const sample = await getSample();
  if (!sample) throw new Error("התובנות עובדות רק כשהאפליקציה פתוחה ב-claude.ai.");
  let raw;
  try {
    raw = await sample.json(`${INSTRUCTIONS}\n\nThe data:\n${JSON.stringify(insightsInput(data))}`, { signal, cache: false });
  } catch (e) {
    if (e?.code === "cancelled") throw Object.assign(new Error("בוטל"), { cancelled: true });
    if (e?.code) throw new Error(ERRORS[e.code] || "שגיאה זמנית בניתוח. נסו שוב.");
    throw e;
  }
  const items = (raw?.insights || [])
    .map((x) => ({ kind: KINDS.includes(x.kind) ? x.kind : "focus", title: String(x.title || "").trim(), body: String(x.body || "").trim(), evidence: String(x.evidence || "").trim() }))
    .filter((x) => x.title && x.body)
    .slice(0, 5);
  if (!items.length) throw new Error("לא התקבלו תובנות. נסו שוב.");
  return items;
}

export const MIN_LOGGED_DAYS = 5;
