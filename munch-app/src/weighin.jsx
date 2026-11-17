import { currentSettings, fmt, fmtDate, weighIn } from "./calc.js";
import { Icon } from "./ui.jsx";

/**
 * A weight difference with its sign and meaning. For a loss goal, lower than the reference is good.
 * Within 0.2 kg it counts as on track.
 */
export function Delta({ kg, size = "md" }) {
  if (kg == null) return <span className="delta">–</span>;
  const r = Math.round(kg * 10) / 10;
  const tone = Math.abs(r) < 0.2 ? "even" : r < 0 ? "good" : "bad";
  return (
    <span className={`delta ${tone} ${size}`}>
      <span dir="ltr">{r > 0 ? "+" : r < 0 ? "−" : ""}{fmt(Math.abs(r), 1)}</span><small> ק״ג</small>
    </span>
  );
}

/** "גבוה ב-0.4 ק״ג מהתוכנית" / "נמוך ב-…" / "כמו בתוכנית" */
const vsText = (kg, what, same) => {
  if (kg == null) return null;
  const r = Math.round(Math.abs(kg) * 10) / 10;
  if (r < 0.2) return same;
  return `${kg < 0 ? "נמוך" : "גבוה"} ב-${fmt(r, 1)} ק״ג ${what}`;
};

/** The full summary shown right after a weigh-in is saved (and when it's opened from Progress). */
export function WeighInSummary({ data, date, onClose, onInsights }) {
  const w = weighIn(data, date);
  if (!w) return null;
  const bigGap = w.vsLogs != null && Math.abs(w.vsLogs) >= 1;
  const should = currentSettings(data)?.sex === "female" ? "כמה היית אמורה לשקול" : "כמה היית אמור לשקול";
  return (
    <div className="stack">
      <div className="weigh-hero">
        <div className="weigh-kg num">{fmt(w.kg, 1)}<small> ק״ג</small></div>
        <div className="sublabel">{fmtDate(w.date, true)}</div>
        {w.prev ? (
          <div className="weigh-change">
            <Delta kg={w.change} /> <span className="sublabel">מאז השקילה הקודמת ({fmtDate(w.prev.date)}, {fmt(w.prev.kg, 1)} ק״ג)</span>
          </div>
        ) : <div className="sublabel">השקילה הראשונה</div>}
      </div>

      <div>
        <div className="cmp-head"><span>{should}</span><span>פער</span></div>
        <div className="group">
          <div className="cell cmp-row">
            <span className="grow">לפי התוכנית</span>
            <span className="cmp-kg num">{fmt(w.planned, 1)} ק״ג</span>
            <span className="cmp-gap"><Delta kg={w.vsPlan} /></span>
          </div>
          <div className="cell cmp-row">
            <span className="grow">לפי הרישומים</span>
            <span className="cmp-kg num">{fmt(w.predicted, 1)} ק״ג</span>
            <span className="cmp-gap"><Delta kg={w.vsLogs} /></span>
          </div>
        </div>
        <p className="footnote">התוכנית: {fmt(w.weeklyLossKg, 2)} ק״ג בשבוע מהמשקל ההתחלתי. הרישומים: מהשקילה הקודמת, לפי מה שאכלת ועשית מאז.</p>
      </div>

      <div className="group">
        <div className="cell">
          <span className="grow">{w.reached ? "הגעת ליעד" : "נותרו ליעד"}</span>
          <span className={`value num ${w.reached ? "good" : ""}`} style={{ color: w.reached ? undefined : "var(--label)", fontWeight: 600 }}>{w.reached ? "✓" : `${fmt(w.toGo, 1)} ק״ג`}</span>
        </div>
        <div className="cell"><span className="grow">משקל היעד</span><span className="value num">{fmt(w.targetWeightKg, 1)} ק״ג</span></div>
        {!w.reached && w.eta && (
          <div className="cell"><span className="grow">הגעה ליעד לפי התוכנית</span><span className="value">{fmtDate(w.eta, true)}</span></div>
        )}
      </div>
      <p className="footnote" style={{ margin: "0 4px" }}>
        המשקל {vsText(w.vsPlan, "מהתוכנית", "בדיוק לפי התוכנית")}
        {w.vsLogs != null && <>, ו{vsText(w.vsLogs, "מהצפוי לפי הרישומים", "תואם את הרישומים")}</>}.
        {bigGap && <> הפער מהרישומים גדול. </>}
        {bigGap && onInsights && <button className="link inline-link" onClick={onInsights}>ההסבר בתובנות</button>}
      </p>
      {onClose && <button className="btn block gray" onClick={onClose}>סגירה</button>}
    </div>
  );
}

/** The condensed version for the Progress page; tapping it opens the full summary. */
export function WeighInCompact({ data, date, onOpen }) {
  const w = weighIn(data, date);
  if (!w) return null;
  return (
    <button className="group weigh-compact" onClick={onOpen}>
      <div className="wc-head">
        <span><b className="num">{fmt(w.kg, 1)} ק״ג</b> <span className="sublabel">· {fmtDate(w.date)}</span></span>
        <Icon.chev className="chev" />
      </div>
      <div className="wc-stats">
        <div><span className="k">מהשקילה הקודמת</span>{w.prev ? <Delta kg={w.change} size="sm" /> : <span className="delta sm even">–</span>}<span className="c num">{w.prev ? `${fmt(w.prev.kg, 1)} ק״ג` : "ראשונה"}</span></div>
        <div><span className="k">מול התוכנית</span><Delta kg={w.vsPlan} size="sm" /><span className="c num">{fmt(w.planned, 1)} ק״ג</span></div>
        <div><span className="k">מול הרישומים</span><Delta kg={w.vsLogs} size="sm" /><span className="c num">{fmt(w.predicted, 1)} ק״ג</span></div>
      </div>
    </button>
  );
}
