import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeLog, norm } from "../ai.js";
import {
  DAY_NAMES, ENERGY_SOURCES, MEALS, MEAL_ORDER, addDays, computeDays, currentSettings, daysBetween, dayLabel, dow, fmt, fmtDate,
  latestWeight, macroShares, mealByTime, startDate, sumItems, todayISO,
} from "../calc.js";
import { mutate, newId, useStore } from "../store.js";
import { getSample } from "../claude.js";
import { ConfirmSheet, EntryEditor, Icon, Ring, Sheet, toast } from "../ui.jsx";
import { WeightSheet } from "./Settings.jsx";

const MACROS = [
  ["carbs", "פחמימות"],
  ["protein", "חלבון"],
  ["fat", "שומן"],
  ["fiber", "סיבים"],
];

export default function Daily({ date, setDate, aiReady }) {
  const { data } = useStore();
  const today = todayISO();
  const start = startDate(data);
  const days = useMemo(() => computeDays(data, today), [data, today]);
  const day = days.get(date);
  const entries = useMemo(
    () => data.entries.filter((e) => e.date === date).sort((a, b) => MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal) || a.createdAt.localeCompare(b.createdAt)),
    [data.entries, date],
  );
  const exercises = useMemo(() => (data.exercises || []).filter((x) => x.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [data.exercises, date]);
  const burned = exercises.reduce((a, x) => a + (x.calories || 0), 0);
  const [editingEx, setEditingEx] = useState(null);
  const totals = sumItems(entries);
  const shares = macroShares(totals);
  const s = currentSettings(data);
  const [editing, setEditing] = useState(null);
  const [weighIn, setWeighIn] = useState(false);
  const lw = latestWeight(data);
  const needWeight = date === today && lw && daysBetween(lw.date, today) >= 7;

  const saveEntry = async (item) => {
    try {
      await mutate((d) => {
        const i = d.entries.findIndex((e) => e.id === item.id);
        if (i >= 0) d.entries[i] = item;
        else d.entries.push(item);
      });
      setEditing(null);
    } catch (e) {
      toast(e.message);
    }
  };
  const saveExercise = async (x) => {
    try {
      await mutate((d) => {
        d.exercises = d.exercises || [];
        const i = d.exercises.findIndex((e) => e.id === x.id);
        if (i >= 0) d.exercises[i] = x;
        else d.exercises.push(x);
      });
      setEditingEx(null);
    } catch (e) {
      toast(e.message);
    }
  };
  const deleteExercise = async (id) => {
    try {
      await mutate((d) => void (d.exercises = (d.exercises || []).filter((x) => x.id !== id)));
      setEditingEx(null);
      toast("הפעילות נמחקה");
    } catch (e) {
      toast(e.message);
    }
  };
  const deleteEntry = async (id) => {
    try {
      await mutate((d) => void (d.entries = d.entries.filter((e) => e.id !== id)));
      setEditing(null);
      toast("נמחק מהיומן");
    } catch (e) {
      toast(e.message);
    }
  };

  return (
    <>
      <div className="nav-row">
        <div className="row-gap" style={{ gap: 2 }}>
          <button className="icon-btn" aria-label="יום קודם" onClick={() => setDate(addDays(date, -1))}><Icon.earlier /></button>
          <button className="icon-btn" aria-label="יום הבא" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}><Icon.later /></button>
        </div>
        <div className="row-gap">
          {date !== today && <button className="link" onClick={() => setDate(today)}>היום</button>}
          <label className="date-pick">
            <Icon.calendar />
            {fmtDate(date)}
            <input id="pick-date" type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} aria-label="בחירת תאריך" />
          </label>
        </div>
      </div>
      <h1 className="large-title">{dayLabel(date)}</h1>
      <p className="subtitle">{date === today ? `יום ${DAY_NAMES[dow(date)]}, ${fmtDate(date)}` : fmtDate(date, true)}</p>

      <div className="stack">
        {needWeight && (
          <div className="alert info row-gap" style={{ justifyContent: "space-between" }}>
            <span><span className="title">הגיע הזמן להישקל</span>המשקל האחרון עודכן לפני {daysBetween(lw.date, today)} ימים.</span>
            <button className="btn small tinted" onClick={() => setWeighIn(true)}>עדכון משקל</button>
          </div>
        )}

        <div className="group summary">
          {day ? <Summary day={day} /> : <div className="sublabel">התאריך הזה לפני תחילת המעקב, ולכן אין לו יעד. אפשר עדיין לרשום בו.</div>}
          <div className="macro-strip">
            {MACROS.map(([k, l]) => (
              <div className="macro-col" key={k}>
                <span className="name"><span className="dot" style={{ background: `var(--${k})` }} />{l}</span>
                <span className="g num">{fmt(totals[k], totals[k] >= 100 ? 0 : 1)}<small> ג׳</small></span>
                <div className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, shares[k])}%`, background: `var(--${k})` }} /></div>
                <span className="pct num">{fmt(shares[k])}%</span>
              </div>
            ))}
          </div>
        </div>
        {day && <BalanceNote day={day} s={s} />}
      </div>

      <Composer date={date} entries={entries} exercises={exercises} weightKg={lw?.kg} foods={data.foods} portions={data.portions || []} aiReady={aiReady} onManual={() => setEditing({ isNew: true })} />

      <div className="section-head"><h2 className="section-title strong">היומן</h2><span className="meal-total num">{fmt(totals.calories)} קק״ל</span></div>
      {entries.length === 0 && exercises.length === 0 ? (
        <div className="group"><div className="empty">עוד לא נרשם כלום {date === today ? "היום" : "ביום הזה"}.<br />כתבו מה אכלתם, או איזו פעילות עשיתם, בתיבה למעלה.</div></div>
      ) : (
        <div className="stack">
          {MEAL_ORDER.filter((m) => entries.some((e) => e.meal === m)).map((m) => {
            const list = entries.filter((e) => e.meal === m);
            return (
              <div key={m}>
                <div className="section-head" style={{ marginTop: 6 }}><h3 className="section-title">{MEALS[m]}</h3><span className="meal-total num">{fmt(sumItems(list).calories)} קק״ל</span></div>
                <div className="group">
                  {list.map((e) => (
                    <button key={e.id} className="cell tap" onClick={() => setEditing(e)}>
                      <div className="entry grow">
                        <span className="name">{e.name}</span>
                        <span className="meta">{fmt(e.amount, e.amount % 1 ? 1 : 0)} {e.unit}<span className={`badge ${e.source === "web" ? "web" : ""}`}>{ENERGY_SOURCES[e.source]}</span></span>
                        <span className="kcal num">{fmt(e.calories)}<small>קק״ל</small></span>
                      </div>
                      <Icon.chev className="chev" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {exercises.length > 0 && (
            <div>
              <div className="section-head" style={{ marginTop: 6 }}><h3 className="section-title">פעילות גופנית</h3><span className="meal-total num" dir="ltr">−{fmt(burned)} קק״ל</span></div>
              <div className="group">
                {exercises.map((x) => (
                  <button key={x.id} className="cell tap" onClick={() => setEditingEx(x)}>
                    <div className="entry grow">
                      <span className="name">{x.name}</span>
                      <span className="meta">{x.minutes ? `${fmt(x.minutes)} דקות` : ""}<span className="badge">{x.source === "user" ? "כתבת" : "הערכה"}</span></span>
                      <span className="kcal num good" dir="ltr">−{fmt(x.calories)}<small>קק״ל</small></span>
                    </div>
                    <Icon.chev className="chev" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editingEx && <ExerciseEditor item={editingEx} title="עריכת פעילות" onSave={saveExercise} onDelete={() => deleteExercise(editingEx.id)} onClose={() => setEditingEx(null)} />}
      {editing && (
        <EntryEditor
          title={editing.isNew ? "הוספה ידנית" : "עריכת פריט"}
          item={editing.isNew ? { id: newId(), date, meal: date === today ? mealByTime() : "snack", name: "", amount: 1, unit: "מנה", grams: null, calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0, source: "manual", sourceNote: "", createdAt: new Date().toISOString() } : editing}
          onSave={saveEntry}
          onDelete={editing.isNew ? null : () => deleteEntry(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {weighIn && <WeightSheet onClose={() => setWeighIn(false)} />}
    </>
  );
}

function Summary({ day }) {
  const left = day.target - day.eaten;
  return (
    <div className="ring-wrap">
      <Ring eaten={day.eaten} target={day.target} />
      <div className="kv">
        <div className="row"><span className="k">נאכל</span><span className="v num">{fmt(day.food)}</span></div>
        {day.burned > 0 && <div className="row"><span className="k">פעילות</span><span className="v num good" dir="ltr">−{fmt(day.burned)}</span></div>}
        <div className="row"><span className="k">היעד להיום</span><span className="v num">{fmt(day.target)}</span></div>
        <div className="row"><span className="k">{left >= 0 ? "נותר" : "מעל היעד"}</span><span className={`v num ${left < 0 ? "bad" : "good"}`}>{fmt(Math.abs(left))}</span></div>
      </div>
    </div>
  );
}

/** The quiet line under the summary that explains today's target. */
function BalanceNote({ day, s }) {
  const adj = Math.round(day.adjustment);
  return (
    <p className="footnote" style={{ marginTop: -2 }}>
      יום {day.isHigh ? `מוגבר (+${s.highBoostPct}%)` : "רגיל"}: {fmt(day.plan)} קק״ל
      {adj !== 0 && <> · איזון מ-7 הימים הקודמים <span className="num" dir="ltr">{adj > 0 ? "+" : "−"}{fmt(Math.abs(adj))}</span></>}
      {day.plan + day.adjustment < s.minCalories && <> · הוגבל למינימום היומי</>}
    </p>
  );
}

/* ---------- free-text composer ---------- */

const emptyDraft = () => ({ add: [], update: [], delete: [], exercise: [], exerciseUpdate: [], exerciseDelete: [], notes: "" });
const draftSize = (r) => r.add.length + r.update.length + r.delete.length + r.exercise.length + r.exerciseUpdate.length + r.exerciseDelete.length;

/** A picked photo as a JPEG Claude can read: upright, at most 2000 px on its long side (iPhone HEIC photos included). */
async function toJpeg(file) {
  const MAX = 2000;
  let img, close = () => {};
  try {
    img = await createImageBitmap(file, { imageOrientation: "from-image" });
    close = () => img.close?.();
  } catch {
    const url = URL.createObjectURL(file);
    img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("bad image")); i.src = url; });
    close = () => URL.revokeObjectURL(url);
  }
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  close();
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("bad image"))), "image/jpeg", 0.88));
}

function Composer({ date, entries, exercises, weightKg, foods, portions, aiReady, onManual }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // the draft under review, plus savedChanges (library/portions, already saved)
  const ctl = useRef(null);
  const [photos, setPhotos] = useState([]); // [{blob, url}]
  const [maxPhotos, setMaxPhotos] = useState(0); // 0: this view can't send photos
  const fileRef = useRef(null);
  useEffect(() => {
    let live = true;
    getSample().then((s) => s?.limits?.()).then((l) => live && setMaxPhotos(l?.images?.maxCount || 0)).catch(() => {});
    return () => { live = false; };
  }, [aiReady]);
  const today = todayISO();
  const defaultMeal = date === today ? mealByTime() : "snack";

  async function run({ draft, adjustment }) {
    ctl.current = new AbortController();
    const r = await analyzeLog({ text, images: photos.map((p) => p.blob), date, dayEntries: entries, dayExercises: exercises, weightKg, foods, portions, defaultMeal, draft, adjustment, onStep: setStep, signal: ctl.current.signal });
    // Saved foods and portion sizes are updated right away; each change can be undone from the review.
    const saved = [...(await applyLibrary(r.library)), ...(await applyPortions(r.portions))];
    return { r, saved };
  }

  async function analyze() {
    setBusy(true);
    setError(null);
    setStep("");
    try {
      const { r, saved } = await run({});
      if (!draftSize(r)) {
        if (photos.length && saved.length) { // photos only: their products were saved to the list
          setResult({ ...emptyDraft(), notes: r.notes, seconds: r.seconds, savedChanges: saved, savedOnly: true });
          clearPhotos();
          setText("");
          return;
        }
        setError(r.notes || (photos.length ? "לא הצלחתי לקרוא ערכים תזונתיים בתמונות. נסו צילום קרוב וחד של הטבלה." : "לא זיהיתי מזונות, פעילות או שינויים בטקסט. נסו לנסח אחרת."));
        if (saved.length) setResult({ ...emptyDraft(), savedChanges: saved, savedOnly: true });
      } else setResult({ ...r, savedChanges: saved });
    } catch (e) {
      if (!e.cancelled) setError(e.message);
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  /** Applies a written adjustment to the draft under review. */
  async function revise(adjustment) {
    const { r, saved } = await run({ draft: result, adjustment });
    setResult((prev) => ({ ...r, notes: r.notes, savedChanges: [...prev.savedChanges, ...saved] }));
  }

  async function applyLibrary(changes) {
    if (!changes.length) return [];
    const applied = [];
    const now = new Date().toISOString();
    await mutate((d) => {
      for (const c of changes) {
        const { action, id, ...fields } = c;
        if (action === "update") {
          const i = d.foods.findIndex((f) => f.id === id);
          if (i < 0) continue;
          applied.push({ type: "food", action, before: d.foods[i], after: { ...d.foods[i], ...fields, updatedAt: now } });
          d.foods[i] = applied[applied.length - 1].after;
        } else {
          const item = { id: newId(), kind: "food", source: "log", ...fields, updatedAt: now };
          d.foods.push(item);
          applied.push({ type: "food", action: "add", after: item });
        }
      }
    }).catch((e) => toast(e.message));
    return applied;
  }

  async function applyPortions(list) {
    if (!list.length) return [];
    const applied = [];
    await mutate((d) => {
      d.portions = d.portions || [];
      for (const p of list) {
        const i = d.portions.findIndex((x) => norm(x.term) === norm(p.term));
        if (i >= 0 && norm(d.portions[i].value) === norm(p.value)) continue; // already saved as is
        const after = { term: p.term, value: p.value, updatedAt: new Date().toISOString() };
        if (i >= 0) {
          applied.push({ type: "portion", action: "update", before: d.portions[i], after });
          d.portions[i] = after;
        } else {
          applied.push({ type: "portion", action: "add", after });
          d.portions.push(after);
        }
      }
    }).catch((e) => toast(e.message));
    return applied;
  }

  async function undoSaved(idx) {
    const c = result.savedChanges[idx];
    await mutate((d) => {
      if (c.type === "portion") {
        d.portions = (d.portions || []).filter((x) => norm(x.term) !== norm(c.after.term));
        if (c.before) d.portions.push(c.before);
      } else if (c.action === "add") d.foods = d.foods.filter((f) => f.id !== c.after.id);
      else {
        const i = d.foods.findIndex((f) => f.id === c.after.id);
        if (i >= 0) d.foods[i] = c.before;
      }
    }).catch((e) => toast(e.message));
    setResult((r) => ({ ...r, savedChanges: r.savedChanges.map((x, i) => (i === idx ? { ...x, undone: true } : x)) }));
  }

  async function save() {
    const now = new Date().toISOString();
    await mutate((d) => {
      const del = new Set(result.delete);
      d.entries = d.entries.filter((e) => !del.has(e.id));
      for (const u of result.update) {
        const i = d.entries.findIndex((e) => e.id === u.id);
        if (i >= 0) d.entries[i] = { ...d.entries[i], ...u, id: d.entries[i].id };
      }
      for (const a of result.add) d.entries.push({ ...a, id: newId(), date, createdAt: now });
      d.exercises = d.exercises || [];
      const xdel = new Set(result.exerciseDelete);
      d.exercises = d.exercises.filter((x) => !xdel.has(x.id));
      for (const u of result.exerciseUpdate) {
        const i = d.exercises.findIndex((x) => x.id === u.id);
        if (i >= 0) d.exercises[i] = { ...d.exercises[i], ...u, id: d.exercises[i].id };
      }
      for (const x of result.exercise) d.exercises.push({ ...x, id: newId(), date, createdAt: now });
    });
    const n = draftSize(result);
    toast(n === 1 ? "היומן עודכן" : `היומן עודכן (${n} שינויים)`);
    setResult(null);
    setText("");
    clearPhotos();
  }

  async function addPhotos(files) {
    const room = maxPhotos - photos.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (files.length > room) toast(`אפשר לצרף עד ${maxPhotos} תמונות`);
    const added = [];
    for (const f of list) {
      try {
        const blob = await toJpeg(f);
        added.push({ blob, url: URL.createObjectURL(blob) });
      } catch { toast("אחת התמונות לא נפתחה"); }
    }
    setPhotos((p) => [...p, ...added]);
  }
  function removePhoto(i) {
    setPhotos((p) => { URL.revokeObjectURL(p[i].url); return p.filter((_, j) => j !== i); });
  }
  function clearPhotos() {
    setPhotos((p) => { p.forEach((x) => URL.revokeObjectURL(x.url)); return []; });
  }

  return (
    <>
      <div className="section-head"><h2 className="section-title strong">מה אכלת? מה עשית?</h2></div>
      <div className="group composer">
        <textarea
          id="log-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={photos.length ? "מה אכלת מזה? למשל: ״אכלתי גביע אחד״. אפשר גם להשאיר ריק, והמוצר רק יישמר ברשימה." : "למשל: חזה עוף 150 גרם ואורז, והליכה של 40 דקות"}
          disabled={busy}
          aria-label="מה אכלת או מה עשית"
        />
        {photos.length > 0 && (
          <div className="thumbs">
            {photos.map((p, i) => (
              <div key={p.url} className="thumb">
                <img src={p.url} alt={`תמונה ${i + 1}`} />
                {!busy && <button className="thumb-x" aria-label={`הסרת תמונה ${i + 1}`} onClick={() => removePhoto(i)}><span><Icon.close /></span></button>}
              </div>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files || []); e.target.value = ""; }} />
        {busy ? (
          <div className="actions">
            <div className="progress"><span className="spinner" />{step || "מנתח…"}</div>
            <button className="btn small gray" onClick={() => ctl.current?.abort()}>עצירה</button>
          </div>
        ) : (
          <div className="actions">
            <div className="row-start">
              <button className="link" onClick={onManual}>הוספה ידנית</button>
              {maxPhotos > 0 && aiReady && (
                <button className="icon-btn" aria-label="צירוף תמונה של ערכים תזונתיים" disabled={photos.length >= maxPhotos} onClick={() => fileRef.current?.click()}><Icon.camera /></button>
              )}
            </div>
            <button className="btn small filled" disabled={(!text.trim() && !photos.length) || !aiReady} onClick={analyze}><Icon.send />ניתוח</button>
          </div>
        )}
        {!aiReady && !busy && <div className="sublabel">הניתוח האוטומטי פועל רק כשהאפליקציה פתוחה ב-claude.ai. אפשר להוסיף פריטים ידנית.</div>}
        {error && <div className="alert error">{error}</div>}
      </div>

      {result && (
        <ReviewSheet
          result={result}
          setResult={setResult}
          entries={entries}
          exercises={exercises}
          onSave={save}
          onRevise={revise}
          onUndoSaved={undoSaved}
          onStop={() => ctl.current?.abort()}
          step={step}
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
}

/* ---------- the review pop-up ---------- */

/** What a change to a saved food did, in a line: a new name variant or size, else its serving and calories. */
function foodChange(c) {
  const b = c.before, a = c.after;
  if (c.action === "update" && b) {
    const names = (a.aliases || []).filter((x) => !(b.aliases || []).includes(x));
    const sizes = (a.portions || []).filter((x) => !(b.portions || []).some((y) => y.unit === x.unit && y.grams === x.grams));
    const parts = [];
    if (names.length) parts.push(`${names.length > 1 ? "שמות נוספים" : "שם נוסף"}: ${names.join(", ")}`);
    if (sizes.length) parts.push(`${sizes.length > 1 ? "גדלים נוספים" : "גודל נוסף"}: ${sizes.map((x) => `${x.unit} = ${fmt(x.grams)} ג׳`).join(", ")}`);
    if (a.calories !== b.calories || a.servingAmount !== b.servingAmount || a.servingUnit !== b.servingUnit)
      parts.push(`${a.servingAmount} ${a.servingUnit}: ${fmt(a.calories)} קק״ל (היה ${fmt(b.calories)})`);
    if (parts.length) return parts.join(" · ");
  }
  return `${a.servingAmount} ${a.servingUnit}: ${fmt(a.calories)} קק״ל`;
}

/** Where an item's values came from, and whether it was just saved to the user's list. */
const SOURCE_BADGES = { library: "מהרשימה שלך", label: "מהתווית", web: "מהרשת", composed: "מחושב מרכיבים", user: "כתבת", reference: "ערך מקובל", manual: "ידני" };
function SourceBadges({ item, saved }) {
  const label = SOURCE_BADGES[item.source];
  return (
    <>
      {label && <span className={`badge ${["web", "library", "label"].includes(item.source) ? "web" : ""}`}>{label}</span>}
      {(item.source === "web" || item.source === "composed" || item.source === "label") && saved.has(norm(item.name)) && <span className="badge add">נוסף לרשימה</span>}
    </>
  );
}

function ReviewSheet({ result, setResult, entries, exercises, onSave, onRevise, onUndoSaved, onStop, step, onClose }) {
  const [adjust, setAdjust] = useState("");
  const [revising, setRevising] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const byId = new Map(entries.map((e) => [e.id, e]));
  // foods saved to the list during this review (web results are saved automatically)
  const savedNames = new Set((result.savedChanges || []).filter((c) => c.type === "food" && !c.undone).map((c) => norm(c.after.name)));
  const exById = new Map(exercises.map((x) => [x.id, x]));
  const draftKcal =
    result.add.reduce((a, x) => a + x.calories, 0) + result.update.reduce((a, u) => a + u.calories - (byId.get(u.id)?.calories || 0), 0) - result.delete.reduce((a, id) => a + (byId.get(id)?.calories || 0), 0)
    - result.exercise.reduce((a, x) => a + x.calories, 0) - result.exerciseUpdate.reduce((a, u) => a + u.calories - (exById.get(u.id)?.calories || 0), 0) + result.exerciseDelete.reduce((a, id) => a + (exById.get(id)?.calories || 0), 0);
  const savedOnly = result.savedOnly;

  const revise = async () => {
    setRevising(true);
    setError(null);
    try {
      await onRevise(adjust.trim());
      setAdjust("");
    } catch (e) {
      if (!e.cancelled) setError(e.message);
    } finally {
      setRevising(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      await onSave();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };
  const close = () => (savedOnly ? onClose() : setConfirmCancel(true));
  const edit = (list, i) => !revising && setEditIdx([list, i]);

  return (
    <Sheet
      title={savedOnly ? "עדכונים שנשמרו" : "לבדיקה לפני שמירה"}
      onClose={revising ? () => {} : close}
      start={<button className="link" onClick={close} disabled={revising}>{savedOnly ? "סגירה" : "ביטול"}</button>}
      end={savedOnly ? null : <button className="link" style={{ fontWeight: 600 }} disabled={revising || saving || !draftSize(result)} onClick={save}>שמירה</button>}
    >
      <div className="stack">
        {!savedOnly && (
          <div className="spread-row">
            <span className="sublabel">{draftSize(result)} פריטים</span>
            <span className="sublabel num" dir="ltr">{draftKcal >= 0 ? "+" : "−"}{fmt(Math.abs(draftKcal))} קק״ל ליום</span>
          </div>
        )}
        <div className="group" style={{ opacity: revising ? 0.5 : 1, transition: "opacity .2s" }}>
          {result.add.map((it, i) => (
            <button key={"a" + i} className="cell tap" onClick={() => edit("add", i)}>
              <div className="entry grow">
                <span className="name">{it.name}<SourceBadges item={it} saved={savedNames} /></span>
                <span className="meta">{fmt(it.amount, it.amount % 1 ? 1 : 0)} {it.unit} · {MEALS[it.meal]}{it.sourceNote ? ` · ${it.sourceNote}` : ""}</span>
                <span className="kcal num">{fmt(it.calories)}<small>קק״ל</small></span>
              </div>
              <Icon.chev className="chev" />
            </button>
          ))}
          {result.update.map((it, i) => {
            const old = byId.get(it.id);
            return (
              <button key={"u" + i} className="cell tap" onClick={() => edit("update", i)}>
                <div className="entry grow">
                  <span className="name">{it.name}<span className="badge upd">שינוי</span></span>
                  <span className="meta">{old ? `היה: ${fmt(old.amount, old.amount % 1 ? 1 : 0)} ${old.unit}, ${fmt(old.calories)} קק״ל → ` : ""}{fmt(it.amount, it.amount % 1 ? 1 : 0)} {it.unit}</span>
                  <span className="kcal num">{fmt(it.calories)}<small>קק״ל</small></span>
                </div>
                <Icon.chev className="chev" />
              </button>
            );
          })}
          {result.delete.map((id) => {
            const old = byId.get(id);
            return old ? (
              <div key={"d" + id} className="cell">
                <div className="entry grow">
                  <span className="name strike">{old.name}</span>
                  <span className="meta"><span className="badge del" style={{ marginInlineStart: 0 }}>יימחק</span></span>
                  <span className="kcal num strike">{fmt(old.calories)}<small>קק״ל</small></span>
                </div>
              </div>
            ) : null;
          })}
          {result.exercise.map((x, i) => (
            <button key={"x" + i} className="cell tap" onClick={() => edit("exercise", i)}>
              <div className="entry grow">
                <span className="name">{x.name}<span className="badge add">פעילות</span></span>
                <span className="meta">{x.minutes ? `${fmt(x.minutes)} דקות · ` : ""}{x.source === "user" ? "כתבת" : "הערכה"}{x.note ? ` · ${x.note}` : ""}</span>
                <span className="kcal num good" dir="ltr">−{fmt(x.calories)}<small>קק״ל</small></span>
              </div>
              <Icon.chev className="chev" />
            </button>
          ))}
          {result.exerciseUpdate.map((x, i) => {
            const old = exById.get(x.id);
            return (
              <button key={"xu" + i} className="cell tap" onClick={() => edit("exerciseUpdate", i)}>
                <div className="entry grow">
                  <span className="name">{x.name}<span className="badge upd">שינוי</span></span>
                  <span className="meta">{old ? `היה: ${fmt(old.calories)} קק״ל → ` : ""}{x.minutes ? `${fmt(x.minutes)} דקות` : ""}</span>
                  <span className="kcal num good" dir="ltr">−{fmt(x.calories)}<small>קק״ל</small></span>
                </div>
                <Icon.chev className="chev" />
              </button>
            );
          })}
          {result.exerciseDelete.map((id) => {
            const old = exById.get(id);
            return old ? (
              <div key={"xd" + id} className="cell">
                <div className="entry grow">
                  <span className="name strike">{old.name}</span>
                  <span className="meta"><span className="badge del" style={{ marginInlineStart: 0 }}>יימחק</span></span>
                  <span className="kcal num strike" dir="ltr">−{fmt(old.calories)}<small>קק״ל</small></span>
                </div>
              </div>
            ) : null;
          })}
          {!draftSize(result) && !savedOnly && <div className="empty">אין פריטים ברשימה.</div>}
          {result.savedChanges.map((c, i) => (
            <div key={"s" + i} className="cell">
              <div className="grow">
                {c.type === "portion" ? (
                  <>
                    <div style={{ fontSize: 15 }}>{c.undone ? <span className="strike">{c.after.term} = {c.after.value}</span> : <>{c.after.term} = {c.after.value}</>}<span className="badge web">{c.action === "add" ? "גודל מנה נשמר" : "גודל מנה עודכן"}</span></div>
                    <div className="sublabel">{c.before ? `היה ${c.before.value}. ` : ""}ישמש מעכשיו בכל רישום.</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 15 }}>{c.undone ? <span className="strike">{c.after.name}</span> : c.after.name}<span className="badge web">{c.action === "add" ? "נוסף לרשימה" : "עודכן ברשימה"}</span></div>
                    <div className="sublabel num">{foodChange(c)}</div>
                  </>
                )}
              </div>
              {!c.undone ? <button className="link" onClick={() => onUndoSaved(i)}>ביטול</button> : <span className="sublabel">בוטל</span>}
            </div>
          ))}
        </div>
        {result.notes && <p className="footnote" style={{ margin: "0 4px" }}>{result.notes}</p>}
        {result.seconds > 0 && <p className="footnote num" style={{ margin: "0 4px" }}>הניתוח נמשך {fmt(result.seconds)} שניות.</p>}

        {!savedOnly && (
          <div className="group composer" style={{ padding: "10px 12px 10px 14px" }}>
            <textarea
              id="adjust-text"
              value={adjust}
              onChange={(e) => setAdjust(e.target.value)}
              placeholder="משהו לא מדויק? כתבו תיקון, למשל: ״היו 4 משולשי פיצה ולא 5״ או ״האורז היה 150 גרם״"
              disabled={revising}
              aria-label="תיקון לרשימה"
              style={{ minHeight: 52 }}
            />
            {revising ? (
              <div className="actions">
                <div className="progress"><span className="spinner" />{step || "מעדכן…"}</div>
                <button className="btn small gray" onClick={onStop}>עצירה</button>
              </div>
            ) : (
              <div className="actions" style={{ justifyContent: "flex-end" }}>
                <button className="btn small tinted" disabled={!adjust.trim()} onClick={revise}>עדכון הרשימה</button>
              </div>
            )}
          </div>
        )}
        {error && <div className="alert error">{error}</div>}

        {savedOnly ? (
          <button className="btn block gray" onClick={onClose}>סגירה</button>
        ) : (
          <button className="btn block filled" disabled={revising || saving || !draftSize(result)} onClick={save}>שמירה ביומן</button>
        )}
      </div>

      {editIdx && editIdx[0].startsWith("exercise") && (
        <ExerciseEditor
          title="עריכה לפני שמירה"
          deleteLabel="הסרה מהרשימה"
          item={result[editIdx[0]][editIdx[1]]}
          onSave={(it) => {
            setResult((r) => ({ ...r, [editIdx[0]]: r[editIdx[0]].map((x, i) => (i === editIdx[1] ? it : x)) }));
            setEditIdx(null);
          }}
          onDelete={() => {
            setResult((r) => ({ ...r, [editIdx[0]]: r[editIdx[0]].filter((_, i) => i !== editIdx[1]) }));
            setEditIdx(null);
          }}
          onClose={() => setEditIdx(null)}
        />
      )}
      {editIdx && !editIdx[0].startsWith("exercise") && (
        <EntryEditor
          title="עריכה לפני שמירה"
          deleteLabel="הסרה מהרשימה"
          item={result[editIdx[0]][editIdx[1]]}
          onSave={(it) => {
            setResult((r) => ({ ...r, [editIdx[0]]: r[editIdx[0]].map((x, i) => (i === editIdx[1] ? it : x)) }));
            setEditIdx(null);
          }}
          onDelete={() => {
            setResult((r) => ({ ...r, [editIdx[0]]: r[editIdx[0]].filter((_, i) => i !== editIdx[1]) }));
            setEditIdx(null);
          }}
          onClose={() => setEditIdx(null)}
        />
      )}
      {confirmCancel && (
        <ConfirmSheet
          title="לבטל את הרישום?"
          message={result.savedChanges.some((c) => !c.undone) ? "הפריטים לא יישמרו ביומן. עדכוני הרשימה וגדלי המנות כבר נשמרו; אפשר לבטל כל אחד מהם בנפרד." : "הפריטים לא יישמרו ביומן."}
          confirmLabel="ביטול הרישום"
          danger
          onConfirm={onClose}
          onClose={() => setConfirmCancel(false)}
        />
      )}
    </Sheet>
  );
}

/* ---------- exercise editor ---------- */

function ExerciseEditor({ item, title, onSave, onDelete, deleteLabel = "מחיקה", onClose }) {
  const [x, setX] = useState(() => ({ ...item, minutes: item.minutes ?? "" }));
  const set = (k, v) => setX((o) => ({ ...o, [k]: v }));
  // changing the duration rescales an estimate
  const setMinutes = (v) => {
    const m = parseFloat(v);
    if (m > 0 && item.minutes > 0 && x.source !== "user") setX((o) => ({ ...o, minutes: v, calories: Math.round((item.calories * m) / item.minutes) }));
    else set("minutes", v);
  };
  const valid = String(x.name || "").trim() && parseFloat(x.calories) >= 0;
  const save = () => onSave({ ...x, name: x.name.trim(), minutes: parseFloat(x.minutes) || null, calories: Math.round(parseFloat(x.calories) || 0), source: Number(x.calories) !== item.calories && parseFloat(x.minutes) === item.minutes ? "user" : x.source });
  return (
    <Sheet title={title} onClose={onClose} end={<button className="link" style={{ fontWeight: 600 }} disabled={!valid} onClick={save}>שמירה</button>}>
      <div className="stack">
        <div className="field"><label htmlFor="ex-name">פעילות</label><input id="ex-name" value={x.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field-grid">
          <div className="field"><label htmlFor="ex-min">משך (דקות)</label><input id="ex-min" type="number" inputMode="numeric" value={x.minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
          <div className="field"><label htmlFor="ex-cal">קלוריות שנשרפו</label><input id="ex-cal" type="number" inputMode="numeric" value={x.calories} onChange={(e) => set("calories", e.target.value)} /></div>
        </div>
        {x.note && <p className="footnote" style={{ margin: "0 4px" }}>{x.note}</p>}
        <p className="footnote" style={{ margin: "0 4px" }}>הקלוריות האלה יורדות מסך מה שאכלת היום.</p>
        {onDelete && <button className="btn block danger" onClick={onDelete}>{deleteLabel}</button>}
      </div>
    </Sheet>
  );
}
