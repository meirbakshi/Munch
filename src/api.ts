import type { AppState, Entry, Food, NewEntry, ParseResult, Profile } from "../shared/types.ts";

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `שגיאה (${res.status})`);
  return data as T;
}

export const api = {
  state: () => req<AppState>("GET", "/api/state"),
  saveProfile: (p: Profile) => req<Profile>("PUT", "/api/profile", p),
  logWeight: (date: string, kg: number) => req("POST", "/api/weights", { date, kg }),
  deleteWeight: (date: string) => req("DELETE", `/api/weights/${date}`),

  foods: () => req<Food[]>("GET", "/api/foods"),
  importFoods: (foods: Omit<Food, "id">[], replaceSource?: Food["source"]) =>
    req<{ imported: number; total: number }>("POST", "/api/foods/import", { foods, replaceSource }),
  deleteFood: (id: string) => req("DELETE", `/api/foods/${id}`),

  entries: (from: string, to: string) => req<Entry[]>("GET", `/api/entries?from=${from}&to=${to}`),
  addEntries: (entries: NewEntry[]) => req<Entry[]>("POST", "/api/entries", { entries }),
  updateEntry: (id: string, patch: Partial<Entry>) => req<Entry>("PUT", `/api/entries/${id}`, patch),
  deleteEntry: (id: string) => req("DELETE", `/api/entries/${id}`),

  parse: (text: string) => req<ParseResult>("POST", "/api/parse", { text }),
};
