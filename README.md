# Munch (מאנץ׳)

A personal calorie tracker, in Hebrew. You log food in free text, and Claude turns it into a list of foods with amounts and nutrition values.

## Pages

- **יומן (Daily log)**: opens on today. You can move back to earlier dates but not forward past today. It shows:
  - calories eaten, today's target and what's left;
  - this week's budget, day by day;
  - carbs, protein, fat and fiber, in grams and as a % of the day's calories.

  You write what you ate in Hebrew, check and edit the parsed list, then save it.
- **היסטוריה (History & progress)**:
  - daily calories against the target;
  - weight trend and weight logging;
  - average macro split;
  - weekly summaries;
  - a list of logged days (click one to open it).
- **הגדרות (Settings)**:
  - profile and goal: current and target weight, target date, and the weekdays when you eat more;
  - the calculated daily allowance;
  - CSV import of custom foods and recipes from Lose It, plus the library that results.

## How the daily target is calculated

1. **Average daily allowance.** BMR (Mifflin–St Jeor) × activity factor gives TDEE. The allowance is TDEE minus `(current − target kg) × 7,700 kcal / days left`. The deficit is capped at 1,000 kcal/day, and the allowance never goes below the minimum you set.
2. **Weekly budget.** The allowance × 7 is split across the week. "High" days get a bigger share, +20% by default, and the weekly total stays the same.
3. **Weekly balancing.** Each day's target is its share of what's left in the week's budget after the previous days:
   - If you go over today, the rest of the week shrinks right away. Today's own target doesn't move.
   - A past day with nothing logged counts as on-plan.
   - Eating under the plan isn't banked, so a day's target never goes above its original plan.
   - Targets never go below the minimum.

## How free-text logging works

`POST /api/parse` sends the text to Claude (`claude-opus-5-5`) with three tools:

- `search_my_foods`: searches your imported Lose It foods and recipes with Hebrew-aware fuzzy matching.
- `web_search`: looks up nutrition values online, preferring Israeli sources for Israeli products.
- `submit_food_log`: returns the final list in a strict schema.

Sources are used in this order: values you wrote in the text, then your own list, then the web. Very generic foods (an egg, an apple) may use standard reference values. Every item shows where its numbers came from, and you can edit anything before saving. Changing an amount rescales the nutrients.

## Lose It import

Settings → ייבוא מ-Lose It → pick the type (custom foods or recipes) → choose the CSV.

The app guesses which column is which from the headers, and you can change any of them before importing. A preview shows the result. If a recipe CSV has one row per ingredient, choose the "recipe name" column: the ingredients are added up and divided by the servings column. Re-importing replaces the previous import of the same type.

## Running

```bash
npm install
cp .env.example .env    # set ANTHROPIC_API_KEY (and optionally APP_PASSWORD)
npm run dev             # http://localhost:5173 (API on :3001)
```

Production:

```bash
npm run build
npm start               # serves the app and API on $PORT (default 3001)
```

Data is stored in a single JSON file, `data/db.json` by default (`DATA_FILE` changes it). Back it up or mount it on a persistent volume when you deploy. If you set `APP_PASSWORD`, the whole app is behind HTTP basic auth (any username).

Without an API key, the app still works. Free-text parsing is turned off, and you can add items by hand.
