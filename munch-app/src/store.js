import { useEffect, useState } from "react";
import { getDb, getUser } from "./claude.js";

/*
 * All data is one in-memory object, saved to the claude.ai artifact database in the
 * user's private area (data/users/<id>/). A document holds at most 256 KiB, so it's split:
 *   core       settings history, weights and the user's portion sizes
 *   e-YYYY-MM  that month's food entries and exercise
 *   f-N        the food library, in chunks
 * Only documents that changed are written. Outside claude.ai (or signed out) the same
 * object goes to localStorage instead.
 */

export const emptyData = () => ({ settingsHistory: [], weights: [], entries: [], exercises: [], foods: [], portions: [], prefs: {} });

const FOOD_CHUNK = 120_000;
const LOCAL_KEY = "calorie-app-data";

function toDocs(d) {
  const docs = new Map();
  docs.set("core", { v: 1, settingsHistory: d.settingsHistory, weights: d.weights, portions: d.portions || [], prefs: d.prefs || {} });
  const months = new Map();
  const month = (k) => {
    if (!months.has(k)) months.set(k, { entries: [], exercises: [] });
    return months.get(k);
  };
  for (const e of d.entries) month("e-" + e.date.slice(0, 7)).entries.push(e);
  for (const x of d.exercises || []) month("e-" + x.date.slice(0, 7)).exercises.push(x);
  for (const [k, m] of months) docs.set(k, m.exercises.length ? m : { entries: m.entries });
  let chunk = [], size = 0, n = 0;
  for (const f of d.foods) {
    const s = JSON.stringify(f).length * 2;
    if (chunk.length && size + s > FOOD_CHUNK) {
      docs.set("f-" + n++, { foods: chunk });
      chunk = [];
      size = 0;
    }
    chunk.push(f);
    size += s;
  }
  if (chunk.length) docs.set("f-" + n, { foods: chunk });
  return docs;
}

function fromDocs(list) {
  const d = emptyData();
  const foodChunks = [];
  for (const { id, data } of list) {
    if (!data) continue;
    if (id === "core") {
      d.settingsHistory = data.settingsHistory || [];
      d.weights = data.weights || [];
      d.portions = data.portions || [];
      d.prefs = data.prefs || {};
    } else if (id.startsWith("e-")) {
      d.entries.push(...(data.entries || []));
      d.exercises.push(...(data.exercises || []));
    }
    else if (id.startsWith("f-")) foodChunks.push([Number(id.slice(2)), data.foods || []]);
  }
  d.foods = foodChunks.sort((a, b) => a[0] - b[0]).flatMap((c) => c[1]);
  return d;
}

function cloudBackend(col) {
  const stored = new Map();
  return {
    kind: "cloud",
    async read() {
      const snap = await col.limit(1000).get();
      stored.clear();
      const list = snap.docs.map((s) => ({ id: s.id, data: s.data() }));
      for (const { id, data } of list) if (data) stored.set(id, JSON.stringify(data));
      return fromDocs(list);
    },
    async write(d) {
      const docs = toDocs(d);
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

const localBackend = {
  kind: "local",
  async read() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? { ...emptyData(), ...JSON.parse(raw) } : emptyData();
    } catch {
      return emptyData();
    }
  },
  async write(d) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
    } catch {
      /* storage unavailable: data lives only for this visit */
    }
  },
};

async function pickBackend() {
  const [db, user] = await Promise.all([getDb(), getUser()]);
  const uid = user ? await user.id().catch(() => null) : null;
  if (db && uid) return cloudBackend(db.collection("data/users/" + uid));
  return localBackend;
}

/* ---------- the store ---------- */

let backend = null;
let state = { status: "loading", data: emptyData(), kind: null, error: null, saving: false };
const listeners = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
};

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export async function init() {
  try {
    backend = await pickBackend();
    const data = await withTimeout(backend.read(), 15000);
    set({ status: "ready", data, kind: backend.kind, error: null });
  } catch (e) {
    set({ status: "error", error: "לא הצלחנו לטעון את הנתונים. בדקו את החיבור לאינטרנט ונסו לרענן." });
  }
}

/** Re-read when the app comes back to the foreground, so phone and computer stay in sync. */
let lastHidden = 0;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      lastHidden = Date.now();
      return;
    }
    if (!backend || backend.kind !== "cloud" || state.saving || Date.now() - lastHidden < 30000) return;
    try {
      const data = await backend.read();
      if (!state.saving) set({ data });
    } catch {
      /* keep what we have */
    }
  });
}

let queue = Promise.resolve();
/** Apply fn to a copy of the data, show it right away, and save it. */
export function mutate(fn) {
  const next = structuredClone(state.data);
  const result = fn(next);
  set({ data: next, saving: true });
  const p = queue.then(async () => {
    try {
      await backend.write(next);
    } catch (e) {
      const code = e && e.code;
      throw new Error(
        code === "quota_exceeded" ? "נגמר המקום לשמירה. מחקו מזונות שאינכם צריכים ונסו שוב." : "השמירה נכשלה. בדקו את החיבור ונסו שוב.",
      );
    } finally {
      set({ saving: false });
    }
  });
  queue = p.catch(() => {});
  return p.then(() => result);
}

export function useStore() {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => listeners.delete(setS);
  }, []);
  return s;
}

export const getData = () => state.data;

export const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
