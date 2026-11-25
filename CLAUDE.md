# יומן השומן (Munch)

The owner's personal Hebrew calorie tracker for their iPhone 17 Pro. Reply to the owner in the language they write in (usually Hebrew).

## Where things are
- **The live app** is a private claude.ai artifact: https://claude.ai/artifact/GuTLzuxYGA2xcpsfDyUEt8. Always update this same artifact; never publish a new one.
- **Source:** `munch-app/` (React + Vite). The rest of the repo root is an older version; don't work on it unless asked.
- **The owner's data** lives in that artifact's database, private area `data/users/me` (read and write it with the ArtifactData tool):
  - `core`: settings history, weights, portions, prefs, insights;
  - `e-YYYY-MM`: entries and exercise;
  - `f-N`: the food list, in chunks. Each item has one serving (`servingAmount`, `servingUnit`, `servingGrams`) with its nutrition, plus optional `aliases` (other names it's found by), `portions` (other sizes: `[{unit, grams}]`) and, for recipes, `components` (`[{name, amount, unit, grams}]`).
- Never change the data format without migrating it, and never delete the owner's data.

## Working on the app
1. Before any visual change, read `.claude/skills/munch-design/SKILL.md` (Apple HIG for this app).
2. Build: `cd munch-app && npm install && npm run build`. This writes `munch-app/out/calorie-app.html`.
3. Test with Playwright against the built file, with a mock `window.claude` (`db`, `user`, `sample`, `mcp`, `permissions`) seeded with realistic data. Check light and dark mode at 402×874.
4. Publish: Artifact publish with `file_path` = `munch-app/out/calorie-app.html` and `url` = the artifact URL above. Omit `capabilities` so the stored ones carry over: db, user, sample (with `images: true`), downloads, mcp (Parallel Search: `web_search`). If they ever must be restated, restate all of them: `{db:{}, user:{}, sample:{images:true}, downloads:true, mcp:{servers:[{server:"Parallel Search", tools:["web_search"]}]}}`.
5. Git: work on a branch, open a PR to `main`, and squash-merge it. The owner asked for every change to go through a PR.

## How the app behaves (owner's decisions)
- Four tabs: יומן, התקדמות, תובנות, הגדרות. The tab bar must always be visible; `src/frame.js` keeps the shell inside the visible part of the frame.
- Logging (`src/ai.js`) uses Claude through `sample`, with two page tools: `search_my_foods` and `web_search`. Values are taken in this order:
  1. the owner's saved foods;
  2. the whole dish online;
  3. the dish built from its components, each looked up the same way;
  4. "ערך מקובל" (standard values), only as a last resort.
- Review labels:
  - "מהרשימה שלך": from the saved list, however the food got there.
  - "מהרשת": found online during this log.
  - "נוסף לרשימה": shown with "מהרשת" when that item was added to the list.
  - "מחושב מרכיבים": a dish built from components; saved as a recipe.
  - "מהתווית": read from an attached photo of the nutrition label.
  - "ערך מקובל": rare.
- Photos: the camera button in the composer attaches up to the allowed number of photos of nutrition labels (re-encoded to JPEG, at most 2000 px). Claude reads each product (name, brand, values per 100 g, package sizes) and saves it to the list (source `label`, "מתווית"; an existing product is updated). It's logged, labeled "מהתווית", only when the text says it was eaten; photos with no text just save the products.
- Before calling Claude, the app looks the message up in the list (`prefetchFoods`) and sends the matches with the request, so foods in the list need no lookup round. `web_search` answers a food that's in the list with its list item instead of searching.
- Web results and composed dishes are saved to the food list automatically (by the app, from the logged items; Claude's own "library" output is only for values the owner gave, their recipes, corrections, and new aliases or sizes). The list holds about 1,100 foods, including Israeli basics and brands; the owner is vegetarian.
- Insights refresh in the background after every weigh-in, and on "רענון".
- The weekly loss pace is capped at the daily calorie minimum, with an explanation shown to the owner.
- The free tier of the Parallel Search connector has a rate limit. When it's reached, online searches fail.
