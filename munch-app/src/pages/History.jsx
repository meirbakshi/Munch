import { useMemo, useState } from "react";
import {
  KCAL_PER_KG, addDays, computeDays, currentSettings, daysBetween, expectedWeights, firstWeight, fmt, fmtDate, latestWeight,
  macroShares, startDate, todayISO, weightAt, weightTrend,
} from "../calc.js";
import { useStore } from "../store.js";
import { CaloriesChart, Icon, LineChart, MacroChart, Segmented } from "../ui.jsx";

const RANGES = [["7", "שבוע"], ["30", "חודש"], ["90", "3 חודשים"], ["all", "הכול"]];
const VIEWS = [["weight", "משקל"], ["calories", "קלוריות"], ["macros", "הרכב"]];

export default function History({ openDay }) {
  const { data } = useStore();
  const today = todayISO();
  const start = startDate(data);
  const [range, setRange] = useState("30");
  const [view, setView] = useState("weight");
  const [moreDays, setMoreDays] = useState(false);
  const all = useMemo(() => computeDays(data, today), [data, today]);
  const expected = useMemo(() => expectedWeights(data, all), [data, all]);

  if (!start) return null;
  const s = currentSettings(data);
  const from = range === "all" ? start : [start, addDays(today, -(Number(range) - 1))].sort()[1];
  const days = [...all.values()].filter((d) => d.date >= from);
  const dates = days.map((d) => d.date);

  /* ---------- headline numbers ---------- */
  const w0 = firstWeight(data), lw = latestWeight(data);
  const lost = w0 && lw ? w0.kg - lw.kg : 0;
  const toGo = lw ? lw.kg - s.targetWeightKg : 0;
  // "Should weigh now": from the start weight and the energy balance of every logged day up to the last weigh-in
  const expAtLast = lw ? expected.get(lw.date) : null;
  const expNow = expected.get(today);
  const gap = expAtLast != null ? lw.kg - expAtLast : null;

  const trend = weightTrend(data, today); // kg/day
  const planDays = s.weeklyLossKg > 0 && toGo > 0 ? (toGo / s.weeklyLossKg) * 7 : null;
  const trendDays = trend != null && trend < 0 && toGo > 0 ? toGo / -trend : null;
  const logged = days.filter((d) => d.logged && d.date < today);
  const avgEaten = logged.length ? logged.reduce((a, d) => a + d.eaten, 0) / logged.length : null;
  const avgFood = logged.length ? logged.reduce((a, d) => a + d.food, 0) / logged.length : null;
  const totalBurned = days.reduce((a, d) => a + (d.logged ? d.burned : 0), 0);
  const avgDeficit = logged.length ? logged.reduce((a, d) => a + (d.tdee - d.eaten), 0) / logged.length : null;
  const eatDays = avgDeficit > 0 && toGo > 0 ? toGo / (avgDeficit / KCAL_PER_KG) : null;
  const onTarget = logged.filter((d) => d.eaten <= d.target).length;
  let streak = 0;
  for (let d = all.get(today)?.logged ? today : addDays(today, -1); all.get(d)?.logged; d = addDays(d, -1)) streak++;
  const reached = toGo <= 0;

  /* ---------- chart data ---------- */
  const actual = dates.map((d) => data.weights.find((w) => w.date === d)?.kg ?? null);
  const expSeries = dates.map((d) => {
    const v = expected.get(d);
    return v == null ? null : Math.round(v * 10) / 10;
  });
  const targetLine = dates.map(() => s.targetWeightKg);
  const showTarget = toGo < 3; // only when the target is near enough not to flatten the chart
  const macroDays = days.map((d) => ({ ...d, shares: d.logged ? macroShares(d.totals) : null }));
  const totalsInRange = logged.reduce((a, d) => ({ carbs: a.carbs + d.totals.carbs, protein: a.protein + d.totals.protein, fat: a.fat + d.totals.fat, fiber: a.fiber + d.totals.fiber }), { carbs: 0, protein: 0, fat: 0, fiber: 0 });
  const avgShares = macroShares(totalsInRange);

  return (
    <>
      <div className="nav-row" />
      <h1 className="large-title">התקדמות</h1>
      <p className="subtitle">מאז {fmtDate(start, true)} · {daysBetween(start, today) + 1} ימים</p>

      <div className="tiles">
        <div className="tile">
          <span className="k">ירדת עד עכשיו</span>
          <span className="v num">{fmt(lost, 1)}<small>ק״ג</small></span>
          <span className="d num">{fmt(w0?.kg, 1)} → {fmt(lw?.kg, 1)}</span>
        </div>
        <div className="tile">
          <span className="k">{reached ? "הגעת ליעד!" : "נותרו ליעד"}</span>
          <span className={`v num ${reached ? "good" : ""}`}>{reached ? fmt(s.targetWeightKg, 1) : fmt(toGo, 1)}<small>ק״ג</small></span>
          <span className="d num">יעד {fmt(s.targetWeightKg, 1)} ק״ג</span>
        </div>
        <div className="tile wide">
          <span className="k">כמה &quot;אמור&quot; הייתי לשקול</span>
          {expAtLast != null ? (
            <>
              <span className="v num">{fmt(expAtLast, 1)}<small>ק״ג לפי הרישומים · בפועל {fmt(lw.kg, 1)}</small></span>
              <span className="d">
                ב{fmtDate(lw.date)} (השקילה האחרונה).{" "}
                {Math.abs(gap) < 0.3 ? <span className="good">המשקל בפועל תואם את הרישומים.</span> : gap > 0 ? <span>המשקל בפועל גבוה ב-{fmt(gap, 1)} ק״ג מהצפוי: אולי חסרים רישומים, או שההערכה של ההוצאה היומית גבוהה מדי. תנודות של מים נפוצות.</span> : <span className="good">המשקל בפועל נמוך ב-{fmt(-gap, 1)} ק״ג מהצפוי.</span>}
                {expNow != null && lw.date !== today && <> לפי הרישומים עד היום: {fmt(expNow, 1)} ק״ג.</>}
              </span>
            </>
          ) : <span className="d">יופיע אחרי השקילה הראשונה.</span>}
        </div>
        <div className="tile wide">
          <span className="k">מתי אגיע ליעד</span>
          {reached ? <span className="v good">כבר הגעת</span> : (
            <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
              <ProjRow label="לפי התוכנית" days={planDays} hint={`${fmt(s.weeklyLossKg, 2)} ק״ג בשבוע`} />
              <ProjRow label="לפי השקילות" days={trendDays} hint={trend != null ? `${fmt(-trend * 7, 2)} ק״ג בשבוע ב-4 השבועות האחרונים` : "צריך שקילות לאורך שבוע לפחות"} />
              <ProjRow label="לפי מה שאכלת" days={eatDays} hint={avgDeficit != null ? `גירעון ממוצע ${fmt(avgDeficit)} קק״ל ביום בטווח שנבחר` : "אין עדיין ימים רשומים"} />
            </div>
          )}
        </div>
      </div>

      <div className="section-head"><h2 className="section-title strong">גרפים</h2></div>
      <div className="stack">
        <Segmented label="טווח" options={RANGES} value={range} onChange={setRange} />
        <Segmented label="תצוגה" options={VIEWS} value={view} onChange={setView} />
        {view === "weight" && (
          <div className="chart-card">
            <div className="chart-head"><span className="big num">{fmt(lw?.kg, 1)} ק״ג</span><span className="cap">בפועל מול הצפוי לפי הרישומים</span></div>
            <LineChart
              label="משקל בפועל מול צפוי"
              dates={dates}
              series={[
                { name: "בפועל", color: "var(--carbs)", values: fillGaps(actual), dots: actual },
                { name: "צפוי לפי הרישומים", color: "var(--protein)", values: expSeries, dash: true },
                ...(showTarget ? [{ name: "יעד", color: "var(--label-3)", values: targetLine }] : []),
              ]}
            />
            {!actual.some((v) => v != null) && <div className="sublabel" style={{ padding: "0 4px" }}>אין שקילות בטווח הזה.</div>}
          </div>
        )}
        {view === "calories" && (
          <div className="chart-card">
            <div className="chart-head"><span className="big num">{avgEaten != null ? fmt(avgEaten) : "–"} קק״ל</span><span className="cap">ממוצע נטו ליום רשום · {onTarget}/{logged.length} ימים בתוך היעד</span></div>
            <CaloriesChart days={days} />
            <div className="legend">
              <span><i className="box" style={{ background: "var(--tint)" }} />נאכל פחות פעילות</span>
              <span><i className="box" style={{ background: "var(--over)" }} />מעל היעד</span>
              <span style={{ color: "var(--label-2)" }}><i className="dash" style={{ color: "var(--label)" }} />יעד יומי</span>
            </div>
          </div>
        )}
        {view === "macros" && (
          <div className="chart-card">
            <div className="chart-head"><span className="big">הרכב התזונה</span><span className="cap">אחוז מהאנרגיה, לכל יום רשום</span></div>
            <div style={{ padding: "0 4px", display: "grid", gap: 6 }}>
              <div className="split" aria-label="ממוצע לתקופה">
                {["carbs", "protein", "fat", "fiber"].map((k) => <span key={k} style={{ width: `${avgShares[k]}%`, background: `var(--${k})` }} />)}
              </div>
              <div className="sublabel num">ממוצע לתקופה: פחמימות {fmt(avgShares.carbs)}% · חלבון {fmt(avgShares.protein)}% · שומן {fmt(avgShares.fat)}% · סיבים {fmt(avgShares.fiber)}%</div>
            </div>
            <MacroChart days={macroDays} />
          </div>
        )}
      </div>

      <div className="section-head"><h2 className="section-title strong">נתונים</h2></div>
      <div className="group">
        <div className="cell"><span className="grow">ימים ברצף עם רישום</span><span className="value num">{streak}</span></div>
        <div className="cell"><span className="grow">ימים רשומים בטווח</span><span className="value num">{logged.length} מתוך {days.filter((d) => d.date < today).length}</span></div>
        <div className="cell"><span className="grow">ממוצע קלוריות מאוכל ליום</span><span className="value num">{fmt(avgFood)}</span></div>
        <div className="cell"><span className="grow">נשרף בפעילות בטווח</span><span className="value num">{fmt(totalBurned)} קק״ל</span></div>
        <div className="cell"><span className="grow">ממוצע חלבון ליום</span><span className="value num">{logged.length ? fmt(totalsInRange.protein / logged.length) : "–"} ג׳</span></div>
        <div className="cell"><span className="grow">ממוצע סיבים ליום</span><span className="value num">{logged.length ? fmt(totalsInRange.fiber / logged.length) : "–"} ג׳</span></div>
        <div className="cell"><span className="grow">גירעון מצטבר מהרישומים</span><span className="value num">{fmt(logged.reduce((a, d) => a + d.tdee - d.eaten, 0))} קק״ל</span></div>
      </div>

      <div className="section-head"><h2 className="section-title strong">ימים</h2></div>
      <div className="group">
        {days.slice().reverse().slice(0, moreDays ? 92 : 10).map((d) => (
          <button key={d.date} className="cell tap" onClick={() => openDay(d.date)}>
            <div className="grow">
              <div>{fmtDate(d.date)}{d.date === today ? " · היום" : ""}</div>
              <div className="sublabel num">{d.logged ? `${fmt(d.eaten)} מתוך ${fmt(d.target)} קק״ל${d.burned ? ` · פעילות ${fmt(d.burned)}` : ""}` : `לא נרשם · יעד ${fmt(d.target)}`}{weightAt(data, d.date) && data.weights.some((w) => w.date === d.date) ? ` · נשקלת ${fmt(weightAt(data, d.date), 1)}` : ""}</div>
            </div>
            {d.logged && <span dir="ltr" className={`num ${d.eaten > d.target ? "bad" : "good"}`} style={{ fontWeight: 600, fontSize: 15 }}>{d.eaten > d.target ? "+" : "−"}{fmt(Math.abs(d.target - d.eaten))}</span>}
            <Icon.chev className="chev" />
          </button>
        ))}
      </div>
      {days.length > 10 && <button className="link" style={{ margin: "6px 16px" }} onClick={() => setMoreDays(!moreDays)}>{moreDays ? "פחות ימים" : "ימים נוספים"}</button>}
      {moreDays && days.length > 92 && <p className="footnote">מוצגים 92 הימים האחרונים בטווח. לימים מוקדמים יותר אפשר לעבור ביומן.</p>}
    </>
  );
}

function ProjRow({ label, days, hint }) {
  const today = todayISO();
  return (
    <div className="row-gap" style={{ justifyContent: "space-between", alignItems: "baseline", flexWrap: "nowrap" }}>
      <span style={{ fontSize: 15, minWidth: 0 }}>{label}<div className="sublabel">{hint}</div></span>
      <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{days != null && days < 3650 ? fmtDate(addDays(today, Math.ceil(days)), true) : "–"}</span>
    </div>
  );
}

/** Connect weigh-ins across days without one (a line through the dots). */
function fillGaps(values) {
  const out = [...values];
  let last = -1;
  for (let i = 0; i < out.length; i++) {
    if (values[i] == null) continue;
    if (last >= 0 && i - last > 1) for (let k = last + 1; k < i; k++) out[k] = values[last] + ((values[i] - values[last]) * (k - last)) / (i - last);
    last = i;
  }
  return out;
}
