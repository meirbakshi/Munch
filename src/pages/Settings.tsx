import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Activity, Food, FoodSource, Profile, Sex } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useStore } from "../store.tsx";
import { ACTIVITY, goalPlan, weekPlan } from "../lib/budget.ts";
import { addDays, DAY_NAMES, todayISO } from "../lib/dates.ts";
import { fmt } from "../lib/nutrition.ts";
import { requestPersistence } from "../lib/localdb.ts";
import { buildFoods, FIELD_LABELS, guessMapping, readCsv, type CsvData, type Field, type Mapping } from "../lib/loseit.ts";

function defaults(): Profile {
  return {
    name: "",
    sex: "female",
    birthDate: "1990-01-01",
    heightCm: 165,
    activity: "light",
    currentWeightKg: 70,
    targetWeightKg: 65,
    targetDate: addDays(todayISO(), 120),
    highDays: [5, 6],
    highDayBoostPct: 20,
    weekStartsOn: 0,
    minCalories: 1200,
  };
}

export default function Settings() {
  const { state } = useStore();
  return (
    <main>
      {!state!.profile && (
        <div className="alert info">ברוכים הבאים! מלאו את הפרופיל והיעד כדי לחשב את התקציב היומי שלכם.</div>
      )}
      <ProfileForm />
      <ApiKeyCard />
      <ImportCard />
      <LibraryCard />
      <BackupCard />
    </main>
  );
}

function ProfileForm() {
  const { state, refresh } = useStore();
  const navigate = useNavigate();
  const [p, setP] = useState<Profile>(state!.profile ?? defaults());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setP({ ...p, [k]: v });
    setSaved(false);
  };
  const valid = p.heightCm > 0 && p.currentWeightKg > 0 && p.targetWeightKg > 0 && !!p.birthDate && !!p.targetDate;
  const plan = useMemo(() => (valid ? goalPlan(p) : null), [p, valid]);
  const week = useMemo(() => (valid ? weekPlan(p, todayISO(), {}) : null), [p, valid]);

  async function save() {
    setSaving(true);
    try {
      const prev = state!.profile;
      await api.saveProfile(p);
      if (!prev || prev.currentWeightKg !== p.currentWeightKg) await api.logWeight(todayISO(), p.currentWeightKg);
      await refresh();
      setSaved(true);
      if (!prev) navigate("/");
    } finally {
      setSaving(false);
    }
  }

  const numField = (label: string, k: "heightCm" | "currentWeightKg" | "targetWeightKg" | "highDayBoostPct" | "minCalories", step = "0.1") => (
    <label className="field">
      {label}
      <input type="number" step={step} value={p[k] || ""} onChange={(e) => set(k, Number(e.target.value))} />
    </label>
  );

  return (
    <>
      <section className="card">
        <div className="card-head"><h2>פרופיל</h2></div>
        <div className="form-grid">
          <label className="field">
            שם
            <input type="text" value={p.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="field">
            מין (לחישוב חילוף חומרים)
            <select value={p.sex} onChange={(e) => set("sex", e.target.value as Sex)}>
              <option value="female">אישה</option>
              <option value="male">גבר</option>
            </select>
          </label>
          <label className="field">
            תאריך לידה
            <input type="date" value={p.birthDate} max={todayISO()} onChange={(e) => set("birthDate", e.target.value)} />
          </label>
          {numField("גובה (ס״מ)", "heightCm", "1")}
          <label className="field" style={{ gridColumn: "span 2" }}>
            רמת פעילות
            <select value={p.activity} onChange={(e) => set("activity", e.target.value as Activity)}>
              {Object.entries(ACTIVITY).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>היעד שלי</h2></div>
        <div className="form-grid">
          {numField("משקל נוכחי (ק״ג)", "currentWeightKg")}
          {numField("משקל יעד (ק״ג)", "targetWeightKg")}
          <label className="field">
            תאריך יעד
            <input type="date" value={p.targetDate} min={addDays(todayISO(), 1)} onChange={(e) => set("targetDate", e.target.value)} />
          </label>
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <div className="sub">ימים עם צריכה גבוהה יותר</div>
          <div className="chips">
            {DAY_NAMES.map((n, i) => (
              <button
                key={i}
                className={`chip ${p.highDays.includes(i) ? "on" : ""}`}
                onClick={() => set("highDays", p.highDays.includes(i) ? p.highDays.filter((d) => d !== i) : [...p.highDays, i].sort())}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          {numField("תוספת לימים מוגברים (%)", "highDayBoostPct", "1")}
          {numField("מינימום יומי (קק״ל)", "minCalories", "10")}
          <label className="field">
            השבוע מתחיל ביום
            <select value={p.weekStartsOn} onChange={(e) => set("weekStartsOn", Number(e.target.value))}>
              <option value={0}>ראשון</option>
              <option value={1}>שני</option>
              <option value={6}>שבת</option>
            </select>
          </label>
        </div>

        {plan && week && (
          <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
            <div className="grid-4">
              <div className="stat"><div className="label">חילוף חומרים בסיסי</div><div className="value num">{fmt(plan.bmr)}</div></div>
              <div className="stat"><div className="label">הוצאה יומית משוערת</div><div className="value num">{fmt(plan.tdee)}</div></div>
              <div className="stat"><div className="label">ממוצע יומי מותר</div><div className="value num" style={{ color: "var(--accent)" }}>{fmt(plan.base)}</div></div>
              <div className="stat">
                <div className="label">{plan.weeklyKgChange >= 0 ? "ירידה צפויה בשבוע" : "עלייה צפויה בשבוע"}</div>
                <div className="value num">{fmt(Math.abs(plan.weeklyKgChange), 2)} ק״ג</div>
              </div>
            </div>
            <div className="week">
              {week.days.map((d) => (
                <div key={d.date} className="wday">
                  <div className="d">{DAY_NAMES[d.dow]}</div>
                  <div className="num">{fmt(d.planned)}</div>
                  {d.high && <div className="high">מוגבר</div>}
                </div>
              ))}
            </div>
            <div className="muted small">
              תקציב שבועי {fmt(plan.weeklyBudget)} קק״ל · עוד {plan.daysLeft} ימים ליעד · חישוב לפי נוסחת Mifflin–St Jeor ו-7,700 קק״ל לק״ג
            </div>
            {plan.warnings.map((w) => (
              <div key={w} className="alert warn">{w}</div>
            ))}
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          {saved && <span className="sub">נשמר ✓</span>}
          <button className="btn primary" disabled={!valid || saving} onClick={save}>שמירה</button>
        </div>
      </section>
    </>
  );
}

const MAP_FIELDS: Field[] = ["name", "brand", "group", "servings", "servingAmount", "servingUnit", "servingGrams", "calories", "carbs", "protein", "fat", "fiber", "deleted"];

function ImportCard() {
  const { refresh } = useStore();
  const [source, setSource] = useState<FoodSource>("loseit-food");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState<CsvData | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [replace, setReplace] = useState(true);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const foods = useMemo(() => (csv && mapping.name ? buildFoods(csv, mapping, source).filter((f) => f.name) : []), [csv, mapping, source]);

  async function onFile(file: File) {
    setMsg(null);
    setFileName(file.name);
    const data = readCsv(await file.text());
    if (!data.headers.length) {
      setMsg({ kind: "error", text: "לא הצלחתי לקרוא את הקובץ כ-CSV." });
      return;
    }
    setCsv(data);
    const m = guessMapping(data.headers);
    setMapping(m);
    if (/recipe/i.test(file.name) || m.group) setSource("loseit-recipe");
  }

  async function doImport() {
    setBusy(true);
    try {
      const res = await api.importFoods(foods, replace ? source : undefined);
      setMsg({ kind: "info", text: `יובאו ${res.imported} פריטים. ברשימה יש עכשיו ${res.total} פריטים.` });
      setCsv(null);
      setFileName("");
      await refresh();
      window.dispatchEvent(new Event("foods-changed"));
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>ייבוא מ-Lose It</h2>
        <span className="sub small">קובצי CSV של מזונות מותאמים ומתכונים</span>
      </div>
      <div className="row">
        <div className="chips">
          <button className={`chip ${source === "loseit-food" ? "on" : ""}`} onClick={() => setSource("loseit-food")}>מזונות מותאמים</button>
          <button className={`chip ${source === "loseit-recipe" ? "on" : ""}`} onClick={() => setSource("loseit-recipe")}>מתכונים</button>
        </div>
        <label className="btn">
          בחירת קובץ CSV
          <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {fileName && <span className="sub small">{fileName} · {csv?.rows.length ?? 0} שורות</span>}
      </div>

      {csv && (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <div className="sub small">
            זיהיתי את העמודות אוטומטית — בדקו והתאימו במידת הצורך. למתכון שמופיע כשורת רכיב לכל שורה, בחרו את עמודת ״שם מתכון״ והרכיבים יסוכמו למנה אחת.
          </div>
          <div className="form-grid">
            {MAP_FIELDS.map((f) => (
              <label key={f} className="field">
                {FIELD_LABELS[f]}
                <select value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value || undefined })}>
                  <option value="">—</option>
                  {csv.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div>
            <div className="spread" style={{ marginBottom: 6 }}>
              <h3>תצוגה מקדימה</h3>
              <span className="sub small">{foods.length} פריטים</span>
            </div>
            <div className="table-wrap">
              <table className="items">
                <thead>
                  <tr><th>שם</th><th>מנה</th><th>קק״ל</th><th>פחמ׳</th><th>חלבון</th><th>שומן</th><th>סיבים</th></tr>
                </thead>
                <tbody>
                  {foods.slice(0, 6).map((f, i) => (
                    <tr key={i}>
                      <td>{f.name}{f.brand ? <span className="muted"> · {f.brand}</span> : null}</td>
                      <td className="num">{fmt(f.servingAmount, 2)} {f.servingUnit}{f.servingGrams ? ` (${fmt(f.servingGrams)} ג׳)` : ""}</td>
                      <td className="num">{fmt(f.calories)}</td>
                      <td className="num">{fmt(f.carbs, 1)}</td>
                      <td className="num">{fmt(f.protein, 1)}</td>
                      <td className="num">{fmt(f.fat, 1)}</td>
                      <td className="num">{fmt(f.fiber, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="spread">
            <label className="row small sub">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              להחליף ייבוא קודם של {source === "loseit-recipe" ? "מתכונים" : "מזונות מותאמים"}
            </label>
            <div className="row">
              <button className="btn ghost" onClick={() => setCsv(null)}>ביטול</button>
              <button className="btn primary" disabled={!foods.length || busy} onClick={doImport}>ייבוא {foods.length} פריטים</button>
            </div>
          </div>
        </div>
      )}
      {msg && <div className={`alert ${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}
    </section>
  );
}

function LibraryCard() {
  const { state, refresh } = useStore();
  const [foods, setFoods] = useState<Food[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    const load = () => void api.foods().then(setFoods);
    load();
    window.addEventListener("foods-changed", load);
    return () => window.removeEventListener("foods-changed", load);
  }, []);

  const shown = foods.filter((f) => !q || `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  async function remove(id: string) {
    await api.deleteFood(id);
    setFoods(foods.filter((f) => f.id !== id));
    await refresh();
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>המזונות והמתכונים שלי</h2>
        <span className="sub">{state!.foodsCount} פריטים</span>
      </div>
      {foods.length === 0 ? (
        <div className="empty">אין עדיין פריטים. ייבאו קובץ מ-Lose It כדי שהרישום יכיר את המזונות שלכם.</div>
      ) : (
        <>
          <input type="text" placeholder="חיפוש…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div className="list-scroll">
            <table className="items">
              <thead>
                <tr><th>שם</th><th>סוג</th><th>מנה</th><th>קק״ל</th><th>פחמ׳</th><th>חלבון</th><th>שומן</th><th>סיבים</th><th /></tr>
              </thead>
              <tbody>
                {shown.slice(0, 300).map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}{f.brand ? <span className="muted"> · {f.brand}</span> : null}</td>
                    <td><span className="badge">{f.source === "loseit-recipe" ? "מתכון" : f.source === "manual" ? "ידני" : "מזון"}</span></td>
                    <td className="num">{fmt(f.servingAmount, 2)} {f.servingUnit}</td>
                    <td className="num">{fmt(f.calories)}</td>
                    <td className="num muted">{fmt(f.carbs, 1)}</td>
                    <td className="num muted">{fmt(f.protein, 1)}</td>
                    <td className="num muted">{fmt(f.fat, 1)}</td>
                    <td className="num muted">{fmt(f.fiber, 1)}</td>
                    <td><button className="btn ghost icon danger" title="מחיקה" onClick={() => remove(f.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function ApiKeyCard() {
  const { state } = useStore();
  if (state!.ai === "claude") {
    return (
      <section className="card">
        <div className="card-head">
          <h2>ניתוח עם Claude</h2>
          <span className="sub small">פעיל ✓</span>
        </div>
        <div className="sub small">
          הניתוח רץ דרך חשבון Claude שלך, בלי מפתח API. בפעם הראשונה הדף יבקש אישור. Claude מחפש ברשימת המזונות שלך, ולשאר המזונות משתמש בערכים תזונתיים מוכרים (בלי חיפוש ברשת), אז כדאי לבדוק מוצרים ממותגים.
        </div>
      </section>
    );
  }
  return <ApiKeyForm />;
}

function ApiKeyForm() {
  const { state, refresh } = useStore();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.apiKey().then(setKey);
  }, []);

  async function save() {
    await api.setApiKey(key);
    await refresh();
    setSaved(true);
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>מפתח Claude API</h2>
        <span className="sub small">{state!.aiEnabled ? "מוגדר ✓" : "לא מוגדר"}</span>
      </div>
      <div className="sub small" style={{ marginBottom: 10 }}>
        נדרש לניתוח הרישום החופשי. המפתח נשמר רק בדפדפן הזה ונשלח רק ל-Anthropic. אפשר ליצור מפתח ב-console.anthropic.com, ומומלץ להגדיר לו מגבלת הוצאה חודשית.
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input
          type={show ? "text" : "password"}
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-..."
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setSaved(false);
          }}
        />
        <button className="btn ghost" onClick={() => setShow(!show)}>{show ? "הסתרה" : "הצגה"}</button>
        <button className="btn primary" onClick={save}>שמירה</button>
      </div>
      {saved && <div className="sub small" style={{ marginTop: 8 }}>נשמר ✓</div>}
    </section>
  );
}

function BackupCard() {
  const { state, refresh } = useStore();
  const cloud = state!.storage === "cloud";
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!cloud) void requestPersistence().then(setPersisted);
  }, [cloud]);

  async function download() {
    try {
      await api.downloadBackup(`munch-backup-${todayISO()}.json`);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== "declined" && code !== "cancelled") setMsg({ kind: "error", text: "ההורדה לא הצליחה." });
    }
  }

  async function restore(file: File) {
    if (!confirm(cloud ? "שחזור מגיבוי יחליף את כל הנתונים שלך. להמשיך?" : "שחזור מגיבוי יחליף את כל הנתונים במכשיר הזה. להמשיך?")) return;
    try {
      await api.importBackup(await file.text());
      await refresh();
      window.dispatchEvent(new Event("foods-changed"));
      setMsg({ kind: "info", text: "הנתונים שוחזרו." });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof SyntaxError ? "הקובץ לא תקין." : (e as Error).message });
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>גיבוי</h2>
      </div>
      <div className="sub small" style={{ marginBottom: 12 }}>
        {cloud ? (
          <>הנתונים נשמרים בחשבון claude.ai שלך, באזור פרטי שרק את/ה רואה, וזמינים מכל מכשיר. כדי להעביר נתונים מגרסת GitHub Pages: הורידו שם גיבוי ושחזרו אותו כאן.</>
        ) : (
          <>
            כל הנתונים נשמרים רק בדפדפן הזה. כדאי להוריד גיבוי מדי פעם — הוא מאפשר גם להעביר את הנתונים למכשיר אחר.
            {persisted === false && " הדפדפן לא אישר אחסון קבוע, ולכן חשוב במיוחד לגבות."}
          </>
        )}
      </div>
      <div className="row">
        <button className="btn" onClick={download}>הורדת גיבוי</button>
        <label className="btn">
          שחזור מגיבוי
          <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        </label>
      </div>
      {msg && <div className={`alert ${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}
    </section>
  );
}
