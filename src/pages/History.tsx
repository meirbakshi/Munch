import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Entry, Nutrients } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useStore } from "../store.tsx";
import { weekPlan } from "../lib/budget.ts";
import { addDays, daysBetween, formatLong, formatShort, todayISO, weekStart } from "../lib/dates.ts";
import { fmt, macroPercents, MACROS, sum } from "../lib/nutrition.ts";

const RANGES = [
  { days: 7, label: "שבוע" },
  { days: 30, label: "30 יום" },
  { days: 90, label: "3 חודשים" },
];

interface DayRow extends Nutrients {
  date: string;
  target: number;
  logged: boolean;
  count: number;
}

export default function History() {
  const { state, refresh } = useStore();
  const profile = state!.profile!;
  const navigate = useNavigate();
  const today = todayISO();
  const [range, setRange] = useState(30);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const from = addDays(today, -(range - 1));
  const fetchFrom = weekStart(from, profile.weekStartsOn);

  useEffect(() => {
    setLoading(true);
    void api.entries(fetchFrom, today).then((e) => {
      setEntries(e);
      setLoading(false);
    });
  }, [fetchFrom, today]);

  const days: DayRow[] = useMemo(() => {
    const byDate = new Map<string, Entry[]>();
    for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
    const kcal: Record<string, number> = {};
    for (const [d, es] of byDate) kcal[d] = sum(es).calories;
    const targets: Record<string, number> = {};
    for (let ws = fetchFrom; ws <= today; ws = addDays(ws, 7)) {
      for (const d of weekPlan(profile, ws, kcal, today).days) targets[d.date] = d.target;
    }
    return Array.from({ length: range }, (_, i) => {
      const date = addDays(from, i);
      const es = byDate.get(date) ?? [];
      return { date, ...sum(es), target: targets[date] ?? 0, logged: es.length > 0, count: es.length };
    });
  }, [entries, profile, range, from, fetchFrom, today]);

  const logged = days.filter((d) => d.logged);
  const avg = logged.length ? sum(logged).calories / logged.length : 0;
  const onTarget = logged.filter((d) => d.calories <= d.target).length;
  const macroPct = macroPercents(sum(logged));

  const weights = state!.weights;
  const weightsInRange = weights.filter((w) => w.date >= from);
  const firstW = weightsInRange[0] ?? weights.filter((w) => w.date < from).at(-1);
  const lastW = weights.at(-1);
  const change = firstW && lastW ? lastW.kg - firstW.kg : null;

  // Weekly summaries (newest first)
  const weeks = useMemo(() => {
    const out: { start: string; budget: number; consumed: number; loggedDays: number }[] = [];
    const kcal: Record<string, number> = {};
    for (const e of entries) kcal[e.date] = (kcal[e.date] ?? 0) + e.calories;
    for (let ws = fetchFrom; ws <= today; ws = addDays(ws, 7)) {
      const wp = weekPlan(profile, ws, kcal, today);
      const loggedDays = wp.days.filter((d) => d.logged).length;
      if (!loggedDays) continue;
      out.push({ start: ws, budget: wp.weeklyBudget, consumed: wp.days.reduce((a, d) => a + d.consumed, 0), loggedDays });
    }
    return out.reverse();
  }, [entries, profile, fetchFrom, today]);

  const [wDate, setWDate] = useState(today);
  const [wKg, setWKg] = useState<number | "">("");
  async function addWeight() {
    if (!wKg) return;
    await api.logWeight(wDate, wKg);
    const latest = [...weights.filter((w) => w.date !== wDate), { date: wDate, kg: wKg }].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
    if (latest.date === wDate) await api.saveProfile({ ...profile, currentWeightKg: wKg });
    setWKg("");
    await refresh();
  }

  const chartData = days.map((d) => ({ ...d, label: formatShort(d.date) }));
  const weightData = weightsInRange.map((w) => ({ ...w, label: formatShort(w.date) }));

  return (
    <main>
      <div className="spread">
        <h1 className="serif">היסטוריה והתקדמות</h1>
        <div className="chips">
          {RANGES.map((r) => (
            <button key={r.days} className={`chip ${range === r.days ? "on" : ""}`} onClick={() => setRange(r.days)}>{r.label}</button>
          ))}
        </div>
      </div>

      <section className="grid-4">
        <div className="card stat"><div className="label">ממוצע יומי</div><div className="value num">{fmt(avg)}</div><div className="muted small">קק״ל, בימים עם רישום</div></div>
        <div className="card stat"><div className="label">ימים ביעד</div><div className="value num">{onTarget}/{logged.length}</div><div className="muted small">מתוך הימים שנרשמו</div></div>
        <div className="card stat">
          <div className="label">שינוי במשקל</div>
          <div className="value num">{change === null ? "—" : `${change > 0 ? "+" : change < 0 ? "−" : ""}${fmt(Math.abs(change), 1)}`}</div>
          <div className="muted small">ק״ג בתקופה</div>
        </div>
        <div className="card stat">
          <div className="label">נותר ליעד</div>
          <div className="value num">{fmt(Math.abs(profile.currentWeightKg - profile.targetWeightKg), 1)}</div>
          <div className="muted small">ק״ג · עוד {Math.max(0, daysBetween(today, profile.targetDate))} ימים</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>קלוריות מול יעד</h2>
          <div className="legend">
            <span><i className="box" style={{ background: "var(--accent)" }} />בתוך היעד</span>
            <span><i className="box" style={{ background: "var(--danger)" }} />מעל היעד</span>
            <span><i style={{ background: "var(--text-2)" }} />יעד יומי</span>
          </div>
        </div>
        {loading ? (
          <div className="empty"><span className="spinner" style={{ display: "inline-block" }} /></div>
        ) : (
          <div className="chart">
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={(e) => {
                const d = (e as { activeLabel?: string; activeTooltipIndex?: number }).activeTooltipIndex;
                if (typeof d === "number" && chartData[d]) navigate(`/?date=${chartData[d].date}`);
              }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={16} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as DayRow;
                  return (
                    <div className="tooltip">
                      <div style={{ fontWeight: 600 }}>{formatLong(d.date)}</div>
                      {d.logged ? <div className="num">{fmt(d.calories)} מתוך {fmt(d.target)} קק״ל</div> : <div className="muted">לא נרשם · יעד {fmt(d.target)}</div>}
                    </div>
                  );
                }} />
                <Bar dataKey="calories" radius={[4, 4, 0, 0]} maxBarSize={22} style={{ cursor: "pointer" }}>
                  {chartData.map((d) => (
                    <Cell key={d.date} fill={d.calories > d.target ? "var(--danger)" : "var(--accent)"} />
                  ))}
                </Bar>
                <Line type="stepAfter" dataKey="target" stroke="var(--text-2)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>משקל</h2><span className="sub small">יעד: {fmt(profile.targetWeightKg, 1)} ק״ג</span></div>
          {weightData.length > 1 ? (
            <div className="chart" style={{ height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={weightData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  <ReferenceLine y={profile.targetWeightKg} stroke="var(--accent)" strokeDasharray="4 3" />
                  <Tooltip content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="tooltip">{formatShort((payload[0].payload as { date: string }).date)} · <span className="num">{fmt(payload[0].value as number, 1)} ק״ג</span></div>
                    ) : null
                  } />
                  <Line type="monotone" dataKey="kg" stroke="var(--carbs)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty">שקילה אחת או יותר נוספות יציגו כאן גרף.</div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <input type="date" value={wDate} max={today} onChange={(e) => setWDate(e.target.value)} style={{ width: "auto" }} />
            <input type="number" step="0.1" placeholder="ק״ג" value={wKg} onChange={(e) => setWKg(e.target.value ? Number(e.target.value) : "")} style={{ width: 90 }} />
            <button className="btn" disabled={!wKg} onClick={addWeight}>רישום שקילה</button>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>התפלגות רכיבים</h2><span className="sub small">% מהקלוריות בתקופה</span></div>
          {logged.length ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div className="stacked">
                {MACROS.filter((m) => m.key !== "fiber").map((m) => (
                  <span key={m.key} style={{ width: `${macroPct[m.key]}%`, background: m.color }} />
                ))}
              </div>
              {MACROS.map((m) => {
                const avgG = sum(logged)[m.key] / logged.length;
                return (
                  <div key={m.key} className="spread">
                    <span className="row"><span className="dot" style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, display: "inline-block" }} />{m.label}</span>
                    <span className="num">{fmt(avgG, 1)} ג׳ ביום · <b>{fmt(macroPct[m.key])}%</b></span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty">אין עדיין נתונים בתקופה.</div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>סיכום שבועי</h2></div>
        {weeks.length ? (
          <div className="table-wrap">
            <table className="items">
              <thead><tr><th>שבוע</th><th>ימים שנרשמו</th><th>נאכל</th><th>תקציב</th><th>הפרש</th></tr></thead>
              <tbody>
                {weeks.map((w) => {
                  const diff = w.consumed - w.budget;
                  const partial = w.start > addDays(today, -6);
                  return (
                    <tr key={w.start}>
                      <td>{formatShort(w.start)}–{formatShort(addDays(w.start, 6))}{partial && <span className="muted"> (נוכחי)</span>}</td>
                      <td className="num">{w.loggedDays}/7</td>
                      <td className="num">{fmt(w.consumed)}</td>
                      <td className="num">{fmt(w.budget)}</td>
                      <td className="num" style={{ color: partial ? "var(--text-2)" : diff > 0 ? "var(--danger)" : "var(--accent)" }}>
                        {partial ? `נותרו ${fmt(-diff)}` : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">אין עדיין שבועות עם רישום.</div>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>ימים</h2><span className="sub small">לחצו על יום כדי לפתוח אותו</span></div>
        {logged.length ? (
          <div className="list-scroll">
            {[...logged].reverse().map((d) => (
              <button key={d.date} className="entry" style={{ width: "100%", background: "none", border: "none", borderBottom: "1px dashed var(--border)", cursor: "pointer", textAlign: "start", gridTemplateColumns: "minmax(0,1fr) auto" }} onClick={() => navigate(`/?date=${d.date}`)}>
                <div>
                  <div>{formatLong(d.date)}</div>
                  <div className="macros num">{d.count} פריטים · פחמ׳ {fmt(d.carbs)} · חלבון {fmt(d.protein)} · שומן {fmt(d.fat)} · סיבים {fmt(d.fiber)}</div>
                </div>
                <div className="kcal num" style={{ color: d.calories > d.target ? "var(--danger)" : undefined }}>
                  {fmt(d.calories)} <span className="muted small">/ {fmt(d.target)}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">עוד אין ימים עם רישום בתקופה הזו.</div>
        )}
      </section>
    </main>
  );
}
