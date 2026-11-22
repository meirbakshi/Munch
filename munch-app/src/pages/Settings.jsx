import { useEffect, useMemo, useRef, useState } from "react";
import { getDownloads } from "../claude.js";
import { norm } from "../ai.js";
import {
  ACTIVITY, DAY_SHORT, DAY_NAMES, KCAL_PER_KG, addDays, ageAt, currentSettings, fmt, fmtDate, latestWeight, planFor, round1, todayISO,
} from "../calc.js";
import { emptyData, mutate, newId, stableJson, useStore } from "../store.js";
import { ConfirmSheet, Icon, Segmented, Sheet, toast } from "../ui.jsx";
import { getTheme, setTheme } from "../theme.js";
import { WeighInSummary } from "../weighin.jsx";

/* ---------- weight ---------- */

export function WeightSheet({ onClose, existing = null }) {
  const { data } = useStore();
  const today = todayISO();
  const lw = latestWeight(data);
  const [date, setDate] = useState(existing ? existing.date : today);
  const [kg, setKg] = useState(existing ? String(existing.kg) : lw ? String(lw.kg) : "");
  const v = parseFloat(kg);
  const valid = v >= 30 && v <= 300 && date <= today;
  const [savedDate, setSavedDate] = useState(null); // after saving, the sheet shows the weigh-in summary
  const [paceChange, setPaceChange] = useState(null); // set when the new weight lowered the weekly pace
  const save = async () => {
    try {
      let change = null;
      await mutate((d) => {
        d.weights = [...d.weights.filter((w) => w.date !== date && w.date !== existing?.date), { date, kg: round1(v) }];
        // a lower weight means a lower daily expenditure: if the saved pace would now need days below
        // the minimum, save the fastest pace that doesn't (from today, like any settings change)
        const latest = [...d.weights].sort((x, y) => y.date.localeCompare(x.date))[0];
        const cur = currentSettings(d);
        if (cur && latest.date === date) {
          const p = planFor(cur, latest.kg, today);
          if (p.capped) {
            const rate = Math.floor(p.rate * 100) / 100;
            change = { from: cur.weeklyLossKg, to: rate, min: cur.minCalories };
            const entry = { ...cur, weeklyLossKg: rate, from: today };
            const h = d.settingsHistory;
            if (h[h.length - 1].from === today) h[h.length - 1] = entry;
            else h.push(entry);
          }
        }
      });
      setPaceChange(change);
      setSavedDate(date);
    } catch (e) {
      toast(e.message);
    }
  };
  if (savedDate) {
    return (
      <Sheet title="השקילה נשמרה" onClose={onClose} start={<span />} end={<button className="link" style={{ fontWeight: 600 }} onClick={onClose}>סיום</button>}>
        {paceChange && (
          <div className="alert info" style={{ marginBottom: 10 }}>
            <span className="title">הקצב השבועי עודכן ל-{fmt(paceChange.to, 2)} ק״ג</span>
            במשקל החדש ההוצאה היומית שלך קטנה יותר, ובקצב הקודם ({fmt(paceChange.from, 2)} ק״ג בשבוע) היעד היומי היה יורד מתחת למינימום ({fmt(paceChange.min)} קק״ל). לכן הקצב הותאם, והיעדים ותאריך היעד חושבו מחדש.
          </div>
        )}
        <WeighInSummary data={data} date={savedDate} onInsights={() => { onClose(); location.hash = "insights"; }} />
      </Sheet>
    );
  }
  return (
    <Sheet title={existing ? "שקילה" : "עדכון משקל"} onClose={onClose} end={<button className="link" style={{ fontWeight: 600 }} disabled={!valid} onClick={save}>שמירה</button>}>
      <div className="stack">
        <div className="field-grid">
          <div className="field"><label htmlFor="w-kg">משקל (ק״ג)</label><input id="w-kg" type="number" inputMode="decimal" step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus /></div>
          <div className="field"><label htmlFor="w-date">תאריך</label><input id="w-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <p className="footnote" style={{ margin: "0 4px" }}>מומלץ להישקל באותה שעה, למשל בבוקר לפני האוכל. היעד היומי מחושב מחדש לפי המשקל החדש.</p>
        {existing && data.weights.length > 1 && (
          <button className="btn block danger" onClick={() => mutate((d) => void (d.weights = d.weights.filter((w) => w.date !== existing.date))).then(() => { toast("השקילה נמחקה"); onClose(); }, (e) => toast(e.message))}>מחיקת השקילה</button>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- the page ---------- */

const blank = { name: "", sex: "", birthDate: "", heightCm: "", activity: "light", weightKg: "", targetWeightKg: "", weeklyLossKg: "0.5", highDays: [], highBoostPct: 20, minCalories: "" };

export default function Settings({ storageKind }) {
  const { data } = useStore();
  const s = currentSettings(data);
  const onboarding = !s;
  const lw = latestWeight(data);
  const today = todayISO();
  const fromSaved = () => (s ? { ...s, weightKg: lw ? String(lw.kg) : "" } : { ...blank });
  const [f, setF] = useState(fromSaved);
  // settings can change underneath this screen (a weigh-in may lower the pace): if nothing here was edited, show the new values
  const savedKey = stableJson(s);
  const shown = useRef(s); // the saved settings the form was filled from
  useEffect(() => {
    const prev = shown.current;
    shown.current = s;
    if (!prev || !s || stableJson(prev) === savedKey) return;
    // compare as saved values (the form holds text), the same way "dirty" does
    const untouched = stableJson({ ...prev, from: undefined }) === stableJson({ ...parsed, from: undefined });
    if (untouched) setF(fromSaved());
  }, [savedKey]);
  const [saving, setSaving] = useState(false);
  const [paceNotice, setPaceNotice] = useState(null); // explains an adjusted pace after saving
  const [weighIn, setWeighIn] = useState(false);
  const [allWeights, setAllWeights] = useState(false);
  const [editWeight, setEditWeight] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const minDefault = f.sex === "male" ? 1500 : 1200;
  const parsed = {
    name: String(f.name || "").trim(),
    sex: f.sex,
    birthDate: f.birthDate,
    heightCm: parseFloat(f.heightCm),
    activity: f.activity,
    targetWeightKg: parseFloat(f.targetWeightKg),
    weeklyLossKg: parseFloat(f.weeklyLossKg),
    highDays: [...f.highDays].sort(),
    highBoostPct: parseFloat(f.highBoostPct),
    minCalories: parseFloat(f.minCalories) || minDefault,
  };
  const kgNow = onboarding ? parseFloat(f.weightKg) : lw?.kg;

  const problems = [];
  if (!parsed.sex) problems.push("בחרו מין");
  if (!parsed.birthDate || ageAt(parsed.birthDate, today) < 14 || ageAt(parsed.birthDate, today) > 100) problems.push("הזינו תאריך לידה");
  if (!(parsed.heightCm >= 120 && parsed.heightCm <= 230)) problems.push("הזינו גובה בס״מ (120–230)");
  if (!(kgNow >= 30 && kgNow <= 300)) problems.push("הזינו משקל נוכחי");
  if (!(parsed.targetWeightKg >= 30 && parsed.targetWeightKg <= 300)) problems.push("הזינו משקל יעד");
  if (!(parsed.weeklyLossKg >= 0 && parsed.weeklyLossKg <= 1.5)) problems.push("ירידה שבועית בין 0 ל-1.5 ק״ג");
  if (!(parsed.highBoostPct >= 0 && parsed.highBoostPct <= 100)) problems.push("תוספת לימים מוגברים בין 0% ל-100%");
  if (!(parsed.minCalories >= 1000 && parsed.minCalories <= 3000)) problems.push("מינימום יומי בין 1,000 ל-3,000 קק״ל");
  if (kgNow && parsed.targetWeightKg >= kgNow && parsed.weeklyLossKg > 0) problems.push("משקל היעד צריך להיות נמוך מהמשקל הנוכחי (או קצב ירידה 0 לשמירה)");

  const plan = problems.length === 0 ? planFor(parsed, kgNow, today) : null;
  // a pace that needs days below the minimum is lowered automatically (calc.planFor); it's saved that way
  const paceCapped = plan && plan.capped;
  const savedRate = paceCapped ? Math.floor(plan.rate * 100) / 100 : parsed.weeklyLossKg;
  const canSave = Boolean(plan);

  const save = async () => {
    setSaving(true);
    try {
      await mutate((d) => {
        const entry = { ...parsed, weeklyLossKg: savedRate, from: today };
        const h = d.settingsHistory;
        if (h.length && h[h.length - 1].from === today) h[h.length - 1] = entry;
        else h.push(entry);
        if (onboarding) d.weights = [...d.weights.filter((w) => w.date !== today), { date: today, kg: round1(kgNow) }];
      });
      if (paceCapped) {
        setF((x) => ({ ...x, weeklyLossKg: String(savedRate) })); // the field shows the pace that was saved
        setPaceNotice({ asked: parsed.weeklyLossKg, saved: savedRate, min: parsed.minCalories });
      }
      if (!paceCapped || onboarding) toast(onboarding ? "מוכנים! אפשר להתחיל לרשום" : "ההגדרות נשמרו. היעדים מחושבים מחדש מהיום.");
      if (onboarding) location.hash = "#log";
    } catch (e) {
      toast(e.message);
    } finally {
      setSaving(false);
    }
  };

  const dirty = onboarding || stableJson({ ...s, from: undefined }) !== stableJson({ ...parsed, from: undefined });
  const weightsDesc = [...data.weights].sort((a, b) => b.date.localeCompare(a.date));
  const weeksToGoal = plan && plan.rate > 0 ? (kgNow - parsed.targetWeightKg) / plan.rate : null;

  return (
    <>
      <div className="nav-row" />
      <h1 className="large-title">{onboarding ? "ברוכים הבאים ליומן השומן" : "הגדרות"}</h1>
      <p className="subtitle">{onboarding ? "כמה פרטים, ונחשב לכם יעד קלורי יומי." : "שינוי פרטים או יעד מעדכן את היעדים מהיום והלאה. ימים קודמים לא משתנים."}</p>

      {onboarding ? (
        <>
      <div className="section-head"><h2 className="section-title">פרופיל</h2></div>
      <div className="group">
        <label className="cell"><span className="grow">שם</span><input id="s-name" className="inline" value={f.name} placeholder="לא חובה" onChange={(e) => set("name", e.target.value)} /></label>
      </div>

      <div className="section-head"><h2 className="section-title">פרטים אישיים</h2></div>
      <div className="group">
        <div className="cell"><span className="grow">מין</span><div style={{ width: 150 }}><Segmented label="מין" options={[["female", "אישה"], ["male", "גבר"]]} value={f.sex} onChange={(v) => set("sex", v)} /></div></div>
        <label className="cell"><span className="grow">תאריך לידה</span><input id="s-birth" className="inline" type="date" max={today} value={f.birthDate} onChange={(e) => set("birthDate", e.target.value)} />{f.birthDate && <span className="sublabel num">({ageAt(f.birthDate, today)})</span>}</label>
        <label className="cell"><span className="grow">גובה</span><input id="s-height" className="inline num" type="number" inputMode="numeric" placeholder="ס״מ" value={f.heightCm} onChange={(e) => set("heightCm", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">ס״מ</span></label>
        <label className="cell">
          <span className="grow">רמת פעילות<div className="sublabel">{ACTIVITY[f.activity]?.hint}</div></span>
          <select id="s-activity" className="inline" value={f.activity} onChange={(e) => set("activity", e.target.value)}>
            {Object.entries(ACTIVITY).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
          </select>
        </label>
      </div>

      <div className="section-head"><h2 className="section-title">משקל</h2></div>
      <div className="group">
        {onboarding ? (
          <label className="cell"><span className="grow">משקל נוכחי</span><input id="s-weight" className="inline num" type="number" inputMode="decimal" step="0.1" placeholder="ק״ג" value={f.weightKg} onChange={(e) => set("weightKg", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">ק״ג</span></label>
        ) : (
          <>
            <button className="cell tap" onClick={() => setWeighIn(true)}>
              <span className="grow">משקל נוכחי<div className="sublabel">עודכן {lw ? fmtDate(lw.date) : "–"}</div></span>
              <span className="value num">{fmt(lw?.kg, 1)} ק״ג</span>
              <Icon.chev className="chev" />
            </button>
            {(allWeights ? weightsDesc : weightsDesc.slice(0, 3)).map((w) => (
              <button key={w.date} className="cell tap" onClick={() => setEditWeight(w)}>
                <span className="grow sublabel" style={{ fontSize: 15 }}>{fmtDate(w.date, true)}</span>
                <span className="value num">{fmt(w.kg, 1)}</span>
                <Icon.chev className="chev" />
              </button>
            ))}
            {weightsDesc.length > 3 && <button className="cell tap" style={{ color: "var(--tint)" }} onClick={() => setAllWeights(!allWeights)}>{allWeights ? "פחות" : `כל השקילות (${weightsDesc.length})`}</button>}
          </>
        )}
      </div>

      <div className="section-head"><h2 className="section-title">היעד</h2></div>
      <div className="group">
        <label className="cell"><span className="grow">משקל יעד</span><input id="s-target" className="inline num" type="number" inputMode="decimal" step="0.1" placeholder="ק״ג" value={f.targetWeightKg} onChange={(e) => set("targetWeightKg", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">ק״ג</span></label>
        <label className="cell"><span className="grow">ירידה בשבוע{paceCapped && <div className="sublabel warn-text">יותאם ל-{fmt(savedRate, 2)} ק״ג, כדי שאף יום לא יירד מהמינימום</div>}</span><input id="s-rate" className="inline num" type="number" inputMode="decimal" step="0.05" value={f.weeklyLossKg} onChange={(e) => set("weeklyLossKg", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">ק״ג</span></label>
        <div className="cell" style={{ display: "grid", gap: 10 }}>
          <span>ימים עם צריכה גבוהה יותר</span>
          <div className="chips" role="group" aria-label="ימים מוגברים">
            {DAY_SHORT.map((d, i) => (
              <button key={i} className="chip" aria-pressed={f.highDays.includes(i)} aria-label={DAY_NAMES[i]} style={{ minWidth: 40 }}
                onClick={() => set("highDays", f.highDays.includes(i) ? f.highDays.filter((x) => x !== i) : [...f.highDays, i])}>{d}</button>
            ))}
          </div>
        </div>
        <label className="cell"><span className="grow">תוספת לימים מוגברים</span><input id="s-boost" className="inline num" type="number" inputMode="numeric" value={f.highBoostPct} onChange={(e) => set("highBoostPct", e.target.value)} style={{ width: "4em" }} /><span className="sublabel">%</span></label>
        <label className="cell"><span className="grow">מינימום יומי<div className="sublabel">היעד היומי לא יורד מתחת לזה</div></span><input id="s-min" className="inline num" type="number" inputMode="numeric" placeholder={String(minDefault)} value={f.minCalories} onChange={(e) => set("minCalories", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">קק״ל</span></label>
      </div>
      <p className="footnote">השבוע מתחיל ביום ראשון. הימים המוגברים מקבלים יותר, ושאר הימים מעט פחות, כך שסך השבוע נשאר זהה.</p>

      <div className="section-head"><h2 className="section-title">החישוב</h2></div>
      {plan ? (
        <>
          <div className="group">
            <div className="cell"><span className="grow">חילוף חומרים במנוחה</span><span className="value num">{fmt(plan.bmr)} קק״ל</span></div>
            <div className="cell"><span className="grow">הוצאה יומית משוערת</span><span className="value num">{fmt(plan.tdee)} קק״ל</span></div>
            <div className="cell"><span className="grow">ממוצע יומי מותר</span><span className="value num" style={{ color: "var(--label)", fontWeight: 600 }}>{fmt(plan.base)} קק״ל</span></div>
            {parsed.highDays.length > 0 && parsed.highDays.length < 7 && (
              <>
                <div className="cell"><span className="grow">יום רגיל</span><span className="value num">{fmt(plan.regular)} קק״ל</span></div>
                <div className="cell"><span className="grow">יום מוגבר</span><span className="value num">{fmt(plan.high)} קק״ל</span></div>
              </>
            )}
            {weeksToGoal != null && <div className="cell"><span className="grow">הגעה ליעד לפי התוכנית</span><span className="value">{fmtDate(addDays(today, Math.round(weeksToGoal * 7)), true)}</span></div>}
          </div>
          {paceCapped && (
            <div className="alert info" style={{ marginTop: 10 }}>
              <span className="title">הקצב הותאם ל-{fmt(savedRate, 2)} ק״ג בשבוע</span>
              כדי לרדת {fmt(parsed.weeklyLossKg, 2)} ק״ג בשבוע היה צריך ימים מתחת למינימום היומי ({fmt(parsed.minCalories)} קק״ל), ולכן הקצב הוגבל לקצב המהיר ביותר שלא יורד ממנו. היעדים, המשקל לפי התוכנית ותאריך היעד מחושבים לפיו, וגם בהמשך, כשהמשקל יורד, הקצב יתעדכן כדי לא לרדת מהמינימום.
            </div>
          )}
          <p className="footnote">ירידה של {fmt(plan.rate, 2)} ק״ג בשבוע = גירעון של כ-{fmt((plan.rate * KCAL_PER_KG) / 7)} קק״ל ביום. החישוב לפי נוסחת Mifflin-St Jeor.</p>
        </>
      ) : (
        <div className="group"><div className="empty" style={{ padding: 18 }}>{problems.join(" · ")}</div></div>
      )}

          <button className="btn filled block" style={{ marginTop: 16 }} disabled={!canSave || saving} onClick={save}>התחלה</button>
        </>
      ) : (
        <>
      <div className="section-head"><h2 className="section-title">משקל</h2></div>
      <div className="group">
        {onboarding ? (
          <label className="cell"><span className="grow">משקל נוכחי</span><input id="s-weight" className="inline num" type="number" inputMode="decimal" step="0.1" placeholder="ק״ג" value={f.weightKg} onChange={(e) => set("weightKg", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">ק״ג</span></label>
        ) : (
          <>
            <button className="cell tap" onClick={() => setWeighIn(true)}>
              <span className="grow">משקל נוכחי<div className="sublabel">עודכן {lw ? fmtDate(lw.date) : "–"}</div></span>
              <span className="value num">{fmt(lw?.kg, 1)} ק״ג</span>
              <Icon.chev className="chev" />
            </button>
            {(allWeights ? weightsDesc : weightsDesc.slice(0, 3)).map((w) => (
              <button key={w.date} className="cell tap" onClick={() => setEditWeight(w)}>
                <span className="grow sublabel" style={{ fontSize: 15 }}>{fmtDate(w.date, true)}</span>
                <span className="value num">{fmt(w.kg, 1)}</span>
                <Icon.chev className="chev" />
              </button>
            ))}
            {weightsDesc.length > 3 && <button className="cell tap" style={{ color: "var(--tint)" }} onClick={() => setAllWeights(!allWeights)}>{allWeights ? "פחות" : `כל השקילות (${weightsDesc.length})`}</button>}
          </>
        )}
      </div>

      <div className="section-head"><h2 className="section-title">היעד</h2></div>
      <div className="group">
        <label className="cell"><span className="grow">משקל יעד</span><input id="s-target" className="inline num" type="number" inputMode="decimal" step="0.1" placeholder="ק״ג" value={f.targetWeightKg} onChange={(e) => set("targetWeightKg", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">ק״ג</span></label>
        <label className="cell"><span className="grow">ירידה בשבוע{paceCapped && <div className="sublabel warn-text">יותאם ל-{fmt(savedRate, 2)} ק״ג, כדי שאף יום לא יירד מהמינימום</div>}</span><input id="s-rate" className="inline num" type="number" inputMode="decimal" step="0.05" value={f.weeklyLossKg} onChange={(e) => set("weeklyLossKg", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">ק״ג</span></label>
        <div className="cell" style={{ display: "grid", gap: 10 }}>
          <span>ימים עם צריכה גבוהה יותר</span>
          <div className="chips" role="group" aria-label="ימים מוגברים">
            {DAY_SHORT.map((d, i) => (
              <button key={i} className="chip" aria-pressed={f.highDays.includes(i)} aria-label={DAY_NAMES[i]} style={{ minWidth: 40 }}
                onClick={() => set("highDays", f.highDays.includes(i) ? f.highDays.filter((x) => x !== i) : [...f.highDays, i])}>{d}</button>
            ))}
          </div>
        </div>
        <label className="cell"><span className="grow">תוספת לימים מוגברים</span><input id="s-boost" className="inline num" type="number" inputMode="numeric" value={f.highBoostPct} onChange={(e) => set("highBoostPct", e.target.value)} style={{ width: "4em" }} /><span className="sublabel">%</span></label>
        <label className="cell"><span className="grow">מינימום יומי<div className="sublabel">היעד היומי לא יורד מתחת לזה</div></span><input id="s-min" className="inline num" type="number" inputMode="numeric" placeholder={String(minDefault)} value={f.minCalories} onChange={(e) => set("minCalories", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">קק״ל</span></label>
      </div>
      <p className="footnote">השבוע מתחיל ביום ראשון. הימים המוגברים מקבלים יותר, ושאר הימים מעט פחות, כך שסך השבוע נשאר זהה.</p>

      <div className="section-head"><h2 className="section-title">החישוב</h2></div>
      {plan ? (
        <>
          <div className="group">
            <div className="cell"><span className="grow">חילוף חומרים במנוחה</span><span className="value num">{fmt(plan.bmr)} קק״ל</span></div>
            <div className="cell"><span className="grow">הוצאה יומית משוערת</span><span className="value num">{fmt(plan.tdee)} קק״ל</span></div>
            <div className="cell"><span className="grow">ממוצע יומי מותר</span><span className="value num" style={{ color: "var(--label)", fontWeight: 600 }}>{fmt(plan.base)} קק״ל</span></div>
            {parsed.highDays.length > 0 && parsed.highDays.length < 7 && (
              <>
                <div className="cell"><span className="grow">יום רגיל</span><span className="value num">{fmt(plan.regular)} קק״ל</span></div>
                <div className="cell"><span className="grow">יום מוגבר</span><span className="value num">{fmt(plan.high)} קק״ל</span></div>
              </>
            )}
            {weeksToGoal != null && <div className="cell"><span className="grow">הגעה ליעד לפי התוכנית</span><span className="value">{fmtDate(addDays(today, Math.round(weeksToGoal * 7)), true)}</span></div>}
          </div>
          {paceCapped && (
            <div className="alert info" style={{ marginTop: 10 }}>
              <span className="title">הקצב הותאם ל-{fmt(savedRate, 2)} ק״ג בשבוע</span>
              כדי לרדת {fmt(parsed.weeklyLossKg, 2)} ק״ג בשבוע היה צריך ימים מתחת למינימום היומי ({fmt(parsed.minCalories)} קק״ל), ולכן הקצב הוגבל לקצב המהיר ביותר שלא יורד ממנו. היעדים, המשקל לפי התוכנית ותאריך היעד מחושבים לפיו, וגם בהמשך, כשהמשקל יורד, הקצב יתעדכן כדי לא לרדת מהמינימום.
            </div>
          )}
          <p className="footnote">ירידה של {fmt(plan.rate, 2)} ק״ג בשבוע = גירעון של כ-{fmt((plan.rate * KCAL_PER_KG) / 7)} קק״ל ביום. החישוב לפי נוסחת Mifflin-St Jeor.</p>
        </>
      ) : (
        <div className="group"><div className="empty" style={{ padding: 18 }}>{problems.join(" · ")}</div></div>
      )}

          <DisplaySection />
      <div className="section-head"><h2 className="section-title">פרופיל</h2></div>
      <div className="group">
        <label className="cell"><span className="grow">שם</span><input id="s-name" className="inline" value={f.name} placeholder="לא חובה" onChange={(e) => set("name", e.target.value)} /></label>
      </div>

      <div className="section-head"><h2 className="section-title">פרטים אישיים</h2></div>
      <div className="group">
        <div className="cell"><span className="grow">מין</span><div style={{ width: 150 }}><Segmented label="מין" options={[["female", "אישה"], ["male", "גבר"]]} value={f.sex} onChange={(v) => set("sex", v)} /></div></div>
        <label className="cell"><span className="grow">תאריך לידה</span><input id="s-birth" className="inline" type="date" max={today} value={f.birthDate} onChange={(e) => set("birthDate", e.target.value)} />{f.birthDate && <span className="sublabel num">({ageAt(f.birthDate, today)})</span>}</label>
        <label className="cell"><span className="grow">גובה</span><input id="s-height" className="inline num" type="number" inputMode="numeric" placeholder="ס״מ" value={f.heightCm} onChange={(e) => set("heightCm", e.target.value)} style={{ width: "5em" }} /><span className="sublabel">ס״מ</span></label>
        <label className="cell">
          <span className="grow">רמת פעילות<div className="sublabel">{ACTIVITY[f.activity]?.hint}</div></span>
          <select id="s-activity" className="inline" value={f.activity} onChange={(e) => set("activity", e.target.value)}>
            {Object.entries(ACTIVITY).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
          </select>
        </label>
      </div>

          {dirty && (
            <div className="savebar">
              <button className="btn filled block" disabled={!canSave || saving} onClick={save}>שמירת השינויים</button>
            </div>
          )}
          <PortionSizes />
          <FoodLibrary />
          <Backup storageKind={storageKind} />
        </>
      )}
      {paceNotice && (
        <Sheet title="הקצב הותאם" onClose={() => setPaceNotice(null)} start={<span />} end={<button className="link" style={{ fontWeight: 600 }} onClick={() => setPaceNotice(null)}>הבנתי</button>}>
          <div className="stack">
            <div className="weigh-hero">
              <div className="weigh-kg num">{fmt(paceNotice.saved, 2)}<small> ק״ג בשבוע</small></div>
              <div className="sublabel">במקום {fmt(paceNotice.asked, 2)} ק״ג בשבוע</div>
            </div>
            <p className="footnote" style={{ margin: "0 4px", fontSize: 15, lineHeight: "20px" }}>
              כדי לרדת {fmt(paceNotice.asked, 2)} ק״ג בשבוע, חלק מהימים היו צריכים יעד נמוך מהמינימום היומי שהגדרת ({fmt(paceNotice.min)} קק״ל). לכן נשמר הקצב המהיר ביותר שלא יורד ממנו. היעדים היומיים ותאריך היעד מחושבים לפיו.
            </p>
            <p className="footnote" style={{ margin: "0 4px" }}>כשהמשקל יירד, ההוצאה היומית תקטן, והקצב יעודכן שוב אם יהיה צורך. אפשר לבחור קצב מהיר יותר אם מורידים את המינימום היומי.</p>
            <button className="btn block gray" onClick={() => setPaceNotice(null)}>הבנתי</button>
          </div>
        </Sheet>
      )}
      {weighIn && <WeightSheet onClose={() => setWeighIn(false)} />}
      {editWeight && <WeightSheet existing={editWeight} onClose={() => setEditWeight(null)} />}
    </>
  );
}

/* ---------- food library ---------- */

/* ---------- display ---------- */

function DisplaySection() {
  const { data } = useStore();
  const [theme, setT] = useState(() => data.prefs?.theme || getTheme());
  const choose = (t) => {
    setT(t);
    setTheme(t).catch((e) => toast(e.message));
  };
  return (
    <>
      <div className="section-head"><h2 className="section-title">תצוגה</h2></div>
      <div className="group" style={{ padding: 12 }}>
        <Segmented label="מצב תצוגה" options={[["system", "לפי המכשיר"], ["light", "בהיר"], ["dark", "כהה"]]} value={theme} onChange={choose} />
      </div>
      <p className="footnote">״לפי המכשיר״ עובר לבד בין בהיר לכהה לפי הגדרות האייפון. הבחירה נשמרת בחשבון שלך.</p>
    </>
  );
}

/* ---------- portion sizes ---------- */

function PortionSizes() {
  const { data } = useStore();
  const list = data.portions || [];
  const [edit, setEdit] = useState(null); // {index, term, value}
  const save = async () => {
    const term = edit.term.trim(), value = edit.value.trim();
    if (!term || !value) return;
    try {
      await mutate((d) => {
        d.portions = (d.portions || []).filter((p, i) => i !== edit.index && norm(p.term) !== norm(term));
        d.portions.push({ term, value, updatedAt: new Date().toISOString() });
      });
      setEdit(null);
    } catch (e) {
      toast(e.message);
    }
  };
  const del = () => mutate((d) => void (d.portions = (d.portions || []).filter((_, i) => i !== edit.index))).then(() => setEdit(null), (e) => toast(e.message));
  return (
    <>
      <div className="section-head"><h2 className="section-title">גדלי המנות שלי</h2></div>
      <div className="group">
        {list.map((p, i) => (
          <button key={p.term} className="cell tap" onClick={() => setEdit({ index: i, term: p.term, value: p.value })}>
            <span className="grow">{p.term}</span>
            <span className="value">{p.value}</span>
            <Icon.chev className="chev" />
          </button>
        ))}
        <button className="cell tap" style={{ color: "var(--tint)" }} onClick={() => setEdit({ index: -1, term: "", value: "" })}>הוספת גודל מנה</button>
      </div>
      <p className="footnote">הניתוח משתמש בגדלים האלה במקום בהנחות הרגילות. אפשר גם להגדיר בתיבת הרישום, למשל ״אצלי כוס זה 200 מ״ל״.</p>
      {edit && (
        <Sheet title={edit.index >= 0 ? "גודל מנה" : "גודל מנה חדש"} onClose={() => setEdit(null)} end={<button className="link" style={{ fontWeight: 600 }} disabled={!edit.term.trim() || !edit.value.trim()} onClick={save}>שמירה</button>}>
          <div className="stack">
            <div className="field-grid">
              <div className="field"><label htmlFor="pt-term">מנה</label><input id="pt-term" placeholder="כוס" value={edit.term} onChange={(e) => setEdit({ ...edit, term: e.target.value })} /></div>
              <div className="field"><label htmlFor="pt-value">גודל</label><input id="pt-value" placeholder="200 מ״ל" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} /></div>
            </div>
            {edit.index >= 0 && <button className="btn block danger" onClick={del}>מחיקה</button>}
          </div>
        </Sheet>
      )}
    </>
  );
}

function FoodLibrary() {
  const { data } = useStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const list = useMemo(() => {
    const nq = norm(q);
    const all = [...data.foods].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    return nq ? all.filter((f) => norm(`${f.name} ${f.brand || ""} ${(f.aliases || []).join(" ")}`).includes(nq)) : all;
  }, [data.foods, q]);
  const SRC = { loseit: "Lose It", log: "מהרישום", manual: "ידני", web: "מהרשת" };
  return (
    <>
      <div className="section-head"><h2 className="section-title">המזונות והמתכונים שלי</h2><span className="sublabel num">{fmt(data.foods.length)}</span></div>
      <div className="group">
        {!open ? (
          <button className="cell tap" onClick={() => setOpen(true)}><span className="grow">הצגה וחיפוש</span><Icon.chev className="chev" /></button>
        ) : (
          <>
            <div className="cell"><div className="search grow"><Icon.search /><input id="food-q" placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} /></div><button className="icon-btn" aria-label="הוספת מזון" onClick={() => setEdit({ id: null, name: "", brand: "", kind: "food", source: "manual", servingAmount: 100, servingUnit: "גרם", servingGrams: 100, calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 })}><Icon.plus /></button></div>
            {list.slice(0, 60).map((f) => (
              <button key={f.id} className="cell tap" onClick={() => setEdit(f)}>
                <div className="grow">
                  <div style={{ overflowWrap: "anywhere" }}>{f.name}{f.brand ? <span className="sublabel"> · {f.brand}</span> : null}</div>
                  <div className="sublabel num">{f.servingAmount} {f.servingUnit} · {fmt(f.calories)} קק״ל · {f.kind === "recipe" ? "מתכון" : "מזון"}{f.portions?.length ? ` · עוד ${fmt(f.portions.length)} ${f.portions.length > 1 ? "גדלים" : "גודל"}` : ""} · {SRC[f.source] || ""}</div>
                </div>
                <Icon.chev className="chev" />
              </button>
            ))}
            {list.length > 60 && <div className="cell sublabel">מוצגים 60 מתוך {fmt(list.length)}. חפשו כדי לצמצם.</div>}
            {!list.length && <div className="empty">אין פריטים{q ? " שמתאימים לחיפוש" : ". הוסיפו ידנית, או ספרו על מזון ברישום והוא יתווסף"}.</div>}
          </>
        )}
      </div>
      {edit && <FoodSheet food={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function FoodSheet({ food, onClose }) {
  const [f, setF] = useState({ ...food, aliasText: (food.aliases || []).join(", "), sizes: (food.portions || []).map((x) => ({ ...x })) });
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const valid = String(f.name).trim() && parseFloat(f.servingAmount) > 0;
  const save = async () => {
    const { aliasText, sizes, ...rest } = f;
    const out = { ...rest, name: f.name.trim(), brand: (f.brand || "").trim(), servingAmount: parseFloat(f.servingAmount), servingGrams: parseFloat(f.servingGrams) || null, updatedAt: new Date().toISOString() };
    const aliases = aliasText.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);
    const portions = sizes.map((x) => ({ unit: String(x.unit || "").trim(), grams: parseFloat(x.grams) || 0 })).filter((x) => x.unit && x.grams > 0);
    if (aliases.length) out.aliases = aliases; else delete out.aliases;
    if (portions.length) out.portions = portions; else delete out.portions;
    for (const k of ["calories", "carbs", "protein", "fat", "fiber"]) out[k] = Math.max(0, parseFloat(f[k]) || 0);
    try {
      await mutate((d) => {
        if (out.id) d.foods = d.foods.map((x) => (x.id === out.id ? out : x));
        else d.foods.push({ ...out, id: newId() });
      });
      onClose();
    } catch (e) {
      toast(e.message);
    }
  };
  const del = () => mutate((d) => void (d.foods = d.foods.filter((x) => x.id !== f.id))).then(onClose, (e) => toast(e.message));
  const NUM = [["calories", "קלוריות"], ["carbs", "פחמימות"], ["protein", "חלבון"], ["fat", "שומן"], ["fiber", "סיבים"]];
  return (
    <Sheet title={f.id ? "עריכת פריט" : "פריט חדש"} onClose={onClose} end={<button className="link" style={{ fontWeight: 600 }} disabled={!valid} onClick={save}>שמירה</button>}>
      <div className="stack">
        <div className="field"><label htmlFor="fd-name">שם</label><input id="fd-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field-grid">
          <div className="field"><label htmlFor="fd-brand">מותג</label><input id="fd-brand" value={f.brand || ""} onChange={(e) => set("brand", e.target.value)} /></div>
          <div className="field"><label htmlFor="fd-kind">סוג</label><select id="fd-kind" value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="food">מזון</option><option value="recipe">מתכון</option></select></div>
          <div className="field"><label htmlFor="fd-amt">כמות במנה</label><input id="fd-amt" type="number" inputMode="decimal" value={f.servingAmount} onChange={(e) => set("servingAmount", e.target.value)} /></div>
          <div className="field"><label htmlFor="fd-unit">יחידה</label><input id="fd-unit" value={f.servingUnit} onChange={(e) => set("servingUnit", e.target.value)} /></div>
          <div className="field"><label htmlFor="fd-g">משקל המנה (ג׳)</label><input id="fd-g" type="number" inputMode="decimal" value={f.servingGrams ?? ""} onChange={(e) => set("servingGrams", e.target.value)} /></div>
          {NUM.map(([k, l]) => <div className="field" key={k}><label htmlFor={"fd-" + k}>{l} למנה</label><input id={"fd-" + k} type="number" inputMode="decimal" value={f[k]} onChange={(e) => set(k, e.target.value)} /></div>)}
        </div>
        <div className="field">
          <label htmlFor="fd-aliases">שמות נוספים</label>
          <input id="fd-aliases" placeholder="למשל: גמבה, פלפל אדום גדול" value={f.aliasText} onChange={(e) => set("aliasText", e.target.value)} />
        </div>
        <p className="footnote" style={{ margin: "-4px 4px 0" }}>שמות אחרים שבהם תכתבו על הפריט, מופרדים בפסיקים. הרישום ימצא אותו גם לפיהם.</p>
        <div className="field">
          <label>גדלים נוספים</label>
          {f.sizes.map((x, i) => (
            <div className="size-row" key={i}>
              <input aria-label="יחידה" placeholder="כף" value={x.unit} onChange={(e) => set("sizes", f.sizes.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)))} />
              <input aria-label="משקל בגרמים" placeholder="גרם" type="number" inputMode="decimal" value={x.grams} onChange={(e) => set("sizes", f.sizes.map((y, j) => (j === i ? { ...y, grams: e.target.value } : y)))} />
              <button className="icon-btn" aria-label={`הסרת ${x.unit || "הגודל"}`} onClick={() => set("sizes", f.sizes.filter((_, j) => j !== i))}><Icon.remove /></button>
            </div>
          ))}
          <div><button className="btn small tinted" onClick={() => set("sizes", [...f.sizes, { unit: "", grams: "" }])}><Icon.plus />הוספת גודל</button></div>
        </div>
        <p className="footnote" style={{ margin: "-4px 4px 0" }}>{f.servingGrams ? "משקל של מנה בגודל אחר (כף, יחידה, פרוסה), כדי שהרישום יחשב אותה מדויק." : "כדי לחשב גדלים נוספים, מלאו גם את משקל המנה."}</p>
        {f.components?.length > 0 && (
          <>
            <div className="section-head" style={{ margin: "8px 16px 0" }}><h3 className="section-title">רכיבים</h3></div>
            <div className="group">
              {f.components.map((c, i) => <div className="cell" key={i}><span className="grow">{c.name}</span><span className="value num">{c.grams ? `${fmt(c.grams)} ג׳` : `${fmt(c.amount)} ${c.unit}`}</span></div>)}
            </div>
          </>
        )}
        {f.id && <button className="btn block danger" onClick={() => setConfirmDel(true)}>מחיקה מהרשימה</button>}
      </div>
      {confirmDel && <ConfirmSheet title="למחוק את הפריט?" message={`"${f.name}" יימחק מהרשימה. רישומים ביומן לא ישתנו.`} confirmLabel="מחיקה" danger onConfirm={del} onClose={() => setConfirmDel(false)} />}
    </Sheet>
  );
}

/* ---------- backup ---------- */

function Backup({ storageKind }) {
  const { data } = useStore();
  const [pending, setPending] = useState(null);
  const [err, setErr] = useState(null);
  const download = async () => {
    const json = JSON.stringify({ app: "calorie-tracker", exportedAt: new Date().toISOString(), ...data }, null, 1);
    const dl = await getDownloads();
    if (!dl) return setErr("ההורדה זמינה רק כשהאפליקציה פתוחה ב-claude.ai.");
    try {
      await dl.save({ filename: `calories-backup-${todayISO()}.json`, data: json });
    } catch (e) {
      if (e?.code !== "declined") setErr("ההורדה לא הצליחה.");
    }
  };
  const pick = async (file) => {
    setErr(null);
    try {
      const j = JSON.parse(await file.text());
      if (j.app !== "calorie-tracker" || !Array.isArray(j.entries)) throw new Error("זה לא קובץ גיבוי של האפליקציה.");
      setPending(j);
    } catch (e) {
      setErr(e instanceof SyntaxError ? "הקובץ פגום." : e.message);
    }
  };
  const restore = () =>
    mutate((d) => {
      const fresh = emptyData();
      for (const k of Object.keys(fresh)) if (pending[k] !== undefined) fresh[k] = pending[k];
      Object.assign(d, fresh);
    }).then(() => toast("הנתונים שוחזרו"), (e) => toast(e.message));
  return (
    <>
      <div className="section-head"><h2 className="section-title">גיבוי</h2></div>
      <div className="group">
        <button className="cell tap" style={{ color: "var(--tint)" }} onClick={download}>הורדת קובץ גיבוי</button>
        <label className="cell tap" style={{ color: "var(--tint)" }} htmlFor="backup-file">
          שחזור מקובץ גיבוי
          <input id="backup-file" type="file" accept=".json,application/json" hidden onChange={(e) => { e.target.files?.[0] && pick(e.target.files[0]); e.target.value = ""; }} />
        </label>
      </div>
      {err && <div className="alert error" style={{ marginTop: 8 }}>{err}</div>}
      <p className="footnote">
        {storageKind === "cloud"
          ? "הנתונים נשמרים בחשבון claude.ai שלך, באזור פרטי שרק לך יש גישה אליו, וזמינים בכל מכשיר."
          : "שימו לב: הנתונים נשמרים כרגע רק בדפדפן הזה. פתחו את האפליקציה ב-claude.ai כשאתם מחוברים כדי לשמור אותם בחשבון."}
      </p>
      {pending && (
        <ConfirmSheet
          title="לשחזר מהגיבוי?"
          message={`הגיבוי מ-${fmtDate(pending.exportedAt.slice(0, 10), true)} יחליף את כל הנתונים הנוכחיים: ${fmt(pending.entries.length)} רישומים, ${fmt((pending.foods || []).length)} מזונות.`}
          confirmLabel="שחזור"
          danger
          onConfirm={restore}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
