# מאנץ׳ (claude.ai artifact)

A personal calorie tracker in Hebrew, built for iPhone. It runs as a private claude.ai artifact:
https://claude.ai/artifact/GuTLzuxYGA2xcpsfDyUEt8

This folder is the source. The published page is one HTML file built from it.

## Build

```bash
npm install
npm run build   # writes out/calorie-app.html
```

`out/calorie-app.html` is what gets published to the artifact, with the same URL so the link stays the same. It has no `<html>`, `<head>` or `<body>` tags; claude.ai adds them. The artifact declares these capabilities: `db`, `user`, `sample`, `downloads`, and `mcp` with the Parallel Search connector's `web_search` tool.

## How it works

- **Data** (`src/store.js`) lives in the artifact database, in the user's private area `data/users/<id>/`:
  - `core`: settings history, weights, portion sizes;
  - `e-YYYY-MM`: that month's food entries and exercise;
  - `f-N`: the food and recipe library, in chunks under 256 KiB.
- **Calculations** (`src/calc.js`):
  - Mifflin–St Jeor BMR × activity factor, minus the weekly loss target (7,700 kcal per kg).
  - Weeks run Sunday to Saturday. High days get +X%, and the week's total stays the same.
  - 7-day balancing: each logged day's (target − net intake) is spread evenly over the next 7 days. Net intake is food minus exercise.
  - No day's target goes below the minimum.
- **Free-text logging** (`src/ai.js`) runs Claude through the artifact `sample` capability, with two page tools:
  - a search of the user's own library;
  - web search via the Parallel Search connector.

  The same prompt also handles exercise, portion-size definitions, and adjustments to a draft under review.
- **Pages**: `src/pages/Daily.jsx`, `History.jsx`, `Settings.jsx`.

## Backups

`backups/before-design-pass.html` is the page as published before the Apple design pass (artifact version 5). To go back, publish that file to the same artifact URL. User data is not affected.
