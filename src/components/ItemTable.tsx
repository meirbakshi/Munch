import type { EntrySource, Meal, Nutrients } from "../../shared/types.ts";
import { scale } from "../lib/nutrition.ts";
import { MEALS, SOURCE_LABEL } from "../labels.ts";

export interface EditableItem extends Nutrients {
  name: string;
  amount: number;
  unit: string;
  meal: Meal | null;
  source: EntrySource;
  sourceNote?: string;
  /** Reference point for scaling when the amount changes. */
  baseAmount: number;
  base: Nutrients;
}

export function toEditable<T extends Nutrients & { amount: number }>(x: T): T & { baseAmount: number; base: Nutrients } {
  return {
    ...x,
    baseAmount: x.amount || 1,
    base: { calories: x.calories, carbs: x.carbs, protein: x.protein, fat: x.fat, fiber: x.fiber },
  };
}

const NUT_COLS: { key: keyof Nutrients; label: string }[] = [
  { key: "calories", label: "קק״ל" },
  { key: "carbs", label: "פחמ׳" },
  { key: "protein", label: "חלבון" },
  { key: "fat", label: "שומן" },
  { key: "fiber", label: "סיבים" },
];

export function updateItem(it: EditableItem, patch: Partial<EditableItem>): EditableItem {
  if (patch.amount !== undefined && patch.amount !== it.amount) {
    const amount = patch.amount;
    return { ...it, ...patch, ...(amount > 0 ? scale(it.base, amount / it.baseAmount) : {}) };
  }
  const next = { ...it, ...patch };
  if (NUT_COLS.some((c) => patch[c.key] !== undefined)) {
    next.baseAmount = next.amount || 1;
    next.base = { calories: next.calories, carbs: next.carbs, protein: next.protein, fat: next.fat, fiber: next.fiber };
    if (next.source !== "manual" && next.source !== "user") next.sourceNote = `${next.sourceNote ?? ""} (נערך ידנית)`.trim();
  }
  return next;
}

export function ItemTable({
  items,
  onChange,
  onRemove,
}: {
  items: EditableItem[];
  onChange: (i: number, item: EditableItem) => void;
  onRemove: (i: number) => void;
}) {
  const numInput = (i: number, it: EditableItem, key: keyof Nutrients | "amount") => (
    <input
      className="n num"
      type="number"
      min={0}
      step="any"
      value={Number.isFinite(it[key]) ? it[key] : ""}
      onChange={(e) => onChange(i, updateItem(it, { [key]: e.target.value === "" ? 0 : Number(e.target.value) }))}
    />
  );
  return (
    <div className="table-wrap">
      <table className="items">
        <thead>
          <tr>
            <th>מזון</th>
            <th>כמות</th>
            <th>יחידה</th>
            {NUT_COLS.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            <th>ארוחה</th>
            <th>מקור</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>
                <input className="name" type="text" value={it.name} onChange={(e) => onChange(i, { ...it, name: e.target.value })} />
              </td>
              <td>{numInput(i, it, "amount")}</td>
              <td>
                <input className="unit" type="text" value={it.unit} onChange={(e) => onChange(i, { ...it, unit: e.target.value })} />
              </td>
              {NUT_COLS.map((c) => (
                <td key={c.key}>{numInput(i, it, c.key)}</td>
              ))}
              <td>
                <select value={it.meal ?? ""} onChange={(e) => onChange(i, { ...it, meal: (e.target.value || null) as Meal | null })}>
                  <option value="">—</option>
                  {MEALS.map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </td>
              <td title={it.sourceNote}>
                <span className={`badge ${it.source}`}>{SOURCE_LABEL[it.source]}</span>
                {it.sourceNote && <div className="muted small" style={{ maxWidth: 220 }}>{it.sourceNote}</div>}
              </td>
              <td>
                <button className="btn ghost icon danger" title="הסרה" onClick={() => onRemove(i)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
