import type { Entry, Food, Profile, WeightLog } from "../../shared/types.ts";
import { getDb, getUser, inClaude, type CollectionRef } from "./claude.ts";

/**
 * All app data is one JSON document, loaded whole (a few MB after years of logging).
 *
 * Where it's kept depends on where the app runs:
 * - "cloud": published as a claude.ai artifact, it lives in the artifact's database,
 *   in the viewer's private area (`data/users/<id>/`), so it follows you between devices.
 * - "local": anywhere else (or when the claude.ai database isn't available), in this
 *   browser's IndexedDB.
 */
export interface DB {
  version: 1;
  profile: Profile | null;
  foods: Food[];
  entries: Entry[];
  weights: WeightLog[];
  apiKey: string;
}

export type StorageKind = "cloud" | "local";

function empty(): DB {
  return { version: 1, profile: null, foods: [], entries: [], weights: [], apiKey: "" };
}

interface Backend {
  kind: StorageKind;
  read(): Promise<Partial<DB>>;
  write(db: DB): Promise<void>;
}

/* ---------- IndexedDB (local) ---------- */

const DB_NAME = "munch";
const STORE = "kv";
const KEY = "db";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openIdb().then(
    (idb) =>
      new Promise<T>((resolve, reject) => {
        const t = idb.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => {
          idb.close();
          resolve(req.result as T);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const localBackend: Backend = {
  kind: "local",
  read: () => tx<DB | undefined>("readonly", (s) => s.get(KEY)).then((d) => d ?? {}),
  write: (db) => tx("readwrite", (s) => s.put(db, KEY)),
};

/* ---------- claude.ai artifact database (cloud) ---------- */

/*
 * A database document holds at most 256 KiB, so the data is split:
 * - "core": profile and weights;
 * - "e-YYYY-MM": one document per month of food entries;
 * - "f-N": the food library, in chunks.
 * Only documents whose content changed are written.
 */
const FOOD_CHUNK_BYTES = 150_000;
const CORE = "core";

function toDocs(db: DB): Map<string, Record<string, unknown>> {
  const docs = new Map<string, Record<string, unknown>>();
  docs.set(CORE, { version: 1, profile: db.profile, weights: db.weights });

  const months = new Map<string, Entry[]>();
  for (const e of db.entries) {
    const k = `e-${e.date.slice(0, 7)}`;
    const list = months.get(k) ?? [];
    list.push(e);
    months.set(k, list);
  }
  for (const [k, entries] of months) docs.set(k, { entries });

  let chunk: Food[] = [];
  let size = 0;
  let n = 0;
  for (const f of db.foods) {
    const s = JSON.stringify(f).length * 2; // Hebrew is 2 bytes per char in UTF-8
    if (chunk.length && size + s > FOOD_CHUNK_BYTES) {
      docs.set(`f-${n++}`, { foods: chunk });
      chunk = [];
      size = 0;
    }
    chunk.push(f);
    size += s;
  }
  if (chunk.length) docs.set(`f-${n}`, { foods: chunk });
  return docs;
}

function cloudBackend(col: CollectionRef): Backend {
  /** What's stored now, per document id, as JSON. */
  const stored = new Map<string, string>();
  return {
    kind: "cloud",
    async read() {
      const snap = await col.limit(1000).get();
      const db: Partial<DB> = { entries: [], foods: [] };
      const foodChunks: [number, Food[]][] = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (!data) continue;
        stored.set(d.id, JSON.stringify(data));
        if (d.id === CORE) {
          db.profile = (data.profile as Profile | null) ?? null;
          db.weights = (data.weights as WeightLog[]) ?? [];
        } else if (d.id.startsWith("e-")) {
          db.entries!.push(...((data.entries as Entry[]) ?? []));
        } else if (d.id.startsWith("f-")) {
          foodChunks.push([Number(d.id.slice(2)), (data.foods as Food[]) ?? []]);
        }
      }
      db.foods = foodChunks.sort((a, b) => a[0] - b[0]).flatMap(([, f]) => f);
      return db;
    },
    async write(db) {
      const docs = toDocs(db);
      for (const [id, data] of docs) {
        const json = JSON.stringify(data);
        if (stored.get(id) === json) continue;
        await col.doc(id).set(data);
        stored.set(id, json);
      }
      for (const id of [...stored.keys()]) {
        if (docs.has(id)) continue;
        await col.doc(id).delete();
        stored.delete(id);
      }
    },
  };
}

/* ---------- choosing a backend ---------- */

let backendP: Promise<Backend> | null = null;
function backend(): Promise<Backend> {
  backendP ??= (async () => {
    if (!inClaude()) return localBackend;
    const [db, user] = await Promise.all([getDb(), getUser()]);
    const uid = await user?.id().catch(() => null);
    if (!db || !uid) return localBackend;
    return cloudBackend(db.collection(`data/users/${uid}`));
  })();
  return backendP;
}

export const storageKind = async (): Promise<StorageKind> => (await backend()).kind;

let cache: Promise<DB> | null = null;

export function load(): Promise<DB> {
  cache ??= backend()
    .then((b) => b.read())
    .then((d) => ({ ...empty(), ...d }));
  cache.catch(() => (cache = null));
  return cache;
}

function friendly(e: unknown): Error {
  const code = (e as { code?: string })?.code;
  if (code === "quota_exceeded") return new Error("נגמר המקום במאגר הנתונים. מחקו פריטים ישנים ונסו שוב.");
  if (code === "resource_exhausted") return new Error("יותר מדי שמירות ברצף. נסו שוב בעוד רגע.");
  if (code) return new Error(`השמירה נכשלה (${code}). נסו שוב.`);
  return e instanceof Error ? e : new Error(String(e));
}

/** Applies `fn` to the database and writes it back. Writes are serialised. */
let queue: Promise<unknown> = Promise.resolve();
export function mutate<T>(fn: (db: DB) => T): Promise<T> {
  const next = queue.then(async () => {
    const db = await load();
    const result = fn(db);
    try {
      await (await backend()).write(db);
    } catch (e) {
      cache = null; // reload what's really stored next time
      throw friendly(e);
    }
    return result;
  });
  queue = next.catch(() => {});
  return next;
}

/** Replaces everything (used by backup restore). */
export async function replaceAll(data: Partial<DB>): Promise<void> {
  await mutate((db) => {
    const fresh = { ...empty(), ...data, apiKey: data.apiKey ?? db.apiKey };
    Object.assign(db, fresh);
  });
}

/** Ask the browser not to evict our storage when space runs low (local storage only). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export const newId = () =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
