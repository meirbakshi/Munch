import type { AppState, Entry, Food, NewEntry, ParseResult, Profile } from "../shared/types.ts";
import { load, mutate, newId, replaceAll, type DB } from "./lib/localdb.ts";
import { parseFoodText } from "./lib/parse.ts";

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const foodKey = (f: Omit<Food, "id">) => `${f.source}|${f.name.trim()}|${f.brand ?? ""}`;

/** Data access. Everything is stored on this device (IndexedDB); there is no server. */
export const api = {
  async state(): Promise<AppState> {
    const db = await load();
    return {
      profile: db.profile,
      weights: [...db.weights].sort((a, b) => a.date.localeCompare(b.date)),
      foodsCount: db.foods.length,
      aiEnabled: Boolean(db.apiKey),
    };
  },

  saveProfile: (p: Profile) => mutate((db) => (db.profile = p)),

  async logWeight(date: string, kg: number) {
    if (!isDate(date) || !(kg > 0)) throw new Error("משקל לא תקין");
    await mutate((db) => {
      db.weights = [...db.weights.filter((w) => w.date !== date), { date, kg }];
    });
  },

  deleteWeight: (date: string) => mutate((db) => void (db.weights = db.weights.filter((w) => w.date !== date))),

  foods: async (): Promise<Food[]> => [...(await load()).foods],

  importFoods: (foods: Omit<Food, "id">[], replaceSource?: Food["source"]) =>
    mutate((db) => {
      if (replaceSource) db.foods = db.foods.filter((f) => f.source !== replaceSource);
      // De-duplicate by name + brand + source: the newer import wins.
      const incoming = new Map(foods.map((f) => [foodKey(f), f]));
      db.foods = db.foods.filter((f) => !incoming.has(foodKey(f)));
      for (const f of incoming.values()) db.foods.push({ ...f, id: newId() });
      return { imported: incoming.size, total: db.foods.length };
    }),

  deleteFood: (id: string) => mutate((db) => void (db.foods = db.foods.filter((f) => f.id !== id))),

  async entries(from: string, to: string): Promise<Entry[]> {
    return (await load()).entries
      .filter((e) => e.date >= from && e.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  },

  addEntries: (entries: NewEntry[]) =>
    mutate((db) => {
      const now = new Date().toISOString();
      const created: Entry[] = entries.map((e) => ({ ...e, id: newId(), createdAt: now }));
      db.entries.push(...created);
      return created;
    }),

  updateEntry: (id: string, patch: Partial<Entry>) =>
    mutate((db) => {
      const i = db.entries.findIndex((e) => e.id === id);
      if (i < 0) throw new Error("הפריט לא נמצא");
      db.entries[i] = { ...db.entries[i], ...patch, id };
      return db.entries[i];
    }),

  deleteEntry: (id: string) => mutate((db) => void (db.entries = db.entries.filter((e) => e.id !== id))),

  async parse(text: string): Promise<ParseResult> {
    const db = await load();
    if (!text.trim()) throw new Error("נא לכתוב מה אכלת");
    if (!db.apiKey) throw new Error("כדי לנתח טקסט חופשי צריך להזין מפתח Claude API בהגדרות.");
    return parseFoodText(text.trim(), db.foods, db.apiKey);
  },

  apiKey: async () => (await load()).apiKey,
  setApiKey: (key: string) => mutate((db) => void (db.apiKey = key.trim())),

  /** Backup file: everything except the API key. */
  async exportBackup(): Promise<string> {
    const { apiKey: _omit, ...rest } = await load();
    return JSON.stringify({ app: "munch", exportedAt: new Date().toISOString(), ...rest }, null, 1);
  },

  async importBackup(json: string): Promise<void> {
    const data = JSON.parse(json) as Partial<DB> & { app?: string };
    if (data.app !== "munch" || !Array.isArray(data.entries)) throw new Error("זה לא קובץ גיבוי של מאנץ׳");
    await replaceAll({
      profile: data.profile ?? null,
      foods: data.foods ?? [],
      entries: data.entries,
      weights: data.weights ?? [],
    });
  },
};
