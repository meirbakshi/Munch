import type { Entry, Food, Profile, WeightLog } from "../../shared/types.ts";

/**
 * All app data lives in the browser, in IndexedDB, as one JSON document.
 * It's small (a few MB after years of logging), so loading it whole keeps things simple.
 */
export interface DB {
  version: 1;
  profile: Profile | null;
  foods: Food[];
  entries: Entry[];
  weights: WeightLog[];
  apiKey: string;
}

const DB_NAME = "munch";
const STORE = "kv";
const KEY = "db";

function empty(): DB {
  return { version: 1, profile: null, foods: [], entries: [], weights: [], apiKey: "" };
}

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

let cache: Promise<DB> | null = null;

export function load(): Promise<DB> {
  cache ??= tx<DB | undefined>("readonly", (s) => s.get(KEY)).then((d) => ({ ...empty(), ...(d ?? {}) }));
  return cache;
}

/** Applies `fn` to the database and writes it back. Writes are serialised. */
let queue: Promise<unknown> = Promise.resolve();
export function mutate<T>(fn: (db: DB) => T): Promise<T> {
  const next = queue.then(async () => {
    const db = await load();
    const result = fn(db);
    await tx("readwrite", (s) => s.put(db, KEY));
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

/** Ask the browser not to evict our storage when space runs low. */
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
