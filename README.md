# Munch (מאנץ׳)

A personal calorie tracker, in Hebrew. You log food in free text, and Claude turns it into a list of foods with amounts and nutrition values.

It's a static web app hosted on GitHub Pages. There is no server: your data is stored in your browser (IndexedDB), and food parsing calls the Claude API directly from the browser with your own API key.

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

The app sends your text to Claude (`claude-opus-5-5`) with three tools:

- `search_my_foods`: searches your imported Lose It foods and recipes with Hebrew-aware fuzzy matching. This runs in the browser.
- `web_search`: looks up nutrition values online, preferring Israeli sources for Israeli products.
- `submit_food_log`: returns the final list in a strict schema.

Sources are used in this order: values you wrote in the text, then your own list, then the web. Very generic foods (an egg, an apple) may use standard reference values. Every item shows where its numbers came from, and you can edit anything before saving. Changing an amount rescales the nutrients.

## Lose It import

Settings → ייבוא מ-Lose It → pick the type (custom foods or recipes) → choose the CSV.

The app guesses which column is which from the headers, and you can change any of them before importing. A preview shows the result. If a recipe CSV has one row per ingredient, choose the "recipe name" column: the ingredients are added up and divided by the servings column. Re-importing replaces the previous import of the same type.

## Your data and API key

- Everything is saved in the browser you use the app in. It doesn't sync between devices.
- Settings → גיבוי downloads a backup file and restores from one. Use it regularly, and to move your data to another device.
- The Claude API key is entered in Settings and stored only in that browser. It's never in the repository and never in backups. Set a monthly spending limit on the key in the Claude Console.

## Deploying (GitHub Pages)

`.github/workflows/deploy.yml` builds the app and publishes it on every push to `main`. One-time setup:

1. The repository must be public, or your GitHub plan must allow Pages for private repositories (GitHub Pro or higher).
2. Repository Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Push or merge to `main`. The app is then at `https://<user>.github.io/<repo>/`.

On a phone, open that URL and use "Add to Home Screen". It then opens full-screen like an app.

## Local development

```bash
npm install
npm run dev
```
