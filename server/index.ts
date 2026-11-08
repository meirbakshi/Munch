import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { load, save, newId } from "./db.ts";
import { aiEnabled, parseFoodText, ParseError } from "./parse.ts";
import type { AppState, Entry, Food, NewEntry, Profile, WeightLog } from "../shared/types.ts";

try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env file */
}

const app = express();
app.use(express.json({ limit: "20mb" }));

// Optional password protection (HTTP basic auth, any username).
const PASSWORD = process.env.APP_PASSWORD;
if (PASSWORD) {
  app.use((req, res, next) => {
    const header = req.headers.authorization ?? "";
    const [, b64] = header.split(" ");
    const pass = b64 ? Buffer.from(b64, "base64").toString().split(":").slice(1).join(":") : "";
    if (pass === PASSWORD) return next();
    res.set("WWW-Authenticate", 'Basic realm="Munch"').status(401).send("Authentication required");
  });
}

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

app.get("/api/state", (_req, res) => {
  const db = load();
  const state: AppState = {
    profile: db.profile,
    weights: [...db.weights].sort((a, b) => a.date.localeCompare(b.date)),
    foodsCount: db.foods.length,
    aiEnabled: aiEnabled(),
  };
  res.json(state);
});

app.put("/api/profile", (req, res) => {
  const db = load();
  db.profile = req.body as Profile;
  save();
  res.json(db.profile);
});

app.post("/api/weights", (req, res) => {
  const { date, kg } = req.body as WeightLog;
  if (!isDate(date) || !(kg > 0)) return res.status(400).json({ error: "bad weight" });
  const db = load();
  db.weights = db.weights.filter((w) => w.date !== date);
  db.weights.push({ date, kg });
  save();
  res.json({ ok: true });
});

app.delete("/api/weights/:date", (req, res) => {
  const db = load();
  db.weights = db.weights.filter((w) => w.date !== req.params.date);
  save();
  res.json({ ok: true });
});

// ---- Personal food library ----
app.get("/api/foods", (_req, res) => {
  res.json(load().foods);
});

app.post("/api/foods/import", (req, res) => {
  const { foods, replaceSource } = req.body as { foods: Omit<Food, "id">[]; replaceSource?: Food["source"] };
  const db = load();
  if (replaceSource) db.foods = db.foods.filter((f) => f.source !== replaceSource);
  // De-duplicate by name+brand+source: newer import wins.
  const key = (f: Omit<Food, "id">) => `${f.source}|${f.name.trim()}|${f.brand ?? ""}`;
  const incoming = new Map(foods.map((f) => [key(f), f]));
  db.foods = db.foods.filter((f) => !incoming.has(key(f)));
  for (const f of incoming.values()) db.foods.push({ ...f, id: newId() });
  save();
  res.json({ imported: incoming.size, total: db.foods.length });
});

app.post("/api/foods", (req, res) => {
  const db = load();
  const food: Food = { ...(req.body as Omit<Food, "id">), id: newId() };
  db.foods.push(food);
  save();
  res.json(food);
});

app.delete("/api/foods/:id", (req, res) => {
  const db = load();
  db.foods = db.foods.filter((f) => f.id !== req.params.id);
  save();
  res.json({ ok: true });
});

app.delete("/api/foods", (req, res) => {
  const db = load();
  const source = req.query.source;
  db.foods = typeof source === "string" ? db.foods.filter((f) => f.source !== source) : [];
  save();
  res.json({ ok: true });
});

// ---- Diary entries ----
app.get("/api/entries", (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "from/to required" });
  const entries = load()
    .entries.filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  res.json(entries);
});

app.post("/api/entries", (req, res) => {
  const { entries } = req.body as { entries: NewEntry[] };
  const db = load();
  const now = new Date().toISOString();
  const created: Entry[] = entries.map((e) => ({ ...e, id: newId(), createdAt: now }));
  if (created.some((e) => !isDate(e.date))) return res.status(400).json({ error: "bad date" });
  db.entries.push(...created);
  save();
  res.json(created);
});

app.put("/api/entries/:id", (req, res) => {
  const db = load();
  const i = db.entries.findIndex((e) => e.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "not found" });
  db.entries[i] = { ...db.entries[i], ...(req.body as Partial<Entry>), id: db.entries[i].id };
  save();
  res.json(db.entries[i]);
});

app.delete("/api/entries/:id", (req, res) => {
  const db = load();
  db.entries = db.entries.filter((e) => e.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---- Free-text parsing ----
app.post("/api/parse", async (req, res) => {
  const text = String((req.body as { text?: string }).text ?? "").trim();
  if (!text) return res.status(400).json({ error: "נא לכתוב מה אכלת" });
  if (!aiEnabled()) return res.status(503).json({ error: "לא הוגדר מפתח ANTHROPIC_API_KEY בשרת" });
  try {
    res.json(await parseFoodText(text, load().foods));
  } catch (err) {
    if (err instanceof ParseError) return res.status(422).json({ error: err.message });
    if (err instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: "מפתח ה-API שגוי" });
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "יותר מדי בקשות, נסו שוב בעוד רגע" });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `שגיאה בשירות הניתוח (${err.status})` });
    console.error(err);
    res.status(500).json({ error: "שגיאה בניתוח הטקסט" });
  }
});

// ---- Static client (production) ----
const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "שגיאת שרת" });
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`Munch server on http://localhost:${PORT}`));
