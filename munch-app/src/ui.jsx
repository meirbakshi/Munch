import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ENERGY_SOURCES, MEALS, MEAL_ORDER, fmt, fmtShort, round1 } from "./calc.js";

/* ---------- icons (SF Symbols-like, drawn inline) ---------- */
const S = (p) => <svg width={p.size || 24} height={p.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={p.w || 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p.children}</svg>;
export const Icon = {
  log: (p) => <S {...p}><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" /><path d="M17 21V3c-2 1.5-3 4-3 7 0 1.5.8 2.5 3 2.5" /></S>,
  chart: (p) => <S {...p}><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="6.5" rx="1" fill="currentColor" stroke="none" /><rect x="10.5" y="6" width="3" height="11.5" rx="1" fill="currentColor" stroke="none" /><rect x="15.5" y="9" width="3" height="8.5" rx="1" fill="currentColor" stroke="none" /></S>,
  gear: (p) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>,
  // chevrons are drawn for RTL: "back" (earlier) points right, "forward" (later) points left
  earlier: (p) => <S {...p} w={2.4}><path d="M9 5l7 7-7 7" /></S>,
  later: (p) => <S {...p} w={2.4}><path d="M15 5l-7 7 7 7" /></S>,
  chev: (p) => <S size={14} w={2.6} {...p}><path d="M15 5l-7 7 7 7" /></S>,
  calendar: (p) => <S size={17} {...p}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></S>,
  send: (p) => <S size={18} w={2.4} {...p}><path d="M12 19V5M5 12l7-7 7 7" /></S>,
  plus: (p) => <S size={18} w={2.4} {...p}><path d="M12 5v14M5 12h14" /></S>,
  search: (p) => <S size={16} w={2.2} {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></S>,
  scale: (p) => <S size={18} {...p}><rect x="3.5" y="4" width="17" height="16" rx="4" /><path d="M9 9.5a4 4 0 0 1 6 0M12 9.5l1.2-1.8" /></S>,
};

/* ---------- toast ---------- */
let showToastImpl = () => {};
export const toast = (text) => showToastImpl(text);
export function ToastHost() {
  const [t, setT] = useState(null);
  const timer = useRef();
  useEffect(() => {
    showToastImpl = (text) => {
      clearTimeout(timer.current);
      setT(text);
      timer.current = setTimeout(() => setT(null), 3200);
    };
  }, []);
  return t ? <div className="toast" role="status">{t}</div> : null;
}

/* ---------- sheet ---------- */
export function Sheet({ title, onClose, start, end, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  // rendered at the end of <body>, so a sheet opened from inside another sheet stacks above it
  return createPortal(
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-head">
          <div className="start">{start ?? <button className="link" onClick={onClose}>ביטול</button>}</div>
          <h2>{title}</h2>
          <div className="end">{end}</div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmSheet({ title, message, confirmLabel, danger, onConfirm, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        {message && <p className="footnote" style={{ margin: "0 4px 6px", fontSize: 15 }}>{message}</p>}
        <button className={`btn block ${danger ? "danger" : "filled"}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        <button className="btn block gray" onClick={onClose}>ביטול</button>
      </div>
    </Sheet>
  );
}

/* ---------- controls ---------- */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

/* ---------- ring ---------- */
export function Ring({ eaten, target, size = 132 }) {
  const stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = target > 0 ? eaten / target : 0;
  const over = p > 1;
  const main = Math.min(p, 1);
  const extra = over ? Math.min(p - 1, 1) : 0;
  const left = Math.round(target - eaten);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--ring-track)" strokeWidth={stroke} fill="none" />
        {main > 0 && <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--tint)" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${main * c} ${c}`} style={{ transition: "stroke-dasharray .5s ease" }} />}
        {over && (
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--over)" strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${extra * c} ${c}`} />
        )}
      </svg>
      <div className="center">
        <div className={`big num ${left < 0 ? "bad" : ""}`}>{fmt(Math.abs(left))}</div>
        <div className="cap">{left < 0 ? "קק״ל מעל היעד" : "קק״ל נותרו"}</div>
      </div>
    </div>
  );
}

/* ---------- entry editor ---------- */
const FIELDS = [
  ["calories", "קלוריות", "קק״ל"],
  ["carbs", "פחמימות", "ג׳"],
  ["protein", "חלבון", "ג׳"],
  ["fat", "שומן", "ג׳"],
  ["fiber", "סיבים", "ג׳"],
];
export function EntryEditor({ item, title, onSave, onDelete, deleteLabel = "מחיקה מהיומן", onClose }) {
  const [it, setIt] = useState(() => ({ ...item }));
  const base = useRef({ ...item });
  const set = (k, v) => setIt((x) => ({ ...x, [k]: v }));
  // changing the amount rescales the nutrients
  const setAmount = (v) => {
    const a = parseFloat(v);
    const b = base.current;
    if (a > 0 && b.amount > 0) {
      const f = a / b.amount;
      setIt((x) => ({
        ...x, amount: v,
        calories: Math.round(b.calories * f), carbs: round1(b.carbs * f), protein: round1(b.protein * f), fat: round1(b.fat * f), fiber: round1(b.fiber * f),
        grams: b.grams ? Math.round(b.grams * f) : x.grams,
      }));
    } else set("amount", v);
  };
  const valid = String(it.name || "").trim() && parseFloat(it.amount) > 0;
  const save = () => {
    const out = { ...it, name: it.name.trim(), amount: parseFloat(it.amount) };
    for (const [k] of FIELDS) out[k] = Math.max(0, parseFloat(it[k]) || 0);
    if (out.source !== "manual" && JSON.stringify(out) !== JSON.stringify({ ...item, amount: Number(item.amount) })) out.sourceNote = out.sourceNote ? out.sourceNote + " · נערך ידנית" : "נערך ידנית";
    onSave(out);
  };
  return (
    <Sheet title={title} onClose={onClose} end={<button className="link" style={{ fontWeight: 600 }} disabled={!valid} onClick={save}>שמירה</button>}>
      <div className="stack">
        <div className="field"><label htmlFor="ed-name">מה</label><input id="ed-name" value={it.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="field-grid">
          <div className="field"><label htmlFor="ed-amount">כמות</label><input id="ed-amount" type="number" inputMode="decimal" value={it.amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field"><label htmlFor="ed-unit">יחידה</label><input id="ed-unit" value={it.unit} onChange={(e) => set("unit", e.target.value)} /></div>
        </div>
        <div className="field">
          <label htmlFor="ed-meal">ארוחה</label>
          <select id="ed-meal" value={it.meal || "snack"} onChange={(e) => set("meal", e.target.value)}>
            {MEAL_ORDER.map((m) => <option key={m} value={m}>{MEALS[m]}</option>)}
          </select>
        </div>
        <div className="field-grid">
          {FIELDS.map(([k, l, u]) => (
            <div className="field" key={k}><label htmlFor={"ed-" + k}>{l} ({u})</label><input id={"ed-" + k} type="number" inputMode="decimal" value={it[k]} onChange={(e) => set(k, e.target.value)} /></div>
          ))}
        </div>
        {it.sourceNote && <p className="footnote" style={{ margin: "0 4px" }}>מקור: {ENERGY_SOURCES[it.source] || ""} · {it.sourceNote}</p>}
        {onDelete && <button className="btn block danger" onClick={onDelete}>{deleteLabel}</button>}
      </div>
    </Sheet>
  );
}

/* ---------- charts ---------- */

/** Shared plot geometry. Time runs left to right: the newest day is on the right. */
function usePlot(n, height = 190) {
  const W = 340, H = height, padL = 8, padR = 40, padT = 10, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = (i) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  return { W, H, padL, padR, padT, padB, iw, ih, x };
}
function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(Math.round(v * 100) / 100);
  return t;
}
function useTip(n, x, W) {
  const ref = useRef();
  const [i, setI] = useState(null);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    for (let k = 0; k < n; k++) {
      const d = Math.abs(x(k) - px);
      if (d < bd) { bd = d; best = k; }
    }
    setI(best);
  };
  return { ref, i, handlers: { onPointerMove: onMove, onPointerDown: onMove, onPointerLeave: () => setI(null) } };
}
const xLabelsEvery = (n) => (n <= 7 ? 1 : n <= 14 ? 2 : n <= 31 ? 7 : n <= 92 ? 14 : Math.ceil(n / 6));

/** A bar with a rounded top (up to 4 pt) and a flat base, as in Swift Charts. */
function barPath(x, y, w, h) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Calories eaten per day (bars) against that day's target (a step line). */
export function CaloriesChart({ days }) {
  const n = days.length;
  const g = usePlot(n);
  const maxV = Math.max(500, ...days.map((d) => Math.max(d.eaten, d.target)));
  const ticks = niceTicks(0, maxV * 1.05);
  const top = ticks[ticks.length - 1];
  const y = (v) => g.padT + g.ih - (v / top) * g.ih;
  const bw = Math.max(2, Math.min(18, (g.iw / Math.max(n, 1)) * 0.62));
  const tip = useTip(n, g.x, g.W);
  const every = xLabelsEvery(n);
  const sel = tip.i != null ? days[tip.i] : null;
  // target step line
  let path = "";
  days.forEach((d, i) => {
    const half = n > 1 ? g.iw / (n - 1) / 2 : bw;
    const left = Math.max(g.padL, g.x(i) - half), right = Math.min(g.W - g.padR, g.x(i) + half);
    path += `${i ? "L" : "M"}${left},${y(d.target)}L${right},${y(d.target)}`;
  });
  return (
    <div className="chart" ref={tip.ref} {...tip.handlers}>
      <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label="קלוריות ביום מול היעד">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={g.padL} x2={g.W - g.padR} y1={y(t)} y2={y(t)} />
            <text x={g.W - g.padR + 10} y={y(t) + 3} textAnchor="start">{fmt(t)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const over = d.logged && d.eaten > d.target;
          const h = Math.max(d.logged ? 2 : 0, g.padT + g.ih - y(d.eaten));
          return (
            <path key={d.date} d={barPath(g.x(i) - bw / 2, g.padT + g.ih - h, bw, h)}
              fill={over ? "var(--over)" : "var(--tint)"} opacity={tip.i == null || tip.i === i ? 1 : 0.45} />
          );
        })}
        <path d={path} fill="none" stroke="var(--label)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
        {days.map((d, i) => (i % every === 0 ? <text key={d.date} x={g.x(i)} y={g.H - 6} textAnchor="middle">{fmtShort(d.date)}</text> : null))}
      </svg>
      {sel && (
        <div className="tip" style={{ left: `${(g.x(tip.i) / g.W) * 100}%` }}>
          <b>{fmtShort(sel.date)}</b> · {sel.logged ? `${fmt(sel.eaten)} קק״ל נטו` : "לא נרשם"}<br />יעד {fmt(sel.target)}
        </div>
      )}
    </div>
  );
}

/** Lines over time, e.g. actual vs expected weight. series: [{name, color, dash, values: (number|null)[]}] aligned with dates. */
export function LineChart({ dates, series, unit = "ק״ג", digits = 1, label }) {
  const n = dates.length;
  const g = usePlot(n);
  const all = series.flatMap((s) => [...s.values, ...(s.dots || [])].filter((v) => v != null));
  const lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
  const ticks = niceTicks(lo - (hi - lo) * 0.08 - 0.2, hi + (hi - lo) * 0.08 + 0.2);
  const t0 = ticks[0], t1 = ticks[ticks.length - 1];
  const y = (v) => g.padT + g.ih - ((v - t0) / (t1 - t0)) * g.ih;
  const tip = useTip(n, g.x, g.W);
  const every = xLabelsEvery(n);
  const pathOf = (vals) => {
    let d = "", pen = false;
    vals.forEach((v, i) => {
      if (v == null) return;
      d += `${pen ? "L" : "M"}${g.x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  return (
    <div className="chart" ref={tip.ref} {...tip.handlers}>
      <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={g.padL} x2={g.W - g.padR} y1={y(t)} y2={y(t)} />
            <text x={g.W - g.padR + 10} y={y(t) + 3} textAnchor="start">{fmt(t, t % 1 ? 1 : 0)}</text>
          </g>
        ))}
        {tip.i != null && <line x1={g.x(tip.i)} x2={g.x(tip.i)} y1={g.padT} y2={g.padT + g.ih} stroke="var(--label-3)" strokeWidth="1" />}
        {series.map((s) => (
          <path key={s.name} d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash ? "5 4" : undefined} />
        ))}
        {series.map((s) =>
          s.dots
            ? s.dots.map((v, i) => (v == null ? null : <circle key={s.name + i} cx={g.x(i)} cy={y(v)} r="3.5" fill={s.color} stroke="var(--cell)" strokeWidth="2" />))
            : null,
        )}
        {tip.i != null &&
          series.map((s) => {
            const v = (s.dots || s.values)[tip.i];
            return v == null ? null : <circle key={"h" + s.name} cx={g.x(tip.i)} cy={y(v)} r="4.5" fill={s.color} stroke="var(--cell)" strokeWidth="2" />;
          })}
        {dates.map((d, i) => (i % every === 0 ? <text key={d} x={g.x(i)} y={g.H - 6} textAnchor="middle">{fmtShort(d)}</text> : null))}
      </svg>
      {tip.i != null && (
        <div className="tip" style={{ left: `${(g.x(tip.i) / g.W) * 100}%` }}>
          <b>{fmtShort(dates[tip.i])}</b>
          {series.map((s) => {
            const v = (s.dots || s.values)[tip.i];
            return v == null ? null : <div key={s.name}>{s.name}: {fmt(v, digits)} {unit}</div>;
          })}
        </div>
      )}
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}><i className={s.dash ? "dash" : ""} style={{ background: s.color, color: s.color }} />{s.name}</span>
        ))}
      </div>
    </div>
  );
}

/** Stacked bars of each day's macro split (% of energy). */
export function MacroChart({ days }) {
  const n = days.length;
  const g = usePlot(n, 170);
  const keys = [["carbs", "פחמימות"], ["protein", "חלבון"], ["fat", "שומן"], ["fiber", "סיבים"]];
  const y = (v) => g.padT + g.ih - (v / 100) * g.ih;
  const bw = Math.max(2, Math.min(18, (g.iw / Math.max(n, 1)) * 0.62));
  const tip = useTip(n, g.x, g.W);
  const every = xLabelsEvery(n);
  const sel = tip.i != null ? days[tip.i] : null;
  return (
    <div className="chart" ref={tip.ref} {...tip.handlers}>
      <svg viewBox={`0 0 ${g.W} ${g.H}`} role="img" aria-label="חלוקת אנרגיה לפי אבות מזון">
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line className="grid" x1={g.padL} x2={g.W - g.padR} y1={y(t)} y2={y(t)} />
            <text x={g.W - g.padR + 10} y={y(t) + 3}>{t}%</text>
          </g>
        ))}
        {days.map((d, i) => {
          if (!d.shares) return null;
          let acc = 0;
          return (
            <g key={d.date} opacity={tip.i == null || tip.i === i ? 1 : 0.45}>
              {keys.map(([k]) => {
                const v = d.shares[k];
                const r = <rect key={k} x={g.x(i) - bw / 2} y={y(acc + v) + 1} width={bw} height={Math.max(0, y(acc) - y(acc + v) - 1)} fill={`var(--${k})`} rx="1" />;
                acc += v;
                return r;
              })}
            </g>
          );
        })}
        {days.map((d, i) => (i % every === 0 ? <text key={d.date} x={g.x(i)} y={g.H - 6} textAnchor="middle">{fmtShort(d.date)}</text> : null))}
      </svg>
      {sel && sel.shares && (
        <div className="tip" style={{ left: `${(g.x(tip.i) / g.W) * 100}%` }}>
          <b>{fmtShort(sel.date)}</b>
          {keys.map(([k, l]) => <div key={k}>{l}: {fmt(sel.shares[k])}% ({fmt(sel.totals[k], 1)} ג׳)</div>)}
        </div>
      )}
      <div className="legend">
        {keys.map(([k, l]) => <span key={k}><i className="box" style={{ background: `var(--${k})` }} />{l}</span>)}
      </div>
    </div>
  );
}

export const useNow = () => useMemo(() => new Date(), []);
