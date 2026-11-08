import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Entry, Food, Profile, WeightLog } from "../shared/types.ts";

export interface DB {
  profile: Profile | null;
  foods: Food[];
  entries: Entry[];
  weights: WeightLog[];
}

const DATA_FILE = path.resolve(process.env.DATA_FILE || "data/db.json");

function empty(): DB {
  return { profile: null, foods: [], entries: [], weights: [] };
}

let cache: DB | null = null;

export function load(): DB {
  if (cache) return cache;
  try {
    cache = { ...empty(), ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) } as DB;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    cache = empty();
  }
  return cache;
}

/** Atomic write: write to a temp file, then rename over the real one. */
export function save(): void {
  const db = load();
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}

export function newId(): string {
  return crypto.randomUUID();
}
