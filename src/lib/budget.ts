import type { Activity, Profile } from "../../shared/types.ts";
import { addDays, dayOfWeek, daysBetween, fromISO, todayISO, weekStart } from "./dates.ts";

export const KCAL_PER_KG = 7700;
/** Never plan more than this daily deficit/surplus, regardless of the target date. */
export const MAX_DAILY_DELTA = 1000;

export const ACTIVITY: Record<Activity, { label: string; factor: number }> = {
  sedentary: { label: "יושבני (מעט או ללא פעילות)", factor: 1.2 },
  light: { label: "פעילות קלה (1–3 פעמים בשבוע)", factor: 1.375 },
  moderate: { label: "פעילות בינונית (3–5 פעמים בשבוע)", factor: 1.55 },
  active: { label: "פעיל (6–7 פעמים בשבוע)", factor: 1.725 },
  very_active: { label: "פעיל מאוד (עבודה פיזית / אימונים כפולים)", factor: 1.9 },
};

export function ageOn(birthDate: string, on: string): number {
  const b = fromISO(birthDate);
  const d = fromISO(on);
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}

export interface GoalPlan {
  bmr: number;
  tdee: number;
  daysLeft: number;
  kgToChange: number; // positive = lose
  dailyDelta: number; // planned daily deficit (positive) or surplus (negative)
  base: number; // average daily allowance
  weeklyBudget: number;
  weeklyKgChange: number;
  warnings: string[];
}

export function goalPlan(p: Profile, today = todayISO()): GoalPlan {
  const warnings: string[] = [];
  const age = ageOn(p.birthDate, today);
  const bmr = 10 * p.currentWeightKg + 6.25 * p.heightCm - 5 * age + (p.sex === "male" ? 5 : -161);
  const tdee = bmr * ACTIVITY[p.activity].factor;

  const daysLeft = Math.max(1, daysBetween(today, p.targetDate));
  if (daysBetween(today, p.targetDate) <= 0) warnings.push("תאריך היעד עבר — כדאי לעדכן אותו.");

  const kgToChange = p.currentWeightKg - p.targetWeightKg;
  let dailyDelta = (kgToChange * KCAL_PER_KG) / daysLeft;
  if (Math.abs(dailyDelta) > MAX_DAILY_DELTA) {
    dailyDelta = Math.sign(dailyDelta) * MAX_DAILY_DELTA;
    warnings.push(`הקצב הנדרש מהיר מדי, הוגבל ל-${MAX_DAILY_DELTA} קק״ל ליום. שקלו להרחיק את תאריך היעד.`);
  }

  let base = tdee - dailyDelta;
  if (base < p.minCalories) {
    base = p.minCalories;
    warnings.push(`היעד היומי הועלה לרצפה של ${p.minCalories} קק״ל.`);
    dailyDelta = tdee - base;
  }
  base = Math.round(base);
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    daysLeft,
    kgToChange,
    dailyDelta: Math.round(dailyDelta),
    base,
    weeklyBudget: base * 7,
    weeklyKgChange: (dailyDelta * 7) / KCAL_PER_KG,
    warnings,
  };
}

export type DayStatus = "past" | "today" | "future";

export interface PlanDay {
  date: string;
  dow: number;
  high: boolean;
  /** Static plan: the weekly budget split by weekday weights, before any adjustment. */
  planned: number;
  /** Adjusted target after balancing for what was actually eaten earlier in the week. */
  target: number;
  consumed: number;
  logged: boolean;
  status: DayStatus;
}

export interface WeekPlan {
  start: string;
  weeklyBudget: number;
  days: PlanDay[];
  consumedSoFar: number;
  /** Budget left for the rest of the week, including what is still left today. */
  remainingWeek: number;
}

function weight(p: Profile, dow: number) {
  return p.highDays.includes(dow) ? 1 + p.highDayBoostPct / 100 : 1;
}

/**
 * Builds the week that contains `date`.
 *
 * The weekly budget stays constant. Each day's target is its weekday-weighted share of
 * whatever budget is left after the previous days of the week, capped at the day's original
 * plan (eating less than planned is not banked for later days):
 *   - a past day counts what was actually eaten (or its own target if nothing was logged);
 *   - today counts the larger of what was eaten and today's target, so going over today
 *     immediately shrinks the rest of the week, while today's target itself doesn't move;
 *   - future days split what remains.
 * Targets never drop below the profile's minimum.
 */
export function weekPlan(
  p: Profile,
  date: string,
  caloriesByDate: Record<string, number>,
  today = todayISO(),
): WeekPlan {
  const plan = goalPlan(p, today);
  const start = weekStart(date, p.weekStartsOn);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const weights = dates.map((d) => weight(p, dayOfWeek(d)));
  const totalW = weights.reduce((a, b) => a + b, 0);

  let remaining = plan.weeklyBudget;
  let consumedSoFar = 0;
  let remainingWeek = plan.weeklyBudget;
  const days: PlanDay[] = dates.map((d, i) => {
    const restW = weights.slice(i).reduce((a, b) => a + b, 0);
    const status: DayStatus = d < today ? "past" : d === today ? "today" : "future";
    const consumed = Math.round(caloriesByDate[d] ?? 0);
    const logged = d in caloriesByDate && consumed > 0;
    const planned = Math.round((plan.weeklyBudget * weights[i]) / totalW);
    // Overages earlier in the week shrink this day; savings are not banked (never above plan).
    const target = Math.min(planned, Math.max(p.minCalories, Math.round((weights[i] * remaining) / restW)));
    if (status === "today") remainingWeek = remaining - consumed;
    const used = status === "past" ? (logged ? consumed : target) : status === "today" ? Math.max(consumed, target) : target;
    if (status !== "future") consumedSoFar += consumed;
    remaining -= used;
    return {
      date: d,
      dow: dayOfWeek(d),
      high: p.highDays.includes(dayOfWeek(d)),
      planned,
      target,
      consumed,
      logged,
      status,
    };
  });
  if (today < start) remainingWeek = plan.weeklyBudget;
  if (today > dates[6]) remainingWeek = 0;
  return { start, weeklyBudget: plan.weeklyBudget, days, consumedSoFar, remainingWeek };
}
