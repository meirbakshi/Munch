import { useEffect, useRef, useState } from "react";
import { computeDays, fmtDate, todayISO } from "../calc.js";
import { MIN_LOGGED_DAYS, generateInsights, insightsKey } from "../insights.js";
import { mutate, stableJson, useStore } from "../store.js";

const KIND = {
  good: { label: "עובד לך", tone: "good", glyph: "check" },
  watch: { label: "לשים לב", tone: "watch", glyph: "alert" },
  focus: { label: "כדאי להתמקד", tone: "focus", glyph: "target" },
  less: { label: "פחות חשוב", tone: "less", glyph: "minus" },
};
function Glyph({ name }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "check") return <svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  if (name === "alert") return <svg {...p}><path d="M12 6v7M12 17.5v.5" /></svg>;
  if (name === "target") return <svg {...p}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></svg>;
  return <svg {...p}><path d="M6 12h12" /></svg>;
}
const ago = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דקות`;
  const h = Math.round(mins / 60);
  if (h < 24) return h === 1 ? "לפני שעה" : `לפני ${h} שעות`;
  return fmtDate(iso.slice(0, 10));
};

export default function Insights({ aiReady }) {
  const { data } = useStore();
  const saved = data.insights;
  const key = insightsKey(data);
  const logged = [...computeDays(data, todayISO()).values()].filter((d) => d.logged).length;
  const enough = logged >= MIN_LOGGED_DAYS;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ctl = useRef(null);
  const tried = useRef(false);

  async function run() {
    setBusy(true);
    setError(null);
    ctl.current = new AbortController();
    try {
      const items = await generateInsights(data, ctl.current.signal);
      await mutate((d) => void (d.insights = { generatedAt: new Date().toISOString(), key, items }));
    } catch (e) {
      if (!e.cancelled) setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // analyze on its own the first time, and after a new weigh-in; otherwise only on request
  const stale = !saved || saved.key?.weighIn !== key.weighIn;
  useEffect(() => {
    if (enough && aiReady && stale && !tried.current) {
      tried.current = true;
      run();
    }
  }, [enough, aiReady, stale]);

  const newData = saved && stableJson(saved.key) !== stableJson(key);

  return (
    <>
      <div className="nav-row" />
      <h1 className="large-title">תובנות</h1>
      <p className="subtitle">מה הרישומים והשקילות שלך מראים, ועל מה כדאי לשים את הדגש.</p>

      {!enough ? (
        <div className="group"><div className="empty">התובנות מבוססות על הרישומים שלך, ולכן צריך עוד קצת נתונים: לפחות {MIN_LOGGED_DAYS} ימים רשומים (יש {logged}). ככל שיהיו יותר ימים ושקילות, התובנות יהיו מדויקות יותר.</div></div>
      ) : (
        <>
          {busy && (
            <div className="group insight-busy">
              <div className="progress"><span className="spinner" />מנתח את הרישומים שלך…</div>
              <button className="btn small gray" onClick={() => ctl.current?.abort()}>עצירה</button>
            </div>
          )}
          {error && <div className="alert error" style={{ marginBottom: 10 }}>{error}</div>}
          {saved?.items?.length > 0 && (
            <div className="insights" style={{ opacity: busy ? 0.5 : 1 }}>
              {saved.items.map((it, i) => {
                const k = KIND[it.kind] || KIND.focus;
                return (
                  <article key={i} className="insight">
                    <div className={`insight-kind ${k.tone}`}><span className="insight-glyph"><Glyph name={k.glyph} /></span>{k.label}</div>
                    <h2 className="insight-title">{it.title}</h2>
                    <p className="insight-body">{it.body}</p>
                    {it.evidence && <p className="insight-evidence num">{it.evidence}</p>}
                  </article>
                );
              })}
            </div>
          )}
          {!busy && (
            <div className="insight-foot">
              <span className="sublabel">{saved ? `עודכן ${ago(saved.generatedAt)}${newData ? " · יש נתונים חדשים מאז" : ""}` : ""}</span>
              <button className="btn small tinted" disabled={!aiReady} onClick={run}>{saved ? "רענון" : "ניתוח"}</button>
            </div>
          )}
          {!aiReady && <p className="footnote">הניתוח עובד רק כשהאפליקציה פתוחה ב-claude.ai.</p>}
          <p className="footnote">התובנות נכתבות על ידי Claude מתוך הנתונים שלך בלבד, ומתעדכנות לבד אחרי כל שקילה חדשה. הן לא תחליף לייעוץ רפואי או תזונתי.</p>
        </>
      )}
    </>
  );
}
