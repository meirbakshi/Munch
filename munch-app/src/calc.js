/* ---------- dates (local, YYYY-MM-DD) ---------- */

const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
export const todayISO = () => iso(new Date());
export const addDays = (s, n) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const dow = (s) => parseISO(s).getDay(); // 0 = Sunday
export const weekStart = (s) => addDays(s, -dow(s)); // weeks run Sunday to Saturday

export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
export const fmtDate = (s, withYear = false) => {
  const d = parseISO(s);
  return `${d.getDate()} ב${MONTHS[d.getMonth()]}${withYear ? " " + d.getFullYear() : ""}`;
};
export const fmtShort = (s) => {
  const d = parseISO(s);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};
export const dayLabel = (s) => {
  const t = todayISO();
  if (s === t) return "היום";
  if (s === addDays(t, -1)) return "אתמול";
  return `יום ${DAY_NAMES[dow(s)]}`;
};

/* ---------- numbers ---------- */

export const fmt = (n, digits = 0) =>
  n == null || !isFinite(n) ? "–" : Number(n).toLocaleString("he-IL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const round1 = (n) => Math.round(n * 10) / 10;

/* ---------- body & energy ---------- */

export const KCAL_PER_KG = 7700;

export const ACTIVITY = {
  sedentary: { factor: 1.2, label: "יושבני", hint: "עבודה משרדית, כמעט בלי פעילות" },
  light: { factor: 1.375, label: "קל", hint: "פעילות 1–3 פעמים בשבוע" },
  moderate: { factor: 1.55, label: "בינוני", hint: "פעילות 3–5 פעמים בשבוע" },
  active: { factor: 1.725, label: "פעיל", hint: "פעילות 6–7 פעמים בשבוע" },
  very_active: { factor: 1.9, label: "פעיל מאוד", hint: "עבודה פיזית או אימונים כפולים" },
};

export const ageAt = (birthDate, date) => {
  const b = parseISO(birthDate), d = parseISO(date);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
};

/** Mifflin–St Jeor */
export const bmr = (s, kg, date) => 10 * kg + 6.25 * s.heightCm - 5 * ageAt(s.birthDate, date) + (s.sex === "male" ? 5 : -161);
export const tdee = (s, kg, date) => bmr(s, kg, date) * (ACTIVITY[s.activity] || ACTIVITY.sedentary).factor;

/** Settings in effect on a date (settings changes apply from the day they're made). */
export function settingsAt(data, date) {
  const h = data.settingsHistory;
  if (!h.length) return null;
  let cur = h[0];
  for (const s of h) if (s.from <= date) cur = s;
  return cur;
}
export const currentSettings = (data) => (data.settingsHistory.length ? data.settingsHistory[data.settingsHistory.length - 1] : null);
export const startDate = (data) => (data.settingsHistory.length ? data.settingsHistory[0].from : null);

const sortedWeights = (data) => [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
export function weightAt(data, date) {
  const w = sortedWeights(data);
  if (!w.length) return null;
  let cur = w[0].kg;
  for (const x of w) if (x.date <= date) cur = x.kg;
  return cur;
}
export const latestWeight = (data) => {
  const w = sortedWeights(data);
  return w.length ? w[w.length - 1] : null;
};
export const firstWeight = (data) => sortedWeights(data)[0] || null;

/**
 * The weekly plan. Weeks run Sunday–Saturday and the week's total is the daily
 * allowance × 7. High days get `highBoostPct` more than a regular day; regular days
 * get a bit less, so the week's total stays the same.
 */
export function planFor(s, kg, date) {
  const t = tdee(s, kg, date);
  const b = (s.highBoostPct || 0) / 100;
  const nH = s.highDays.length;
  // the largest weekly loss that keeps every planned day at or above the daily minimum
  const minBase = nH === 7 ? s.minCalories : (s.minCalories * (7 + nH * b)) / 7;
  const maxWeeklyLossKg = Math.max(0, ((t - minBase) * 7) / KCAL_PER_KG);
  // a pace that would need days below the minimum is lowered to the fastest one that doesn't
  const requested = s.weeklyLossKg;
  const rate = Math.min(requested, maxWeeklyLossKg);
  const base = t - (rate * KCAL_PER_KG) / 7;
  const regular = (base * 7) / (7 + nH * b);
  const high = regular * (1 + b);
  const lowest = nH === 7 ? high : regular;
  return { bmr: bmr(s, kg, date), tdee: t, base, regular, high, lowest, maxWeeklyLossKg, rate, requested, capped: rate < requested - 1e-9, isHigh: s.highDays.includes(dow(date)) };
}

/* ---------- daily totals ---------- */

export const NUTRIENTS = ["calories", "carbs", "protein", "fat", "fiber"];
export const sumItems = (items) => {
  const t = { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 };
  for (const it of items) for (const k of NUTRIENTS) t[k] += Number(it[k]) || 0;
  return t;
};
export function totalsByDate(entries) {
  const m = new Map();
  for (const e of entries) {
    if (!m.has(e.date)) m.set(e.date, []);
    m.get(e.date).push(e);
  }
  const out = new Map();
  for (const [d, list] of m) out.set(d, sumItems(list));
  return out;
}

/** Share of energy from each macro (carbs and protein 4 kcal/g, fat 9, fiber 2). */
export function macroShares(t) {
  const k = { carbs: t.carbs * 4, protein: t.protein * 4, fat: t.fat * 9, fiber: t.fiber * 2 };
  const sum = k.carbs + k.protein + k.fat + k.fiber;
  const pct = (x) => (sum > 0 ? (x / sum) * 100 : 0);
  return { carbs: pct(k.carbs), protein: pct(k.protein), fat: pct(k.fat), fiber: pct(k.fiber) };
}

/**
 * Daily targets with 7-day balancing.
 * "eaten" is NET: food minus calories burned in logged exercise.
 * Target(d) = planned(d) + Σ over the 7 previous days of (target − eaten)/7, and never below the floor.
 * A day with nothing logged counts as on target. A day only affects the 7 days after it.
 * A day counts as logged when it has food entries.
 * Returns a Map date -> {target, plan, adjustment, eaten (net), food, burned, logged, tdee}.
 */
export function computeDays(data, until) {
  const start = startDate(data);
  const out = new Map();
  if (!start || until < start) return out;
  const totals = totalsByDate(data.entries);
  const burnedBy = new Map();
  for (const x of data.exercises || []) burnedBy.set(x.date, (burnedBy.get(x.date) || 0) + (Number(x.calories) || 0));
  const deltas = [];
  for (let d = start, i = 0; d <= until; d = addDays(d, 1), i++) {
    const s = settingsAt(data, d);
    const kg = weightAt(data, d) ?? s.startWeightKg;
    const p = planFor(s, kg, d);
    const plan = p.isHigh ? p.high : p.regular;
    let adj = 0;
    for (let k = 1; k <= 7 && i - k >= 0; k++) adj += deltas[i - k] / 7;
    const target = Math.max(s.minCalories, plan + adj);
    const t = totals.get(d);
    const logged = Boolean(t);
    const food = t ? t.calories : 0;
    const burned = burnedBy.get(d) || 0;
    const eaten = food - burned;
    deltas.push(logged ? target - eaten : 0);
    out.set(d, { date: d, target, plan, adjustment: target - plan, eaten, food, burned, logged, totals: t || sumItems([]), tdee: p.tdee, isHigh: p.isHigh });
  }
  return out;
}

/**
 * Where your weight "should" be from what you logged: the last weigh-in minus the energy
 * deficit logged since / 7,700. Every weigh-in resets the prediction to the real weight.
 * Days with nothing logged count as on target.
 * Returns a Map date -> expected kg at the start of that day. On a weigh-in day the value is
 * still the prediction from the previous weigh-in, so the two can be compared; the reset
 * applies from that day on (a weigh-in counts as taken in the morning, before eating).
 */
export function expectedWeights(data, days) {
  const w0 = firstWeight(data);
  const out = new Map();
  if (!w0) return out;
  const byDate = new Map(data.weights.map((w) => [w.date, w.kg]));
  let kg = w0.kg;
  for (const [d, day] of days) {
    out.set(d, kg);
    if (byDate.has(d)) kg = byDate.get(d);
    const intake = day.logged ? day.eaten : day.target;
    kg -= (day.tdee - intake) / KCAL_PER_KG;
  }
  return out;
}

/** Linear fit of weight over the last `windowDays`; kg per day (negative = losing). */
export function weightTrend(data, until, windowDays = 28) {
  const from = addDays(until, -windowDays);
  const pts = sortedWeights(data).filter((w) => w.date >= from && w.date <= until);
  if (pts.length < 2 || daysBetween(pts[0].date, pts[pts.length - 1].date) < 7) return null;
  const xs = pts.map((p) => daysBetween(from, p.date)), ys = pts.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : null;
}

export const ENERGY_SOURCES = { user: "כתבת", library: "מהרשימה", web: "מהרשת", composed: "מחושב מרכיבים", reference: "ערך מקובל", manual: "ידני" };
export const MEALS = { breakfast: "ארוחת בוקר", lunch: "ארוחת צהריים", dinner: "ארוחת ערב", snack: "נשנושים" };
export const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];
export const mealByTime = () => {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack";
};

/**
 * The plan's weight path: from the starting weight, down by the planned weekly loss / 7 each day
 * (the settings in effect that day), never below the target. Map date -> planned kg at the start of that day.
 */
export function plannedWeights(data, until) {
  const out = new Map(), start = startDate(data), w0 = firstWeight(data);
  if (!start || !w0) return out;
  let kg = w0.kg;
  for (let d = start; d <= until; d = addDays(d, 1)) {
    out.set(d, kg);
    const s = settingsAt(data, d);
    const rate = planFor(s, weightAt(data, d) ?? kg, d).rate; // the pace actually planned, never below the daily minimum
    kg = Math.max(s.targetWeightKg, kg - rate / 7);
  }
  return out;
}

/**
 * Everything about one weigh-in: the weight, the change since the previous weigh-in, where the plan
 * and the logs say the weight should be on that day, how much is left, and when the plan reaches the target.
 */
export function weighIn(data, date) {
  const ws = [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  const w = ws.find((x) => x.date === date);
  if (!w) return null;
  const prev = [...ws].reverse().find((x) => x.date < date) || null;
  const s = settingsAt(data, date);
  const planned = plannedWeights(data, date).get(date) ?? null;
  const predicted = expectedWeights(data, computeDays(data, date)).get(date) ?? null;
  const toGo = w.kg - s.targetWeightKg;
  const p = planFor(s, w.kg, date);
  const weeks = p.rate > 0 && toGo > 0 ? toGo / p.rate : null;
  return {
    date, kg: w.kg, prev,
    change: prev ? w.kg - prev.kg : null,
    planned, predicted,
    vsPlan: planned != null ? w.kg - planned : null,
    vsLogs: predicted != null ? w.kg - predicted : null,
    toGo, reached: toGo <= 0,
    eta: weeks != null ? addDays(date, Math.ceil(weeks * 7)) : null,
    weeklyLossKg: p.rate, paceCapped: p.capped, targetWeightKg: s.targetWeightKg,
  };
}

/** The log-based prediction for today: today's weigh-in if there is one, else the last weigh-in plus what was logged since. */
export function predictedToday(data, expected, today) {
  const w = data.weights.find((x) => x.date === today);
  return w ? w.kg : expected.get(today) ?? null;
}
