import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Entry, Meal, NewEntry, Nutrients, Profile } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useStore } from "../store.tsx";
import { addDays, DAY_SHORT, formatLong, formatShort, todayISO, weekStart } from "../lib/dates.ts";
import { weekPlan, type WeekPlan } from "../lib/budget.ts";
import { fmt, macroPercents, MACROS, sum } from "../lib/nutrition.ts";
import { MEALS, mealByTime, SOURCE_LABEL } from "../labels.ts";
import { ItemTable, toEditable, type EditableItem } from "../components/ItemTable.tsx";

const isISO = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default function Daily() {
  const { state } = useStore();
  const profile = state!.profile!;
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const raw = params.get("date");
  const date = isISO(raw) && raw <= today ? raw : today;
  const setDate = (d: string) => setParams(d >= today ? {} : { date: d });

  const [weekEntries, setWeekEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const start = weekStart(date, profile.weekStartsOn);
  const end = addDays(start, 6);
  const load = useCallback(async () => {
    try {
      setWeekEntries(await api.entries(start, end));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [start, end]);
  useEffect(() => {
    void load();
  }, [load]);

  const dayEntries = weekEntries.filter((e) => e.date === date);
  const totals = sum(dayEntries);
  const plan = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const e of weekEntries) byDate[e.date] = (byDate[e.date] ?? 0) + e.calories;
    return weekPlan(profile, date, byDate, today);
  }, [weekEntries, profile, date, today]);
  const planDay = plan.days.find((d) => d.date === date)!;

  return (
    <main>
      <div className="datebar">
        <button className="btn ghost" onClick={() => setDate(addDays(date, -1))} aria-label="יום קודם">→ אתמול</button>
        <div className="date-title">
          <h1 className="serif">{date === today ? "היום" : formatLong(date)}</h1>
          <div className="row" style={{ justifyContent: "center" }}>
            {date === today && <span className="sub">{formatLong(date)}</span>}
            <input type="date" value={date} max={today} onChange={(e) => isISO(e.target.value) && setDate(e.target.value)} aria-label="בחירת תאריך" />
            {date !== today && <button className="btn ghost small" onClick={() => setDate(today)}>חזרה להיום</button>}
          </div>
        </div>
        <button className="btn ghost" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} aria-label="יום הבא">מחר ←</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <SummaryCard totals={totals} target={planDay.target} planned={planDay.planned} plan={plan} date={date} profile={profile} />
      <MacroCards totals={totals} />
      <LogComposer date={date} aiEnabled={state!.aiEnabled} onAdded={load} />
      <EntryList entries={dayEntries} loading={loading} onChanged={load} />
    </main>
  );
}

function Ring({ value, max }: { value: number; max: number }) {
  const r = 82;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? value / max : 0;
  const over = frac > 1;
  return (
    <svg width="190" height="190" viewBox="0 0 190 190" role="img" aria-label={`${Math.round(frac * 100)}% מהיעד`}>
      <circle cx="95" cy="95" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="12" />
      <circle
        cx="95" cy="95" r={r} fill="none"
        stroke={over ? "var(--danger)" : "var(--accent)"}
        strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${Math.min(frac, 1) * c} ${c}`}
        transform="translate(190 0) scale(-1 1) rotate(-90 95 95)"
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />
    </svg>
  );
}

function SummaryCard({ totals, target, planned, plan, date, profile }: { totals: Nutrients; target: number; planned: number; plan: WeekPlan; date: string; profile: Profile }) {
  const left = target - totals.calories;
  const [, setParams] = useSearchParams();
  const today = todayISO();
  const adjusted = target !== planned;
  return (
    <section className="card">
      <div className="summary">
        <div className="ring-wrap">
          <Ring value={totals.calories} max={target} />
          <div className="ring-center">
            <div className="big num">{fmt(Math.abs(left))}</div>
            <div className="sub">{left >= 0 ? "קק״ל נותרו" : "קק״ל מעל היעד"}</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 14, width: "100%" }}>
          <div className="grid-4" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            <div className="stat"><div className="label">נאכל</div><div className="value num">{fmt(totals.calories)}</div></div>
            <div className="stat"><div className="label">יעד יומי</div><div className="value num">{fmt(target)}</div></div>
            <div className="stat">
              <div className="label">נותר השבוע</div>
              <div className="value num">{fmt(Math.max(0, plan.remainingWeek))}</div>
            </div>
          </div>
          {adjusted && (
            <div className="sub small">
              היעד המקורי ליום זה: {fmt(planned)} קק״ל · עודכן ב-{target > planned ? "+" : "−"}{fmt(Math.abs(target - planned))} לאיזון השבועי
            </div>
          )}
          <div className="week" aria-label="תקציב שבועי">
            {plan.days.map((d) => {
              const pct = d.target > 0 ? Math.min(100, (d.consumed / d.target) * 100) : 0;
              const isFuture = d.date > today;
              const inner = (
                <>
                  <div className="d">{DAY_SHORT[d.dow]}</div>
                  <div className="t num">{isFuture ? fmt(d.target) : fmt(d.consumed)}</div>
                  <div className="bar"><span className={d.consumed > d.target ? "over" : ""} style={{ width: `${isFuture ? 0 : pct}%` }} /></div>
                  <div className="muted num" style={{ fontSize: "0.7rem" }}>{isFuture ? "יעד" : `/ ${fmt(d.target)}`}</div>
                  {d.high && <div className="high">יום מוגבר</div>}
                </>
              );
              const cls = `wday ${d.date === today ? "today" : ""} ${d.date === date ? "selected" : ""} ${isFuture ? "future" : ""}`;
              return isFuture ? (
                <div key={d.date} className={cls} title={formatShort(d.date)}>{inner}</div>
              ) : (
                <button key={d.date} className={cls} style={{ cursor: "pointer" }} title={formatShort(d.date)} onClick={() => setParams(d.date === today ? {} : { date: d.date })}>
                  {inner}
                </button>
              );
            })}
          </div>
          <div className="muted small">
            תקציב שבועי {fmt(plan.weeklyBudget)} קק״ל · חריגה ביום אחד מקטינה את היעד בשאר ימי השבוע (לא פחות מ-{fmt(profile.minCalories)})
          </div>
        </div>
      </div>
    </section>
  );
}

function MacroCards({ totals }: { totals: Nutrients }) {
  const pct = macroPercents(totals);
  return (
    <section className="grid-4">
      {MACROS.map((m) => (
        <div key={m.key} className="card macro">
          <div className="name"><span className="dot" style={{ background: m.color }} />{m.label}</div>
          <div className="spread">
            <span className="val num">{fmt(totals[m.key], 1)}<span className="sub"> ג׳</span></span>
            <span className="pct num">{fmt(pct[m.key])}%</span>
          </div>
          <div className="track"><span style={{ width: `${Math.min(100, pct[m.key])}%`, background: m.color }} /></div>
        </div>
      ))}
    </section>
  );
}

const EXAMPLES = [
  "2 פרוסות לחם מלא עם קוטג׳ 5% וחצי עגבנייה",
  "קפה עם חלב 3% וכפית סוכר",
  "סלט ישראלי עם כף שמן זית, 150 גרם חזה עוף בגריל",
  "יוגורט דנונה פרו 0% (115 קלוריות)",
];

function LogComposer({ date, aiEnabled, onAdded }: { date: string; aiEnabled: boolean; onAdded: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EditableItem[] | null>(null);
  const [notes, setNotes] = useState("");

  const defaultMeal = (): Meal | null => (date === todayISO() ? mealByTime() : null);

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.parse(text);
      setItems(res.items.map((it) => toEditable({ ...it, meal: it.meal ?? defaultMeal() })));
      setNotes(res.notes);
      if (!res.items.length) setError("לא זוהו מזונות בטקסט.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addManual() {
    setItems([
      ...(items ?? []),
      toEditable({ name: "", amount: 1, unit: "מנה", meal: defaultMeal(), source: "manual" as const, sourceNote: "", calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 }),
    ]);
  }

  async function save() {
    if (!items) return;
    const entries: NewEntry[] = items
      .filter((it) => it.name.trim())
      .map((it) => ({
        date,
        meal: it.meal ?? undefined,
        name: it.name.trim(),
        amount: it.amount,
        unit: it.unit,
        calories: it.calories,
        carbs: it.carbs,
        protein: it.protein,
        fat: it.fat,
        fiber: it.fiber,
        source: it.source,
        sourceNote: it.sourceNote,
      }));
    setBusy(true);
    try {
      await api.addEntries(entries);
      setItems(null);
      setText("");
      setNotes("");
      await onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const draftTotal = items ? sum(items) : null;

  return (
    <section className="card log-input">
      <div className="card-head">
        <h2>מה אכלת?</h2>
        <span className="sub small">כתבו בחופשיות — נזהה את המזונות והכמויות</span>
      </div>
      {!aiEnabled && <div className="alert warn" style={{ marginBottom: 10 }}>כדי לנתח טקסט חופשי, הזינו מפתח Claude API ב<Link to="/settings">הגדרות</Link>. בינתיים אפשר להוסיף פריטים ידנית.</div>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="לדוגמה: בבוקר אכלתי 2 ביצים מקושקשות, פרוסת לחם מחמצת עם אבוקדו וקפה הפוך"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !busy) void analyze();
        }}
      />
      {!text && !items && (
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => setText(ex)}>{ex}</button>
          ))}
        </div>
      )}
      <div className="spread" style={{ marginTop: 12 }}>
        <button className="btn ghost" onClick={addManual}>+ הוספה ידנית</button>
        <button className="btn primary" disabled={!text.trim() || busy || !aiEnabled} onClick={analyze}>
          {busy && !items ? <><span className="spinner" /> מנתח…</> : "נתח"}
        </button>
      </div>
      {busy && !items && <div className="sub small" style={{ marginTop: 8 }}>מחפש ערכים תזונתיים ברשימה שלך וברשת — זה עשוי לקחת כמה שניות.</div>}
      {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}

      {items && items.length > 0 && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div className="spread">
            <h3>בדיקה לפני שמירה</h3>
            {draftTotal && <span className="sub num">סה״כ {fmt(draftTotal.calories)} קק״ל</span>}
          </div>
          {notes && <div className="alert info">{notes}</div>}
          <ItemTable
            items={items}
            onChange={(i, it) => setItems(items.map((x, j) => (j === i ? it : x)))}
            onRemove={(i) => setItems(items.filter((_, j) => j !== i))}
          />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={() => setItems(null)}>ביטול</button>
            <button className="btn primary" disabled={busy} onClick={save}>הוסף ליומן</button>
          </div>
        </div>
      )}
    </section>
  );
}

function EntryList({ entries, loading, onChanged }: { entries: Entry[]; loading: boolean; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<{ id: string; item: EditableItem } | null>(null);
  const groups: { key: Meal | "none"; label: string; items: Entry[] }[] = [
    ...MEALS.map((m) => ({ key: m.key, label: m.label, items: entries.filter((e) => e.meal === m.key) })),
    { key: "none" as const, label: "ללא שיוך לארוחה", items: entries.filter((e) => !e.meal) },
  ].filter((g) => g.items.length);

  async function remove(id: string) {
    if (!confirm("למחוק את הפריט?")) return;
    await api.deleteEntry(id);
    await onChanged();
  }

  async function saveEdit() {
    if (!editing) return;
    const { item } = editing;
    await api.updateEntry(editing.id, {
      name: item.name, amount: item.amount, unit: item.unit, meal: item.meal ?? undefined,
      calories: item.calories, carbs: item.carbs, protein: item.protein, fat: item.fat, fiber: item.fiber,
      source: item.source, sourceNote: item.sourceNote,
    });
    setEditing(null);
    await onChanged();
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>היומן</h2>
        <span className="sub">{entries.length} פריטים</span>
      </div>
      {loading ? (
        <div className="empty"><span className="spinner" style={{ display: "inline-block" }} /></div>
      ) : !groups.length ? (
        <div className="empty">עוד לא נרשם כלום ליום הזה.</div>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="meal-group">
            <div className="meal-title">
              <span>{g.label}</span>
              <span className="num sub">{fmt(sum(g.items).calories)} קק״ל</span>
            </div>
            {g.items.map((e) =>
              editing?.id === e.id ? (
                <div key={e.id} style={{ padding: "8px 0" }}>
                  <ItemTable
                    items={[editing.item]}
                    onChange={(_, item) => setEditing({ id: e.id, item })}
                    onRemove={() => setEditing(null)}
                  />
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
                    <button className="btn ghost" onClick={() => setEditing(null)}>ביטול</button>
                    <button className="btn primary" onClick={saveEdit}>שמירה</button>
                  </div>
                </div>
              ) : (
                <div key={e.id} className="entry">
                  <div>
                    <div>
                      {e.name} <span className="muted small">· {fmt(e.amount, 2)} {e.unit}</span>
                    </div>
                    <div className="macros num">
                      פחמ׳ {fmt(e.carbs, 1)} · חלבון {fmt(e.protein, 1)} · שומן {fmt(e.fat, 1)} · סיבים {fmt(e.fiber, 1)}
                      {" "}<span className={`badge ${e.source}`} title={e.sourceNote}>{SOURCE_LABEL[e.source]}</span>
                    </div>
                  </div>
                  <div className="kcal num">{fmt(e.calories)} קק״ל</div>
                  <div className="actions">
                    <button className="btn ghost icon" title="עריכה" onClick={() => setEditing({ id: e.id, item: toEditable({ ...e, meal: e.meal ?? null }) })}>✎</button>
                    <button className="btn ghost icon danger" title="מחיקה" onClick={() => remove(e.id)}>✕</button>
                  </div>
                </div>
              ),
            )}
          </div>
        ))
      )}
    </section>
  );
}
