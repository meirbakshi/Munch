import { getMcp, getSample, getPermissions } from "./claude.js";
import { MEALS, round1 } from "./calc.js";

/* ---------- searching the food library (Hebrew-aware) ---------- */

const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
export const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // niqqud
    .replace(/[׳'`"״]/g, "")
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^\p{L}\p{N}%.]+/gu, " ")
    .trim();
const tokens = (s) => norm(s).split(" ").filter(Boolean);
// strip a leading Hebrew prefix letter (ו, ה, ב, ל, מ, ש, כ) for a looser match
const stem = (t) => (t.length > 3 && "והבלמשכ".includes(t[0]) ? t.slice(1) : t);

export function searchFoods(foods, query, limit = 8) {
  const q = tokens(query);
  if (!q.length) return [];
  const scored = [];
  for (const f of foods) {
    const name = norm(`${f.name} ${f.brand || ""}`);
    const ft = name.split(" ");
    let score = 0;
    for (const t of q) {
      if (ft.includes(t)) score += 3;
      else if (ft.some((x) => stem(x) === stem(t))) score += 2.5;
      else if (name.includes(t) || name.includes(stem(t))) score += 1.5;
    }
    if (norm(f.name) === norm(query)) score += 4;
    if (score > 0) scored.push([score / Math.max(1, q.length) - ft.length * 0.02, f]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}

/* ---------- the prompt ---------- */

const INSTRUCTIONS = `You are the logging engine of a personal calorie tracker used in Israel. The user writes in Hebrew, freely, about what they ate on a given day and/or exercise they did. They may also ask to change or delete items already logged that day. Turn the message into changes to that day's log. A message can mix food and exercise.

How to work:
1. Split the message into individual foods and drinks with the amount eaten. When no amount is given, assume one typical ISRAELI serving and say so in sourceNote. Use Israeli sizes, not American ones. Typical references: medium cucumber ≈ 100 g, medium tomato ≈ 120 g, medium apple ≈ 150 g, banana ≈ 120 g (peeled), egg (L) ≈ 55 g without shell, slice of bread ≈ 30 g, pita ≈ 90 g, laffa ≈ 120 g, schnitzel ≈ 130 g, portion of hummus in a restaurant ≈ 200 g, tablespoon of oil ≈ 13 g, tablespoon of raw tahini ≈ 15 g, cup = 240 ml, tablespoon = 15 ml, teaspoon = 5 ml, "קופסה" of cottage/white cheese = 250 g, Israeli yogurt cup ≈ 150–200 g (check the product). The user's own portion definitions (listed below the instructions) ALWAYS override these defaults.
2. For each food pick nutrition values by this priority, and record which one you used in "source":
   a. "user": the user wrote the nutrition values in the message. Use exactly what they wrote and fill in only what's missing.
   b. "library": the user's own list of custom foods and recipes. Call search_my_foods for every food (retry with a shorter or alternative Hebrew name if nothing matches), then be SELECTIVE: use a library item only when the user clearly means THAT specific item.
      - Use it when the text names the same specific dish or product (e.g. "מג׳דרה" → their "מג׳דרה, כוס אחת"; "פשטידת זיתים" → their olive quiche; a brand + product that matches).
      - Do NOT use it for a broad category that comes in many versions (salad, pizza, sandwich, toast, pasta, soup, cake, shakshuka, omelette, smoothie, bowl, wrap...) unless the user names the same specific variety as the library item ("פיצה מעדנות" yes; just "פיצה" no; "סלט" no).
      - Do NOT use it when the user describes what this serving contained (ingredients, toppings, cooking method) and that differs from, or isn't evidently, the saved item. Calculate it from the described components instead (each component by the same priority), and name the item by what was described (e.g. "סלט עגבניות, מלפפון ובצל עם כף שמן זית").
      - A generic name with no details and no specific library match: search online for a typical Israeli version ("web"; "reference" only as the last resort below) and state the assumption in sourceNote.
      When unsure, don't use the library item, and mention the closest saved item in notes so the user can ask for it.
   c. "web": for EVERY food that search_my_foods has no item for that the user clearly means, search online with web_search, generic foods included (an apple, an egg, white rice, a restaurant dish). Search per food (one call per food, 1-3 queries). Prefer Israeli sources: the manufacturer's site, foodsdictionary.co.il, Open Food Facts Israel, the Ministry of Health database (also on israel.com/calories). Use per-100 g values and scale them. If the first search finds nothing usable, try once more with other words (Hebrew and English).
   d. "reference": a LAST resort, only when web_search returned nothing similar enough to the food after you tried, or web search is unavailable. Use standard values (Israeli Ministry of Health / USDA) and say in sourceNote that nothing was found online.
3. All values are for the full amount eaten: calories (kcal), carbs, protein, fat, fiber (grams). "carbs" excludes dietary fiber when the source separates them, as Israeli labels do. Round calories to whole numbers and grams to one decimal.
4. Changes to what was already logged: the day's current log is given with refs (e1, e2, ...). If the user says something was wrong, eaten in a different amount, or should be removed, put it in "update" (with the ref and the full corrected item) or "delete" (the ref). Only touch logged items the user referred to. If the user's message only adds foods, leave update and delete empty.
5. Library changes ("library"): keep the user's list of foods and recipes useful.
   - "add" a new item when the user gives nutrition values for a named food, describes a recipe of their own (ingredients and amounts → compute per-serving values), and for EVERY food whose values you took from web_search (source "web"), with the same name you used in "add", so it is found in the list next time.
   - "update" an existing library item (use its id from search_my_foods) when the user corrects its values or says its serving/recipe changed.
   - Do not add items whose values came from "reference", and do not duplicate an item that already exists.
   Library items are per serving: servingAmount + servingUnit (e.g. 100 גרם, 1 יחידה), plus servingGrams when known.
6. Names, units, sourceNote and notes in Hebrew. sourceNote: short, where the numbers came from and any assumption (e.g. "לפי אתר תנובה: 95 קק״ל ל-100 גרם", "הנחתי מלפפון בינוני, 100 גרם"). notes: one short sentence on anything the user should check, or "".
7a. Portion definitions: when the user tells you how big one of their portions is ("אצלי כוס זה 200 מ״ל", "מעכשיו פרוסה = 25 גרם", "הכוס שלי 200 מ״ל ולא 250"), add it to "portions" as {"term": the portion word in Hebrew, "value": its size in Hebrew, e.g. "200 מ״ל"} so it is saved and used from now on, AND apply it to this message's items. A definition that changes a saved one replaces it.
7. meal: from the text (בוקר / צהריים / ערב / נשנוש), else the default meal given below.
8. Exercise (walking, running, gym, swimming, cycling, sports, cleaning, ...) goes in "exercise", never in "add".
   - If the user states the calories burned (e.g. from a watch: "השעון אומר 350"), use exactly that number, source "user".
   - Otherwise estimate, source "estimate": NET calories = (MET − 1) × body weight (kg) × hours. Subtract 1 MET because resting burn is already counted in the daily target. Use the Compendium of Physical Activities for METs, matched to the intensity described (e.g. walking 5 km/h ≈ 3.5 MET, brisk walking 6 km/h ≈ 4.3, running 10 km/h ≈ 9.8, moderate cycling ≈ 6.8, strength training ≈ 3.5–5, swimming moderate ≈ 5.8). Step counts: roughly 1 km per 1,300 steps of walking. If the duration is missing, assume a typical session and say so.
   - minutes: duration (null if unknown). note: short Hebrew explanation, e.g. "הערכה: הליכה מהירה ≈4.3 MET × 95 ק״ג × 0.75 שעה".
   - Changes to already-logged exercise use exerciseUpdate (ref x1, x2, ... with the full corrected item) and exerciseDelete (refs).

Reply with ONLY one JSON object, no other text (empty arrays where nothing applies):
{"add":[{"name":"","amount":0,"unit":"","grams":null,"meal":"breakfast","calories":0,"carbs":0,"protein":0,"fat":0,"fiber":0,"source":"web","sourceNote":""}],
 "update":[{"ref":"e1","name":"","amount":0,"unit":"","grams":null,"meal":"lunch","calories":0,"carbs":0,"protein":0,"fat":0,"fiber":0,"source":"user","sourceNote":""}],
 "delete":["e2"],
 "library":[{"action":"add","id":null,"name":"","brand":"","servingAmount":100,"servingUnit":"גרם","servingGrams":100,"calories":0,"carbs":0,"protein":0,"fat":0,"fiber":0}],
 "exercise":[{"name":"הליכה מהירה","minutes":45,"calories":0,"source":"estimate","note":""}],
 "exerciseUpdate":[{"ref":"x1","name":"","minutes":30,"calories":0,"source":"user","note":""}],
 "exerciseDelete":["x2"],
 "portions":[{"term":"כוס","value":"200 מ״ל"}],
 "notes":""}
meal is one of breakfast, lunch, dinner, snack. source is one of user, library, web, reference.`;

/* ---------- validating the answer ---------- */

const num = (v) => {
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : 0;
};
const str = (v) => (typeof v === "string" ? v.trim() : "");
const SOURCES = ["user", "library", "web", "reference"];
const cleanItem = (it, fallbackMeal) => ({
  name: str(it.name),
  amount: num(it.amount) || 1,
  unit: str(it.unit) || "מנה",
  grams: it.grams == null ? null : num(it.grams) || null,
  meal: MEALS[it.meal] ? it.meal : fallbackMeal,
  calories: Math.round(num(it.calories)),
  carbs: round1(num(it.carbs)),
  protein: round1(num(it.protein)),
  fat: round1(num(it.fat)),
  fiber: round1(num(it.fiber)),
  source: SOURCES.includes(it.source) ? it.source : "reference",
  sourceNote: str(it.sourceNote),
});

/* ---------- the call ---------- */

const ERRORS = {
  not_granted: "לא אישרת לאפליקציה להשתמש ב-Claude. אפשר לאשר בפעם הבאה שתפתחו את האפליקציה, ובינתיים להוסיף פריטים ידנית.",
  sampling_disabled: "Claude לא זמין בחשבון הזה.",
  rate_limited: "הגעת למגבלת השימוש ב-Claude כרגע. נסו שוב מאוחר יותר, או הוסיפו ידנית.",
  session_expired: "צריך להתחבר מחדש ל-claude.ai.",
  refused: "הבקשה לא עובדה. נסו לנסח אחרת.",
  prompt_too_large: "הטקסט ארוך מדי. נסו לפצל אותו לכמה רישומים.",
  invalid_json: "התשובה לא התקבלה בפורמט הנכון. נסו שוב.",
  empty_completion: "לא התקבלה תשובה. נסו לנסח אחרת.",
  tools_unavailable: "החיפוש ברשימה וברשת לא זמין בתצוגה הזו.",
};

const sessionId = (() => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
})();

const SEARCH = "Parallel Search";
/** Why the web search failed, in words the user can act on. */
const SEARCH_ERRORS = {
  not_in_manifest: "החיפוש ברשת לא אושר לאפליקציה. אפשר לאשר אותו בתפריט ההרשאות של הדף ב-claude.ai.",
  approval_required: "החיפוש ברשת מחכה לאישור שלך. בפעם הבאה שיופיע חלון אישור, אשרו אותו.",
  consent_required: "החיפוש ברשת מחכה לאישור שלך. בפעם הבאה שיופיע חלון אישור, אשרו אותו.",
  server_not_connected: "החיבור Parallel Search לא מחובר בחשבון. אפשר להוסיף אותו ב-claude.ai, בהגדרות ← Connectors.",
  needs_reauth: "צריך לחבר מחדש את Parallel Search ב-claude.ai, בהגדרות ← Connectors.",
  selection_required: "יש יותר מחיבור אחד בשם Parallel Search. בחרו אחד בחלון שמופיע ב-claude.ai.",
  blocked_by_policy: "החיפוש ברשת חסום בחשבון הזה.",
  server_unavailable: "שירות החיפוש לא ענה בזמן.",
  not_granted: "החיפוש ברשת לא זמין בתצוגה הזו.",
  capability_disabled: "החיפוש ברשת לא זמין בתצוגה הזו.",
};
const searchErrorText = (code) => SEARCH_ERRORS[code] || `החיפוש ברשת נכשל (${code || "שגיאה"}).`;
const wait = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener?.("abort", () => { clearTimeout(t); rej(Object.assign(new Error("cancelled"), { code: "cancelled" })); }, { once: true });
});

/** Asks for the web search permission up front (on the user's tap), so it isn't asked mid-analysis. */
async function searchPermission() {
  const perms = await getPermissions();
  if (!perms) return "unknown";
  const name = "mcp:" + SEARCH;
  try {
    let st = await perms.state(name).catch(() => "unavailable");
    if (st === "prompt") st = (await perms.request([name]).catch(() => ({})))[name] || st;
    return st;
  } catch { return "unknown"; }
}

export const aiAvailable = async () => Boolean(await getSample());

/**
 * Sends the free text to Claude. Returns {add, update, delete, library, notes}
 * where update/delete refer to real entry ids.
 * onStep(text) reports progress ("searching the web for ...").
 */
export async function analyzeLog({ text, date, dayEntries, dayExercises = [], weightKg, foods, portions = [], defaultMeal, draft = null, adjustment = "", onStep, signal }) {
  const sample = await getSample();
  if (!sample) throw new Error("הניתוח עובד רק כשהאפליקציה פתוחה ב-claude.ai. אפשר להוסיף פריטים ידנית.");
  let mcp = await getMcp();
  let searchProblem = "";
  let librarySearched = false;
  let webSearches = 0;
  if (mcp) {
    const st = await searchPermission();
    if (st === "denied") { mcp = null; searchProblem = "החיפוש ברשת כבוי לאפליקציה. אפשר להפעיל אותו בתפריט ההרשאות של הדף ב-claude.ai."; }
  }

  const refs = new Map(dayEntries.map((e, i) => ["e" + (i + 1), e.id]));
  const current = dayEntries.length
    ? dayEntries
        .map((e, i) => `e${i + 1}: ${e.name} — ${e.amount} ${e.unit} (${MEALS[e.meal] || ""}), ${e.calories} קק״ל, פחמימות ${e.carbs}, חלבון ${e.protein}, שומן ${e.fat}, סיבים ${e.fiber}`)
        .join("\n")
    : "(nothing logged yet)";

  const xrefs = new Map(dayExercises.map((x, i) => ["x" + (i + 1), x.id]));
  const currentEx = dayExercises.length
    ? dayExercises.map((x, i) => `x${i + 1}: ${x.name}${x.minutes ? ` — ${x.minutes} דקות` : ""}, ${x.calories} קק״ל`).join("\n")
    : "(no exercise logged yet)";

  const tools = [
    {
      name: "search_my_foods",
      description:
        "Search the user's own list of custom foods and recipes (imported from Lose It or added earlier). Returns up to 8 matches with id, serving and nutrition per serving. Query with a short Hebrew food name.",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      execute: ({ query }) => {
        const q = String(query || "");
        librarySearched = true;
        onStep?.(`מחפש ברשימה שלך: ${q}`);
        const hits = searchFoods(foods, q);
        if (!hits.length) return `No items match "${q}".`;
        return hits.map((f) => ({
          id: f.id,
          name: f.name,
          brand: f.brand || undefined,
          type: f.kind === "recipe" ? "recipe" : "food",
          serving: `${f.servingAmount} ${f.servingUnit}${f.servingGrams ? ` (${f.servingGrams} g)` : ""}`,
          perServing: { calories: f.calories, carbs: f.carbs, protein: f.protein, fat: f.fat, fiber: f.fiber },
        }));
      },
    },
  ];
  if (mcp) {
    tools.push({
      name: "web_search",
      description:
        "Search the web for nutrition values. Give an objective (what to find, e.g. 'nutrition per 100g of Tnuva cottage 5%') and 1-3 short queries (Hebrew and/or English, 3-6 words). Returns page titles, URLs and excerpts.",
      inputSchema: {
        type: "object",
        properties: { objective: { type: "string" }, queries: { type: "array", items: { type: "string" } } },
        required: ["objective", "queries"],
      },
      execute: async ({ objective, queries }, ctx) => {
        const qs = (Array.isArray(queries) ? queries : [queries]).map(String).filter(Boolean).slice(0, 3);
        onStep?.(`מחפש ברשת: ${qs[0] || objective}`);
        if (!librarySearched) throw new Error("search the user's own list with search_my_foods first; use web_search only for foods it has no fitting item for");
        const input = { objective: String(objective || qs[0]), search_queries: qs.length ? qs : [String(objective)], session_id: sessionId };
        let res, err;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { res = await mcp.callTool(SEARCH, "web_search", input, { signal: ctx?.signal }); err = null; break; }
          catch (e) {
            err = e;
            if (e?.code === "cancelled" || !e?.retryable || attempt) break;
            onStep?.("החיפוש לא ענה, מנסה שוב…");
            await wait(Math.min(e.retryAfterMs || 1500 + Math.random() * 1000, 8000), ctx?.signal);
          }
        }
        if (!err) webSearches++;
        if (err) {
          if (err.code === "cancelled") throw err;
          searchProblem = searchErrorText(err.code);
          console.warn("web_search failed", err.code, err.message);
          throw new Error(`web search unavailable (${err.code || "error"}); use reference values and say so in notes`);
        }
        const p = typeof res?.payload === "string" ? (() => { try { return JSON.parse(res.payload); } catch { return null; } })() : res?.payload;
        const results = (p?.results || []).slice(0, 5);
        if (!results.length) return "No results.";
        return results.map((r) => ({ title: r.title, url: r.url, excerpt: (r.excerpts || []).join("\n").replace(/\s+\n/g, "\n").slice(0, 1800) }));
      },
    });
  }

  const idToRef = new Map([...refs].map(([r, id]) => [id, r]));
  const idToXref = new Map([...xrefs].map(([r, id]) => [id, r]));
  const strip = ({ id, ...rest }) => rest;
  const draftJson = draft
    ? JSON.stringify({
        add: draft.add,
        update: draft.update.map((u) => ({ ref: idToRef.get(u.id), ...strip(u) })),
        delete: draft.delete.map((id) => idToRef.get(id)),
        exercise: draft.exercise,
        exerciseUpdate: draft.exerciseUpdate.map((u) => ({ ref: idToXref.get(u.id), ...strip(u) })),
        exerciseDelete: draft.exerciseDelete.map((id) => idToXref.get(id)),
      })
    : "";
  const revision = draft
    ? `

You ALREADY turned that message into the draft below, and the user reviewed it. They now ask for an adjustment.
Apply ONLY what the adjustment asks, on top of this draft: keep every other item exactly as it is (same names, amounts and values). When an amount changes, rescale that item's nutrients from its own values (or re-look it up if the item itself changes). The adjustment may also refer to an item by its name, describe a portion size (→ "portions"), or ask to add, remove or split items.
Reply with the COMPLETE revised draft in the same JSON format (all the items that should be saved, not only the changed ones). Leave "library" empty unless the adjustment asks to change a saved food or recipe.

The current draft:
${draftJson}

The user's adjustment:
<adjustment>
${adjustment}
</adjustment>`
    : "";

  const prompt = `${INSTRUCTIONS}

Date of this log: ${date}. Default meal: ${defaultMeal}.
${mcp ? "" : "Web search is not available right now: use the library or reference values, and mention in notes that branded products weren't checked online.\n"}
The user's current weight: ${weightKg ? weightKg + " kg" : "unknown"}.

The user's own portion definitions (always use these):
${portions.length ? portions.map((p) => `- ${p.term} = ${p.value}`).join("\n") : "(none yet)"}

The day's current food log:
${current}

The day's current exercise log:
${currentEx}

The user's message:
<message>
${text}
</message>${revision}`;

  onStep?.(draft ? "מעדכן את הרשימה…" : "קורא את מה שכתבת…");
  let raw;
  try {
    try {
      raw = await sample.json(prompt, { tools, signal });
      // standard values are the last resort: if some were used without any online search, ask once to search first
      const guessed = mcp && !searchProblem && !webSearches && raw && typeof raw === "object"
        ? [...(raw.add || []), ...(raw.update || [])].filter((it) => it?.source === "reference").map((it) => String(it.name || "")).filter(Boolean)
        : [];
      if (guessed.length) {
        onStep?.("מחפש ברשת את מה שלא נמצא ברשימה…");
        raw = await sample.json([
          { role: "user", content: prompt },
          { role: "assistant", content: JSON.stringify(raw) },
          { role: "user", content: `You used standard ("reference") values for: ${guessed.join(", ")}, without searching online. Search online with web_search for each of them first (they were not in my list), use what you find ("web"), and keep "reference" only for a food the search found nothing similar for. Reply with the COMPLETE JSON again.` },
        ], { tools, signal });
      }
    } catch (e) {
      // a view that can't run page tools: try once more without them, from general knowledge
      if (e?.code !== "tools_unavailable") throw e;
      onStep?.("מנתח בלי חיפוש…");
      raw = await sample.json(prompt + "\n\nNote: the search tools are unavailable right now. Use reference values, and say in notes that the user's list and the web weren't checked.", { signal });
    }
  } catch (e) {
    if (e && e.code === "cancelled") throw Object.assign(new Error("בוטל"), { cancelled: true });
    if (e && e.code) throw new Error(ERRORS[e.code] || "שגיאה זמנית בניתוח. נסו שוב.");
    throw e;
  }
  if (!raw || typeof raw !== "object") throw new Error(ERRORS.invalid_json);

  const add = (raw.add || []).map((it) => cleanItem(it, defaultMeal)).filter((it) => it.name);
  const update = (raw.update || [])
    .map((it) => ({ id: refs.get(String(it.ref)), ...cleanItem(it, defaultMeal) }))
    .filter((it) => it.id && it.name);
  const del = (raw.delete || []).map((r) => refs.get(String(r))).filter(Boolean);
  const library = (raw.library || [])
    .map((l) => ({
      action: l.action === "update" && foods.some((f) => f.id === l.id) ? "update" : "add",
      id: l.action === "update" ? l.id : null,
      name: str(l.name),
      brand: str(l.brand),
      servingAmount: num(l.servingAmount) || 1,
      servingUnit: str(l.servingUnit) || "מנה",
      servingGrams: num(l.servingGrams) || null,
      calories: Math.round(num(l.calories)),
      carbs: round1(num(l.carbs)),
      protein: round1(num(l.protein)),
      fat: round1(num(l.fat)),
      fiber: round1(num(l.fiber)),
    }))
    .filter((l) => l.name);
  // every food whose values came from the web is saved to the user's list (unless it's already there)
  const listed = new Set([...foods.map((f) => norm(f.name)), ...library.filter((l) => l.action === "add").map((l) => norm(l.name))]);
  for (const it of [...add, ...update]) {
    if (it.source !== "web" || listed.has(norm(it.name))) continue;
    listed.add(norm(it.name));
    library.push({
      action: "add", id: null, name: it.name, brand: "",
      servingAmount: it.amount || 1, servingUnit: it.unit || "מנה", servingGrams: it.grams || null,
      calories: it.calories, carbs: it.carbs, protein: it.protein, fat: it.fat, fiber: it.fiber,
    });
  }
  const cleanEx = (x) => ({
    name: str(x.name),
    minutes: x.minutes == null ? null : Math.round(num(x.minutes)) || null,
    calories: Math.round(num(x.calories)),
    source: x.source === "user" ? "user" : "estimate",
    note: str(x.note),
  });
  const exercise = (raw.exercise || []).map(cleanEx).filter((x) => x.name);
  const exerciseUpdate = (raw.exerciseUpdate || []).map((x) => ({ id: xrefs.get(String(x.ref)), ...cleanEx(x) })).filter((x) => x.id && x.name);
  const exerciseDelete = (raw.exerciseDelete || []).map((r) => xrefs.get(String(r))).filter(Boolean);
  const newPortions = (raw.portions || []).map((p) => ({ term: str(p.term), value: str(p.value) })).filter((p) => p.term && p.value);
  return { add, update, delete: del, library, exercise, exerciseUpdate, exerciseDelete, portions: newPortions, notes: [str(raw.notes), searchProblem].filter(Boolean).join(" ") };
}
