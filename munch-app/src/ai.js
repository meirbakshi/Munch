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
    .replace(/יי+/g, "י") // spelling variants: עגבנייה = עגבניה
    .replace(/וו+/g, "ו")
    .trim();
const tokens = (s) => norm(s).split(" ").filter(Boolean);
// strip a leading Hebrew prefix letter (ו, ה, ב, ל, מ, ש, כ) for a looser match
const stem = (t) => (t.length > 3 && "והבלמשכ".includes(t[0]) ? t.slice(1) : t);
// plural to singular (after norm, ם is מ): עגבניות → עגבניה, מלפפונים → מלפפונ, בצלים → בצל.
// A final ה is kept: בייגלה isn't בייגל.
const root = (t) => (t.length >= 5 && t.endsWith("ות") ? t.slice(0, -2) + "ה" : t.length >= 5 && t.endsWith("ימ") ? t.slice(0, -2) : t);

/** The name that identifies a food, ignoring spelling, plural, word order and a short note in parentheses
 *  ("ביצה (L)", "פיצה (משולש)"); a list of ingredients in parentheses stays part of the name. */
const dropNote = (s) => String(s || "").replace(/\(([^)]*)\)/g, (m, inner) => (inner.includes(",") || inner.trim().split(/\s+/).length > 2 ? ` ${inner} ` : " "));
export const foodKey = (s) => tokens(dropNote(s)).map(root).sort().join(" ");
/** Every name a list item goes by: its name, with its brand, and its variants (aliases). */
const namesOf = (f) => [f.name, ...(f.brand ? [`${f.name} ${f.brand}`] : []), ...(Array.isArray(f.aliases) ? f.aliases : [])].filter(Boolean);
// a bare category comes in many versions, so the list's item isn't assumed to be it (a "פיצה" isn't the list's "פיצה (משולש)")
const BROAD = new Set(["סלט", "פיצה", "כריך", "סנדוויץ", "טוסט", "פסטה", "מרק", "עוגה", "שקשוקה", "חביתה", "אומלט", "שייק", "סמותי", "סמוזי", "באול", "ראפ", "טורטיה", "קערה"].map((w) => foodKey(w)));
/** List items that are the same food as `name` (e.g. "מלפפונים" → the item "מלפפון"). */
// each item's normalized names, worked out once (the list has ~1,200 items and every lookup scans it)
const cache = new WeakMap();
const indexed = (f) => {
  let x = cache.get(f);
  if (!x || x.src !== f.name + "|" + f.brand + "|" + (f.aliases || []).join("|")) {
    const text = norm(`${f.name} ${f.brand || ""} ${(f.aliases || []).join(" ")}`);
    x = { src: f.name + "|" + f.brand + "|" + (f.aliases || []).join("|"), text, words: text.split(" "), keys: new Set(namesOf(f).map(foodKey)), name: norm(f.name), len: tokens(f.name).length };
    cache.set(f, x);
  }
  return x;
};
export const sameFoods = (foods, name) => {
  const k = foodKey(name);
  return k && !BROAD.has(k) ? foods.filter((f) => indexed(f).keys.has(k)) : [];
};

export function searchFoods(foods, query, limit = 8) {
  const q = tokens(query);
  if (!q.length) return [];
  const qn = norm(query), qk = foodKey(query);
  const scored = [];
  for (const f of foods) {
    const { text: name, words: ft, keys, name: own, len } = indexed(f);
    let score = 0;
    for (const t of q) {
      if (ft.includes(t)) score += 3;
      else if (ft.some((x) => stem(x) === stem(t))) score += 2.5;
      else if (ft.some((x) => root(stem(x)) === root(stem(t)))) score += 2.2;
      else if (name.includes(t) || name.includes(stem(t))) score += 1.5;
    }
    if (own === qn || keys.has(qk)) score += 4;
    // length counts the item's own name only, so variants don't push it down
    if (score > 0) scored.push([score / Math.max(1, q.length) - len * 0.02, f]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}

// words that never name a food on their own: amounts, units, meals, verbs, connectors
const SKIP = new Set(("אכלתי שתיתי היום אתמול בבוקר בצהריים בערב בלילה ארוחת ארוחה בוקר צהריים ערב נשנוש נשנושים עם בלי של על גם עוד קצת הרבה מעט חצי רבע שליש אחד אחת שני שתי שתיים שלוש שלושה ארבע ארבעה חמש חמישה " +
  "גרם גר ג קג מל מ ליטר כף כפות כפית כפיות כוס כוסות ספל קערה קערית צלחת מנה מנות יחידה יחידות פרוסה פרוסות חתיכה חתיכות משולש משולשים קופסה גביע בקבוק פחית שקית חופן קטן קטנה גדול גדולה בינוני בינונית " +
  "או וגם שהיה שהיו היה היו לי אני את זה זו מה כמו בערך בתוך לתוך ועוד וקצת " +
  "דקה דקות שעה שעות קמ צעדים הליכה הליכת ריצה ריצת אימון שחייה אופניים כושר יוגה פילאטיס").split(" ").map(norm));
/**
 * Looks the message up in the user's list before Claude sees it, so most foods need no lookup round:
 * every phrase of 1-3 words is matched, exact matches first, then the closest items.
 * Returns {items, phrases}: the list items, and the phrases (by foodKey) that count as looked up.
 */
export function prefetchFoods(foods, text, max = 45) {
  const words = tokens(text).filter((w) => !/^[\d.%]+$/.test(w));
  const grams = [];
  for (let n = 3; n >= 1; n--)
    for (let i = 0; i + n <= words.length; i++) {
      const g = words.slice(i, i + n);
      if (SKIP.has(g[0]) || SKIP.has(g[n - 1]) || g.every((w) => SKIP.has(w) || w.length < 2)) continue;
      grams.push(g.join(" "));
      // "ומלפפונים", "והגזר", "בשמן": also without the joined prefix letters
      const bare = g[0].replace(/^ו?[הב]?/, "");
      if (bare !== g[0] && bare.length >= 3 && !SKIP.has(bare)) grams.push([bare, ...g.slice(1)].join(" "));
    }
  const items = new Map(), phrases = new Set();
  const take = (f) => { if (items.size < max) items.set(f.id, f); };
  for (const g of new Set(grams)) {
    const exact = sameFoods(foods, g);
    if (exact.length) { phrases.add(foodKey(g)); exact.slice(0, 3).forEach(take); }
  }
  // the closest items for every phrase (a dish may be saved under a longer or different name)
  for (const g of new Set(grams)) {
    if (items.size >= max) break;
    searchFoods(foods, g, g.includes(" ") ? 2 : 3).forEach(take);
    phrases.add(foodKey(g));
  }
  return { items: [...items.values()], phrases };
}

/* ---------- the prompt ---------- */

const INSTRUCTIONS = `You are the logging engine of a personal calorie tracker used in Israel. The user writes in Hebrew, freely, about what they ate on a given day and/or exercise they did. They may also ask to change or delete items already logged that day. Turn the message into changes to that day's log. A message can mix food and exercise.

How to work (fast: every tool round costs the user time):
- The items of the user's list that match the words of the message are given below the instructions ("Already looked up"). They count as searched: don't call search_my_foods again for a food they cover. Call it only for foods and components they don't cover.
- Use as few rounds as you can. In each round make ALL the calls you can already make, together: all search_my_foods calls for uncovered foods at once; all web_search calls for whole dishes and foods missing from the list at once; then, only for dishes not found online, all their missing components at once. If everything is covered by the list, answer right away with no tool call.

1. Split the message into individual foods and drinks with the amount eaten. When no amount is given, assume one typical ISRAELI serving and say so in sourceNote. Use Israeli sizes, not American ones. Typical references: medium cucumber ≈ 100 g, medium tomato ≈ 120 g, medium apple ≈ 150 g, banana ≈ 120 g (peeled), egg (L) ≈ 55 g without shell, slice of bread ≈ 30 g, pita ≈ 90 g, laffa ≈ 120 g, schnitzel ≈ 130 g, portion of hummus in a restaurant ≈ 200 g, tablespoon of oil ≈ 13 g, tablespoon of raw tahini ≈ 15 g, cup = 240 ml, tablespoon = 15 ml, teaspoon = 5 ml, "קופסה" of cottage/white cheese = 250 g, Israeli yogurt cup ≈ 150–200 g (check the product). The user's own portion definitions (listed below the instructions) ALWAYS override these defaults.
2. For each food or dish pick nutrition values by this priority, and record which one you used in "source":
   a. "user": the user wrote the nutrition values in the message. Use exactly what they wrote and fill in only what's missing.
   b. "library": the user's own list of foods and recipes (about 1,100 items: Israeli basics, vegetables, fruit, dairy, brands, their recipes). Every food and every component must be checked in the list first: in the "Already looked up" items, else with search_my_foods (retry with a shorter or alternative Hebrew name, e.g. singular, if nothing matches). WAIT for the list's answer before any web_search for that food: never call both for one food in the same round. List items may have "aliases" (other names for the same item) and "otherSizes" (more serving sizes with their weight, e.g. כף = 20 g): use them to match the user's words and to scale.
      - A basic food or single ingredient (a vegetable, fruit, egg, bread, cheese, oil, rice, a spice...) that has a list item of the same name IS that item: always use it, at the amount eaten (scale from its serving), even inside a dish the user described. The rules below are about DISHES and products only.
      For dishes and products, be SELECTIVE: use a library item only when the user clearly means THAT specific item.
      - Use it when the text names the same specific dish or product (e.g. "מג׳דרה" → their "מג׳דרה, כוס אחת"; "פשטידת זיתים" → their olive quiche; a brand + product that matches).
      - Do NOT use it for a broad category that comes in many versions (salad, pizza, sandwich, toast, pasta, soup, cake, shakshuka, omelette, smoothie, bowl, wrap...) unless the user names the same specific variety as the library item ("פיצה מעדנות" yes; just "פיצה" no; "סלט" no).
      - Do NOT use it when the user describes what this serving contained (ingredients, toppings, cooking method) and that differs from, or isn't evidently, the saved item. Then look for the dish as described online (c), and if it isn't found, compose it (d). Name the item by what was described (e.g. "סלט עגבניות, מלפפון ובצל עם כף שמן זית").
      - A generic name with no details and no specific library match: search online for a typical Israeli version ("web"; "reference" only as the last resort below) and state the assumption in sourceNote.
      When unsure, don't use the library item, and mention the closest saved item in notes so the user can ask for it.
   c. "web": ONLY for a food that search_my_foods returned no fitting item for, search online with web_search, generic foods included (an apple, an egg, white rice, a restaurant dish). Search per food (one call per food, 1-3 queries, and "food" = its Hebrew name); web_search refuses a food that is in the user's list and returns the list item instead: then use that item ("library"). Prefer Israeli sources: the manufacturer's site, foodsdictionary.co.il, Open Food Facts Israel, the Ministry of Health database (also on israel.com/calories). Use per-100 g values and scale them. If the first search finds nothing usable, try once more with other words (Hebrew and English).
   d. "composed": a dish made of several components (the user lists them, e.g. "40 גרם עלי תרד מוקפצים בחמאה, שום וגבינת שמנת", or it is evidently a combination, e.g. "פוקצ׳ה עם אנטי פסטי") whose WHOLE was not found in the list (b) nor online (c) as the same dish or close enough. Then:
      - Split it into its components (spinach, butter, garlic, cream cheese; focaccia, antipasti).
      - Give each component an amount: what the user described first; otherwise a typical amount for this dish. When the user gave the dish's total weight or size, the components must add up to it (40 g of spinach in butter, garlic and cream cheese ≈ 30 g spinach, 5 g butter, 3 g cream cheese, 2 g garlic).
      - Find each component's values by the same order: search_my_foods first (most basic ingredients are in the list: use them, source "library"), web_search only for the components the list has no item for, then "reference" as the last resort.
      - The dish's values are the sum of its components. Log the dish as ONE item, and list the components in its "components" array: [{"name","amount","unit","grams","calories","carbs","protein","fat","fiber","source","per100g"}] with source library, web or reference, each for the amount used; for a "web" component also give "per100g": {"calories","carbs","protein","fat","fiber"} as found online.
      - A saved recipe from the list that has "ingredients" is the described dish only when those ingredients match what the user described.
      - sourceNote: the breakdown, short, e.g. "30 ג׳ תרד (מהרשת) · 5 ג׳ חמאה (מהרשימה) · 3 ג׳ גבינת שמנת (מהרשת) · 2 ג׳ שום".
   b2. "label": the values were read from a photo of the product's nutrition label that the user attached (see "Photos" below).
   e. "reference": a LAST resort, only when web_search returned nothing similar enough to the food after you tried, or web search is unavailable. Use standard values (Israeli Ministry of Health / USDA) and say in sourceNote that nothing was found online.
3. All values are for the full amount eaten: calories (kcal), carbs, protein, fat, fiber (grams). "carbs" excludes dietary fiber when the source separates them, as Israeli labels do. Round calories to whole numbers and grams to one decimal.
4. Changes to what was already logged: the day's current log is given with refs (e1, e2, ...). If the user says something was wrong, eaten in a different amount, or should be removed, put it in "update" (with the ref and the full corrected item) or "delete" (the ref). Only touch logged items the user referred to. If the user's message only adds foods, leave update and delete empty.
5. Library changes ("library"): keep the user's list of foods and recipes useful.
   - Foods found online (source "web") and "composed" dishes are saved to the list AUTOMATICALLY from the items you log: never put them in "library". For a "web" food in "add", give its "per100g" values as found online (like a web component), so it's saved per 100 g.
   - "add" a new item only when the user gives nutrition values for a named food, or describes a recipe of their own (ingredients and amounts → compute per-serving values).
   - "update" an existing library item (its id) when the user corrects its values or says its serving/recipe changed. An update holds only the fields that change.
   - Teach the list, with an "update" that holds only "id" and the new "aliases" and/or "otherSizes":
     · "aliases": the user called a list item by another name and you used it (e.g. "גמבה" for the item "פלפל אדום"): ["גמבה"].
     · "otherSizes": you learned the weight of a serving size of a list item that isn't listed (e.g. the user said their spoon of ריבת חלב is 20 g): [{"unit":"כף","grams":20}].
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
 "library":[{"action":"add","id":null,"kind":"food","name":"","brand":"","servingAmount":100,"servingUnit":"גרם","servingGrams":100,"calories":0,"carbs":0,"protein":0,"fat":0,"fiber":0},{"action":"update","id":"<id>","aliases":["גמבה"]}],
 "exercise":[{"name":"הליכה מהירה","minutes":45,"calories":0,"source":"estimate","note":""}],
 "exerciseUpdate":[{"ref":"x1","name":"","minutes":30,"calories":0,"source":"user","note":""}],
 "exerciseDelete":["x2"],
 "portions":[{"term":"כוס","value":"200 מ״ל"}],
 "notes":""}
meal is one of breakfast, lunch, dinner, snack. source is one of user, library, label, web, composed, reference.`;

/** What to do with attached photos (added to the prompt only when there are any). */
const PHOTOS = (n) => `
Photos: the user attached ${n} photo${n > 1 ? "s" : ""} (shown with this message). They show the nutrition facts (״סימון תזונתי״ / ״ערכים תזונתיים״) of food products, often with the package's front (name, brand). Treat what they show exactly as if the user had typed those values into the message:
- Find every product in the photos. Several photos can show one product (front and back): combine them. For each, read:
  · its name in Hebrew as on the package (a short, natural name, e.g. "יוגורט גו 0%", not a slogan) and its brand (e.g. "תנובה", "שטראוס");
  · the values per 100 g (or per 100 ml): energy in kcal (אנרגיה, קלוריות; not kJ), carbohydrates (פחמימות; "מתוכן סוכרים" is part of them, never added), protein (חלבונים), total fat (שומנים; not just saturated), dietary fiber (סיבים תזונתיים; 0 when not listed). If only per-serving values are shown, use them with that serving's weight;
  · the package's own sizes when shown: the serving (מנה = 30 ג׳), the unit (יחידה / גביע / חטיף / בקבוק = its weight), the whole package.
- Read the numbers carefully: decimal commas (3,5 = 3.5), the right column (per 100 g, not "per serving" or "% of daily value"). Never guess a value that isn't legible: if a photo can't be read, or isn't a nutrition label, say so in notes and leave that product out.
- Save every product to the user's list, in "library", with "fromPhoto": true:
  · look each product up with search_my_foods first (by its name, without the brand), all in one round. If the list has the SAME product (same name and brand), "update" that item with the label's values when they differ, and add the package sizes as "otherSizes";
  · otherwise "add" it: kind "food", name, brand, servingAmount 100, servingUnit "גרם" (or "מ״ל" for a drink), servingGrams 100, the values per 100, and "otherSizes" for the package's sizes (e.g. [{"unit":"גביע","grams":150}]).
- Log a product (in "add", source "label", with "per100g" as read) ONLY when the message says it was eaten or drunk (e.g. "אכלתי גביע", "חצי מהחטיף", "100 גרם מזה"). Scale from the label to the amount eaten; "one" of it is the package's unit or serving. sourceNote: "לפי התווית: X קק״ל ל-100 ג׳". When the message is empty or only asks to save, log nothing: just save the products to the list.
- Foods in the message that aren't in the photos are handled as usual.
`;

/* ---------- validating the answer ---------- */

const num = (v) => {
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : 0;
};
const str = (v) => (typeof v === "string" ? v.trim() : "");
const SOURCES = ["user", "library", "label", "web", "composed", "reference"];
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

/** A composed dish's components, as the model listed them (kept out of the logged entry). */
const cleanComponents = (list) => (Array.isArray(list) ? list : []).map((c) => ({
  name: str(c?.name), amount: num(c?.amount) || 1, unit: str(c?.unit) || "גרם", grams: c?.grams == null ? null : num(c.grams) || null,
  calories: Math.round(num(c?.calories)), carbs: round1(num(c?.carbs)), protein: round1(num(c?.protein)), fat: round1(num(c?.fat)), fiber: round1(num(c?.fiber)),
  source: ["library", "web", "reference"].includes(c?.source) ? c.source : "reference",
  per100g: c?.per100g && typeof c.per100g === "object" && num(c.per100g.calories) > 0 ? c.per100g : null,
})).filter((c) => c.name);

/* ---------- the call ---------- */

const ERRORS = {
  not_granted: "לא אישרת לאפליקציה להשתמש ב-Claude. אפשר לאשר בפעם הבאה שתפתחו את האפליקציה, ובינתיים להוסיף פריטים ידנית.",
  sampling_disabled: "Claude לא זמין בחשבון הזה.",
  rate_limited: "הגעת למגבלת השימוש ב-Claude כרגע. נסו שוב מאוחר יותר, או הוסיפו ידנית.",
  session_expired: "צריך להתחבר מחדש ל-claude.ai.",
  refused: "הבקשה לא עובדה. נסו לנסח אחרת.",
  prompt_too_large: "הטקסט ארוך מדי. נסו לפצל אותו לכמה רישומים.",
  images_unavailable: "אי אפשר לשלוח תמונות בתצוגה הזו.",
  image_rejected: "אחת התמונות לא נקראה. נסו תמונה אחרת (JPEG או PNG).",
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
export async function analyzeLog({ text, images = [], date, dayEntries, dayExercises = [], weightKg, foods, portions = [], defaultMeal, draft = null, adjustment = "", onStep, signal }) {
  const sample = await getSample();
  if (!sample) throw new Error("הניתוח עובד רק כשהאפליקציה פתוחה ב-claude.ai. אפשר להוסיף פריטים ידנית.");
  let mcp = await getMcp();
  let searchProblem = "";
  const t0 = Date.now();
  const timing = []; // [seconds since start, what happened], for measuring
  const mark = (what) => timing.push([Math.round((Date.now() - t0) / 100) / 10, what]);
  // the message is looked up in the list up front, so most foods need no lookup round
  const pre = prefetchFoods(foods, `${text} ${adjustment}`);
  const looked = new Set(pre.phrases); // the foods already looked up in the user's list (by foodKey)
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
        looked.add(foodKey(q));
        mark("list: " + q);
        onStep?.(`מחפש ברשימה שלך: ${q}`);
        const hits = searchFoods(foods, q);
        if (!hits.length) return `No items match "${q}".`;
        return asItems(hits);
      },
    },
  ];
  /** List items as the model sees them. */
  function asItems(hits) {
    return hits.map((f) => ({
      id: f.id,
      name: f.name,
      brand: f.brand || undefined,
      type: f.kind === "recipe" ? "recipe" : "food",
      serving: `${f.servingAmount} ${f.servingUnit}${f.servingGrams ? ` (${f.servingGrams} g)` : ""}`,
      perServing: { calories: f.calories, carbs: f.carbs, protein: f.protein, fat: f.fat, fiber: f.fiber },
      aliases: f.aliases?.length ? f.aliases : undefined,
      otherSizes: f.portions?.length ? f.portions.map((x) => `${x.unit} = ${x.grams} g`) : undefined,
      ingredients: f.components?.length ? f.components.map((c) => `${c.name}${c.grams ? ` ${c.grams} g` : ""}`).join(", ") : undefined,
    }));
  }
  if (mcp) {
    tools.push({
      name: "web_search",
      description:
        "Search the web for the nutrition values of ONE food that the user's list has no item for (look it up with search_my_foods first). Give the food's Hebrew name, an objective (what to find, e.g. 'nutrition per 100g of Tnuva cottage 5%') and 1-3 short queries (Hebrew and/or English, 3-6 words). Returns page titles, URLs and excerpts; for a food that is in the user's list it returns the list item instead.",
      inputSchema: {
        type: "object",
        properties: {
          food: { type: "string", description: "the food's name in Hebrew, as you'd search the user's list (e.g. מלפפון)" },
          objective: { type: "string" },
          queries: { type: "array", items: { type: "string" } },
        },
        required: ["food", "objective", "queries"],
      },
      execute: async ({ food, objective, queries }, ctx) => {
        const qs = (Array.isArray(queries) ? queries : [queries]).map(String).filter(Boolean).slice(0, 3);
        const name = String(food || "").trim() || qs[0] || String(objective || "");
        // the user's list comes first: a food that's in it is never searched online
        const own = sameFoods(foods, name);
        if (own.length) {
          looked.add(foodKey(name));
          onStep?.(`נמצא ברשימה שלך: ${own[0].name}`);
          const note = own.some((f) => f.kind === "recipe")
            ? `The user's list has "${name}" as a saved dish. If it is the dish the user described (same components), use it (source "library"); otherwise compose this serving from its components, each looked up with search_my_foods first. Don't search it online.`
            : `"${name}" is in the user's list. Don't search it online: use this item (source "library"), scaled to the amount eaten.`;
          return { inUserList: true, note, items: asItems(own.slice(0, 3)) };
        }
        if (!looked.has(foodKey(name))) {
          looked.add(foodKey(name));
          const hits = searchFoods(foods, name);
          if (hits.length) return { notSearchedYet: true, note: `You didn't look "${name}" up in the user's list first. These are its closest items: if one of them is the food the user means, use it (source "library"). Only if none fits, call web_search again for it.`, items: asItems(hits) };
        }
        onStep?.(`מחפש ברשת: ${qs[0] || objective}`);
        mark("web: " + name);
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
        mark((err ? "web failed: " : "web done: ") + name);
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

Already looked up: the items of the user's list that match the words of the message (one per line; per serving):
${pre.items.length ? asItems(pre.items).map((x) => JSON.stringify(x)).join("\n") : "(no matches in the list)"}

The day's current food log:
${current}

The day's current exercise log:
${currentEx}

${images.length ? PHOTOS(images.length) : ""}
The user's message:
<message>
${text || (images.length ? "(no text: only the photos)" : "")}
</message>${revision}`;

  onStep?.(draft ? "מעדכן את הרשימה…" : images.length ? (images.length > 1 ? "קורא את התמונות…" : "קורא את התמונה…") : "קורא את מה שכתבת…");
  const opts = images.length ? { images } : {};
  let raw;
  try {
    try {
      mark("start");
      raw = await sample.json(prompt, { tools, signal, ...opts });
      mark("answer");
      // standard values are the last resort: if some were used without any online search, ask once to search first
      const guessed = mcp && !searchProblem && !webSearches && raw && typeof raw === "object"
        ? [...(raw.add || []), ...(raw.update || []), ...[...(raw.add || []), ...(raw.update || [])].flatMap((it) => (Array.isArray(it?.components) ? it.components : []))]
            .filter((it) => it?.source === "reference").map((it) => String(it.name || "")).filter(Boolean)
        : [];
      if (guessed.length) {
        onStep?.("מחפש ברשת את מה שלא נמצא ברשימה…");
        raw = await sample.json([
          { role: "user", content: prompt },
          { role: "assistant", content: JSON.stringify(raw) },
          { role: "user", content: `You used standard ("reference") values for: ${guessed.join(", ")}, without searching online. Search online with web_search for each of them first, all in one round (they were not in my list), use what you find ("web"), and keep "reference" only for a food the search found nothing similar for. Reply with the COMPLETE JSON again.` },
        ], { tools, signal, ...opts });
        mark("second answer");
      }
    } catch (e) {
      // a view that can't run page tools: try once more without them, from general knowledge
      if (e?.code !== "tools_unavailable") throw e;
      onStep?.("מנתח בלי חיפוש…");
      raw = await sample.json(prompt + "\n\nNote: the search tools are unavailable right now. Use reference values, and say in notes that the user's list and the web weren't checked.", { signal, ...opts });
    }
  } catch (e) {
    if (e && e.code === "cancelled") throw Object.assign(new Error("בוטל"), { cancelled: true });
    if (e && e.code) throw new Error(ERRORS[e.code] || "שגיאה זמנית בניתוח. נסו שוב.");
    throw e;
  }
  if (!raw || typeof raw !== "object") throw new Error(ERRORS.invalid_json);

  const components = new Map(); // logged item → its components
  const per100 = new Map(); // logged web item → its values per 100 g, as found online
  const parse = (r, it) => {
    components.set(it, cleanComponents(r.components));
    if (r.per100g && typeof r.per100g === "object" && num(r.per100g.calories) > 0) per100.set(it, r.per100g);
    return it;
  };
  const add = (raw.add || []).map((r) => parse(r, cleanItem(r, defaultMeal))).filter((it) => it.name);
  const update = (raw.update || [])
    .map((r) => parse(r, { id: refs.get(String(r.ref)), ...cleanItem(r, defaultMeal) }))
    .filter((it) => it.id && it.name);
  const del = (raw.delete || []).map((r) => refs.get(String(r))).filter(Boolean);

  /* changes to the user's list */
  const byId = new Map(foods.map((f) => [f.id, f]));
  const cleanSizes = (list) => (Array.isArray(list) ? list : [])
    .map((x) => ({ unit: str(x?.unit), grams: round1(num(x?.grams)) })).filter((x) => x.unit && x.grams > 0);
  // a variant or size is added to what the item already has (never replacing it)
  const withAliases = (f, more) => {
    const have = new Set([f.name, ...(f.aliases || [])].map(foodKey));
    const out = [...(f.aliases || [])];
    for (const a of more.map(str).filter(Boolean)) if (!have.has(foodKey(a))) { have.add(foodKey(a)); out.push(a); }
    return out;
  };
  const withSizes = (f, more) => {
    const out = [...(f.portions || [])];
    for (const x of more) {
      const i = out.findIndex((y) => norm(y.unit) === norm(x.unit));
      if (i >= 0) out[i] = x; else if (norm(x.unit) !== norm(f.servingUnit) || f.servingAmount !== 1) out.push(x);
    }
    return out;
  };
  const NUMS = ["calories", "carbs", "protein", "fat", "fiber"];
  const library = [];
  const updates = new Map(); // id → the update for it (one per item)
  const updateOf = (f) => {
    if (!updates.has(f.id)) { const u = { action: "update", id: f.id }; updates.set(f.id, u); library.push(u); }
    return updates.get(f.id);
  };
  const latest = (f) => ({ ...f, ...(updates.get(f.id) || {}) });
  const fullKey = (f) => foodKey(`${f.name} ${f.brand || ""}`);
  const listed = new Map(); // key → list item, for every name an item goes by
  for (const f of foods) for (const n of namesOf(f)) if (!listed.has(foodKey(n))) listed.set(foodKey(n), f);
  const inList = (name) => listed.get(foodKey(name));
  for (const l of raw.library || []) {
    if (!l || typeof l !== "object") continue;
    const old = l.action === "update" ? byId.get(l.id) : null;
    if (old) { // only the fields given change
      const u = updateOf(old);
      if (str(l.name)) u.name = str(l.name);
      if (l.brand !== undefined) u.brand = str(l.brand);
      if (l.kind === "recipe" || l.kind === "food") u.kind = l.kind;
      if (num(l.servingAmount) > 0) u.servingAmount = num(l.servingAmount);
      if (str(l.servingUnit)) u.servingUnit = str(l.servingUnit);
      if (l.servingGrams !== undefined) u.servingGrams = num(l.servingGrams) || null;
      for (const k of NUMS) if (l[k] !== undefined && l[k] !== null && l[k] !== "") u[k] = k === "calories" ? Math.round(num(l[k])) : round1(num(l[k]));
      if (Array.isArray(l.aliases)) { const a = withAliases(latest(old), l.aliases); if (a.length !== (old.aliases || []).length || u.aliases) u.aliases = a; }
      const sizes = cleanSizes(l.otherSizes || l.portions);
      if (sizes.length) u.portions = withSizes(latest(old), sizes);
      if (Object.keys(u).length === 2) { library.splice(library.indexOf(u), 1); updates.delete(old.id); }
      continue;
    }
    const item = {
      action: "add", id: null, ...(l.kind === "recipe" ? { kind: "recipe" } : {}), ...(l.fromPhoto && images.length ? { source: "label" } : {}),
      name: str(l.name), brand: str(l.brand),
      servingAmount: num(l.servingAmount) || 1, servingUnit: str(l.servingUnit) || "מנה", servingGrams: num(l.servingGrams) || null,
      calories: Math.round(num(l.calories)), carbs: round1(num(l.carbs)), protein: round1(num(l.protein)), fat: round1(num(l.fat)), fiber: round1(num(l.fiber)),
      ...(Array.isArray(l.aliases) && l.aliases.length ? { aliases: l.aliases.map(str).filter(Boolean) } : {}),
      ...(cleanSizes(l.otherSizes || l.portions).length ? { portions: cleanSizes(l.otherSizes || l.portions) } : {}),
    };
    if (!item.name) continue;
    // never save a second copy of a food that's already in the list (or twice in one log)
    if (listed.has(fullKey(item))) continue;
    listed.set(fullKey(item), item);
    if (!listed.has(foodKey(item.name))) listed.set(foodKey(item.name), item);
    library.push(item);
  }
  // every food whose values came from the web is saved to the user's list (unless it's already there)
  const keep = (it, kind) => {
    const have = inList(it.name);
    if (have) {
      // the same food in another size: remember that size's weight on the saved item
      if (have.id && kind === "food" && it.grams > 0 && it.amount === 1 && !/^(גרם|גר|ג|מ״ל|מל)$/.test(norm(it.unit)) && norm(it.unit) !== norm(have.servingUnit) && !(latest(have).portions || []).some((x) => norm(x.unit) === norm(it.unit)))
        updateOf(have).portions = withSizes(latest(have), [{ unit: it.unit, grams: round1(it.grams) }]);
      return;
    }
    listed.set(foodKey(it.name), { name: it.name });
    const base = { action: "add", id: null, kind, name: it.name, brand: "" };
    const p = it.per100g || per100.get(it);
    if (p) { // the values found online, per 100 g
      library.push({ ...base, servingAmount: 100, servingUnit: "גרם", servingGrams: 100,
        calories: Math.round(num(p.calories)), carbs: round1(num(p.carbs)), protein: round1(num(p.protein)), fat: round1(num(p.fat)), fiber: round1(num(p.fiber)),
        // the size eaten, when it isn't grams, is kept as another size of the food
        ...(it.grams > 0 && it.amount === 1 && !/^(גרם|גר|ג|מ״ל|מל)$/.test(norm(it.unit)) ? { portions: [{ unit: it.unit, grams: round1(it.grams) }] } : {}) });
      return;
    }
    // per 100 g when the weight is known and large enough to scale accurately, otherwise per the amount eaten
    const k = kind === "food" && it.grams >= 20 ? 100 / it.grams : 1;
    const parts = kind === "recipe" ? (components.get(it) || []).map((c) => ({ name: c.name, amount: c.amount, unit: c.unit, grams: c.grams })) : [];
    library.push({
      ...base,
      ...(k !== 1 ? { servingAmount: 100, servingUnit: "גרם", servingGrams: 100 } : { servingAmount: it.amount || 1, servingUnit: it.unit || "מנה", servingGrams: it.grams || null }),
      calories: Math.round(it.calories * k), carbs: round1(it.carbs * k), protein: round1(it.protein * k), fat: round1(it.fat * k), fiber: round1(it.fiber * k),
      ...(parts.length ? { components: parts } : {}),
    });
  };
  // label products are saved from "library" (with their brand and sizes); a logged one is kept only if that was missed
  const photoSaved = (raw.library || []).some((l) => l?.fromPhoto);
  for (const it of [...add, ...update]) {
    if (it.source === "web" || (it.source === "label" && !photoSaved)) keep(it, "food");
    if (it.source === "composed") {
      for (const c of components.get(it) || []) if (c.source === "web") keep(c, "food");
      keep(it, "recipe");
    }
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
  mark("done");
  console.info("[munch] log timing (s):", timing.map(([t, w]) => `${t} ${w}`).join(" · "));
  return { add, update, delete: del, library, exercise, exerciseUpdate, exerciseDelete, portions: newPortions, notes: [str(raw.notes), searchProblem].filter(Boolean).join(" "), seconds: Math.round((Date.now() - t0) / 1000) };
}
