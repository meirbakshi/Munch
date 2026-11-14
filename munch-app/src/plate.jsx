import { useMemo } from "react";

/*
 * A drawing of what was logged: the main foods on a plate, snacks / sides / desserts in small bowls
 * beside it, and drinks in a glass or mug. Sizes follow the quantities (grams, else calories), and
 * countable foods are drawn as that many pieces. Claude gives each item a `visual`
 * ({shape, color, place, count}); items without one get a best guess from their name.
 */

// Food colors: the food's own color (content, not UI chrome), chosen to read on a white or dark plate.
const HEX = {
  red: "#d9473b", orange: "#ee8a2f", yellow: "#f2c641", green: "#6cbf4b", darkgreen: "#3f8f3a", brown: "#8a5a35",
  lightbrown: "#c79a63", beige: "#e6d2a6", white: "#f7f4ec", cream: "#f1e3bd", pink: "#f0a3b2", purple: "#7d4c8a",
  black: "#3b302b", golden: "#dba545", clear: "#bcdcf2",
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const EDGE = "rgba(0,0,0,0.2)";

/** One food shape, centered at (x, y), about `r` in radius. */
function Food({ shape, color, x, y, r, seed = 0 }) {
  const c = HEX[color] || HEX.beige;
  const dark = shade(c, -0.25), light = shade(c, 0.35);
  const rot = ((seed * 47) % 40) - 20;
  switch (shape) {
    case "slice":
      return (
        <g transform={`rotate(${rot} ${x} ${y})`}>
          <rect x={x - r * 0.8} y={y - r * 0.65} width={r * 1.6} height={r * 1.3} rx={r * 0.35} fill={dark} />
          <rect x={x - r * 0.68} y={y - r * 0.53} width={r * 1.36} height={r * 1.06} rx={r * 0.26} fill={c} />
        </g>
      );
    case "piece":
      return (
        <g transform={`rotate(${rot - 12} ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx={r} ry={r * 0.68} fill={c} stroke={dark} strokeWidth={1.2} />
          {[-0.4, 0, 0.4].map((k) => (
            <line key={k} x1={x + k * r - r * 0.25} y1={y - r * 0.38} x2={x + k * r + r * 0.25} y2={y + r * 0.38} stroke={dark} strokeWidth={Math.max(1.5, r * 0.09)} strokeLinecap="round" opacity="0.55" />
          ))}
        </g>
      );
    case "leaves": {
      const pts = [[-0.45, -0.25], [0.4, -0.35], [0.05, 0.1], [-0.35, 0.42], [0.45, 0.35]];
      const greens = [HEX.green, HEX.darkgreen, shade(HEX.green, 0.2), HEX.darkgreen, HEX.green];
      return (
        <g>
          {pts.map(([dx, dy], i) => <circle key={i} cx={x + dx * r} cy={y + dy * r} r={r * 0.48} fill={greens[i]} />)}
          {color !== "green" && color !== "darkgreen" && [[0.15, -0.15], [-0.15, 0.3]].map(([dx, dy], i) => <circle key={"a" + i} cx={x + dx * r} cy={y + dy * r} r={r * 0.24} fill={c} stroke={EDGE} strokeWidth={0.8} />)}
        </g>
      );
    }
    case "round":
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.8} fill={c} stroke={EDGE} strokeWidth={0.8} />
          <circle cx={x - r * 0.25} cy={y - r * 0.28} r={r * 0.2} fill={light} opacity="0.8" />
        </g>
      );
    case "egg":
      return (
        <g transform={`rotate(${rot} ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx={r * 0.95} ry={r * 0.78} fill="#fbfaf5" stroke={EDGE} strokeWidth={0.8} />
          <circle cx={x + r * 0.08} cy={y} r={r * 0.38} fill={HEX.yellow} />
        </g>
      );
    case "wedge":
      return (
        <g transform={`rotate(${rot * 2} ${x} ${y})`}>
          <path d={`M${x},${y + r * 0.9} L${x - r * 0.8},${y - r * 0.55} Q${x},${y - r * 0.95} ${x + r * 0.8},${y - r * 0.55} Z`} fill={c} stroke={dark} strokeWidth={1} strokeLinejoin="round" />
          <path d={`M${x - r * 0.8},${y - r * 0.55} Q${x},${y - r * 0.95} ${x + r * 0.8},${y - r * 0.55}`} fill="none" stroke={HEX.lightbrown} strokeWidth={r * 0.22} strokeLinecap="round" />
          {color !== "yellow" && color !== "golden" ? null : [[-0.2, -0.2], [0.15, 0], [-0.05, 0.35]].map(([dx, dy], i) => <circle key={i} cx={x + dx * r} cy={y + dy * r} r={r * 0.12} fill={HEX.red} />)}
        </g>
      );
    case "scoop":
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.82} fill={c} stroke={EDGE} strokeWidth={0.8} />
          <path d={`M${x - r * 0.45},${y - r * 0.2} q${r * 0.45},${-r * 0.35} ${r * 0.9},0`} fill="none" stroke={light} strokeWidth={r * 0.12} strokeLinecap="round" />
        </g>
      );
    case "bowl":
      return (
        <g>
          <circle cx={x} cy={y} r={r * 0.95} fill="var(--plate)" stroke="var(--plate-rim)" strokeWidth={r * 0.14} />
          <circle cx={x} cy={y} r={r * 0.72} fill={c} />
          <circle cx={x - r * 0.25} cy={y - r * 0.2} r={r * 0.14} fill={light} opacity="0.7" />
        </g>
      );
    case "pieces":
      return (
        <g>
          {[[-0.4, -0.3], [0.35, -0.35], [0, 0.05], [-0.35, 0.38], [0.4, 0.3], [0.05, -0.55]].map(([dx, dy], i) => (
            <ellipse key={i} cx={x + dx * r} cy={y + dy * r} rx={r * 0.26} ry={r * 0.18} transform={`rotate(${i * 50} ${x + dx * r} ${y + dy * r})`} fill={i % 2 ? c : dark} stroke={EDGE} strokeWidth={0.6} />
          ))}
        </g>
      );
    case "bar":
      return (
        <g transform={`rotate(${rot} ${x} ${y})`}>
          <rect x={x - r * 0.95} y={y - r * 0.45} width={r * 1.9} height={r * 0.9} rx={r * 0.15} fill={c} stroke={dark} strokeWidth={1} />
          {[-0.32, 0.32].map((k) => <line key={k} x1={x + k * r} y1={y - r * 0.45} x2={x + k * r} y2={y + r * 0.45} stroke={dark} strokeWidth={1} />)}
        </g>
      );
    default: // mound
      return (
        <g>
          <ellipse cx={x} cy={y} rx={r} ry={r * 0.78} fill={c} stroke={EDGE} strokeWidth={0.8} />
          <ellipse cx={x - r * 0.2} cy={y - r * 0.25} rx={r * 0.45} ry={r * 0.25} fill={light} opacity="0.6" />
          {[[0.3, 0.1], [-0.35, 0.25], [0.05, 0.35], [0.4, -0.25]].map(([dx, dy], i) => <circle key={i} cx={x + dx * r} cy={y + dy * r} r={Math.max(1, r * 0.06)} fill={dark} opacity="0.35" />)}
        </g>
      );
  }
}

function Drink({ shape, color, x, bottom, ml, count }) {
  const c = HEX[color] || HEX.beige;
  const n = Math.min(count, 3);
  const scale = n > 1 ? 0.8 : 1;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const cx = x + (i - (n - 1) / 2) * 30 * scale;
        if (shape === "mug") {
          const w = 34 * scale, h = 34 * scale, y0 = bottom - h;
          return (
            <g key={i}>
              <path d={`M${cx + w / 2},${y0 + h * 0.25} h${6 * scale} a${7 * scale},${7 * scale} 0 0 1 0,${h * 0.5} h${-6 * scale}`} fill="none" stroke="var(--plate-rim)" strokeWidth={4 * scale} />
              <rect x={cx - w / 2} y={y0} width={w} height={h} rx={6 * scale} fill="var(--plate)" stroke="var(--plate-rim)" strokeWidth={2} />
              <ellipse cx={cx} cy={y0 + 5 * scale} rx={w / 2 - 4} ry={3.5 * scale} fill={c} />
            </g>
          );
        }
        const h = Math.max(42, Math.min(78, (ml / 330) * 70)) * scale, w = 30 * scale, y0 = bottom - h;
        const fill = h * 0.78;
        return (
          <g key={i}>
            <path d={`M${cx - w / 2},${y0} L${cx - w / 2 + 3},${bottom} H${cx + w / 2 - 3} L${cx + w / 2},${y0}`} fill="var(--glass)" stroke="var(--plate-rim)" strokeWidth={1.5} strokeLinejoin="round" />
            <path d={`M${cx - w / 2 + (3 * (h - fill)) / h},${bottom - fill} L${cx - w / 2 + 3},${bottom - 1} H${cx + w / 2 - 3} L${cx + w / 2 - (3 * (h - fill)) / h},${bottom - fill} Z`} fill={c} opacity={color === "white" ? 0.95 : color === "clear" ? 0.55 : 0.85} />
            <line x1={cx - w / 2 + 6} y1={y0 + 6} x2={cx - w / 2 + 7} y2={bottom - 8} stroke="#fff" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
          </g>
        );
      })}
    </g>
  );
}

/* ---------- guesses for items without a visual ---------- */
const GUESS = [
  [/קפה|תה|שוקו|אספרסו|הפוך|נס/, { shape: "mug", color: "brown", place: "drink" }],
  [/מים|מיץ|קולה|סודה|משקה|בירה|יין|חלב|שייק|לימונדה/, { shape: "glass", color: "orange", place: "drink" }],
  [/סלט|ירקות|חסה/, { shape: "leaves", color: "red" }],
  [/פיצה|פשטיד|קיש/, { shape: "wedge", color: "yellow" }],
  [/לחם|פית|טוסט|כריך|לאפה|עוגה|לחמני/, { shape: "slice", color: "lightbrown" }],
  [/עוף|בשר|שניצל|דג|סטייק|המבורגר|קציצ|טופו|הודו/, { shape: "piece", color: "brown" }],
  [/ביצ|חבית/, { shape: "egg", color: "white" }],
  [/יוגורט|קוטג|גבינה לבנה|שמנת|גלידה|חומוס|טחינה|ממרח/, { shape: "scoop", color: "white" }],
  [/מרק|תבשיל|שקשוקה|דגני/, { shape: "bowl", color: "orange" }],
  [/אגוז|שקד|גרעין|צ׳יפס|במבה|ביסלי|קרקר/, { shape: "pieces", color: "golden", place: "side" }],
  [/שוקולד|חטיף/, { shape: "bar", color: "brown", place: "side" }],
  [/תפוח|בננה|תפוז|ענב|פרי|אפרסק|מלפפון|עגבני/, { shape: "round", color: "green" }],
];
function visualOf(it) {
  if (it.visual) return it.visual;
  const g = GUESS.find(([re]) => re.test(it.name || ""));
  const v = g ? g[1] : { shape: "mound", color: "beige" };
  return { place: it.meal === "snack" ? "side" : "plate", count: 1, ...v };
}
const gramsOf = (it) => Number(it.grams) || (Number(it.calories) > 0 ? Number(it.calories) / 1.8 : 100);

/** items: food items (new or changed) in the draft. */
export function Plate({ items }) {
  const layout = useMemo(() => {
    const all = items.map((it, i) => ({ it, v: visualOf(it), g: gramsOf(it), i }));
    let plate = all.filter((x) => x.v.place === "plate");
    let sides = all.filter((x) => x.v.place === "side");
    const drinks = all.filter((x) => x.v.place === "drink");
    // a lone snack goes on the plate rather than in a bowl next to an empty plate
    let small = false;
    if (!plate.length && sides.length === 1) {
      [plate, sides] = [sides, []];
      small = true;
    }
    return { plate, sides: sides.slice(0, 3), drinks: drinks.slice(0, 2), small };
  }, [items]);

  const { plate, sides, drinks, small } = layout;
  if (!plate.length && !sides.length && !drinks.length) return null;

  const W = 340, H = 186, cx = W / 2, cy = 96, R = small ? 54 : 80;
  const total = plate.reduce((a, x) => a + x.g, 0) || 1;
  const placed = [];
  let angle = -Math.PI / 2 - 0.3;
  plate.forEach((x, k) => {
    const share = x.g / total;
    const span = Math.max(share, 0.12) * 2 * Math.PI;
    const mid = angle + span / 2;
    angle += span;
    const r = small ? 26 : Math.max(15, Math.min(plate.length === 1 ? 44 : 38, Math.sqrt(Math.min(1, x.g / 450)) * 46 * (plate.length === 1 ? 1.1 : 1)));
    const d = plate.length === 1 ? 0 : Math.min(36, R - 18 - r * 0.6);
    const ax = cx + Math.cos(mid) * d, ay = cy + Math.sin(mid) * d;
    const n = x.v.count;
    if (n <= 1) placed.push({ ...x, x: ax, y: ay, r, seed: k });
    else {
      const pr = Math.max(9, (r / Math.sqrt(n)) * 1.15);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * 2 * Math.PI + k;
        const off = n === 2 ? pr * 0.75 : pr * 0.95;
        placed.push({ ...x, x: ax + Math.cos(a) * off, y: ay + Math.sin(a) * off, r: pr, seed: k * 7 + j });
      }
    }
  });

  const label = [...plate, ...sides, ...drinks].map((x) => x.it.name).join(", ");
  let delay = 0;
  const pop = () => ({ style: { animationDelay: `${(delay++ * 60).toFixed(0)}ms` } });

  return (
    <div className="plate-art">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`ציור הארוחה: ${label}`}>
        <defs>
          <radialGradient id="plate-fill" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="var(--plate)" />
            <stop offset="100%" stopColor="var(--plate-edge)" />
          </radialGradient>
        </defs>
        {/* plate */}
        <ellipse cx={cx} cy={cy + 6} rx={R + 4} ry={R * 0.9} fill="var(--plate-shadow)" />
        <circle cx={cx} cy={cy} r={R} fill="var(--plate)" stroke="var(--plate-rim)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={R - (small ? 9 : 13)} fill="url(#plate-fill)" stroke="var(--plate-rim)" strokeWidth="1" opacity="0.9" />
        {placed.map((p, k) => (
          <g key={"p" + k} className="food" {...pop()}>
            <Food shape={p.v.shape} color={p.v.color} x={p.x} y={p.y} r={p.r} seed={p.seed} />
          </g>
        ))}
        {/* sides: small bowls on the right */}
        {sides.map((s, k) => {
          const bx = W - 34, by = 40 + k * 56, br = Math.max(19, Math.min(25, 16 + Math.sqrt(s.g) * 0.6));
          return (
            <g key={"s" + k} className="food" {...pop()}>
              <ellipse cx={bx} cy={by + 4} rx={br + 2} ry={br * 0.9} fill="var(--plate-shadow)" />
              <circle cx={bx} cy={by} r={br} fill="var(--plate)" stroke="var(--plate-rim)" strokeWidth="1.5" />
              <Food shape={s.v.shape === "bowl" ? "scoop" : s.v.shape} color={s.v.color} x={bx} y={by} r={br * 0.68} seed={k} />
            </g>
          );
        })}
        {/* drinks on the left */}
        {drinks.map((d, k) => (
          <g key={"d" + k} className="food" {...pop()}>
            <Drink shape={d.v.shape} color={d.v.color} x={36 + k * 0} bottom={k === 0 ? 92 : 172} ml={d.g} count={d.v.count} />
          </g>
        ))}
      </svg>
    </div>
  );
}
