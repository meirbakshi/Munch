import { useEffect, useRef, useState } from "react";
import { getSample } from "./claude.js";
import { computeDays, currentSettings, latestWeight, todayISO } from "./calc.js";
import { MIN_LOGGED_DAYS, insightsStale, runInsights } from "./insights.js";
import Daily from "./pages/Daily.jsx";
import History from "./pages/History.jsx";
import Settings from "./pages/Settings.jsx";
import Insights from "./pages/Insights.jsx";
import { init, useStore } from "./store.js";
import { Icon, ToastHost } from "./ui.jsx";
import { syncThemeFromData } from "./theme.js";
import { trackVisibleFrame } from "./frame.js";

// Hash routes. "settings" is reserved by claude.ai, so the settings page is "#prefs".
const ROUTES = ["log", "progress", "insights", "prefs"];
// the page content scrolls inside this element, so the tab bar under it never moves
const scroller = () => document.getElementById("scroller");
const readRoute = () => {
  const h = location.hash.replace("#", "");
  return ROUTES.includes(h) ? h : "log";
};

export default function App() {
  const store = useStore();
  const [route, setRoute] = useState(readRoute);
  const [date, setDate] = useState(todayISO);
  // keep the shell inside the part of the frame that is on screen
  useEffect(() => trackVisibleFrame(), []);
  // the app can stay open in the background past midnight: if it was showing "today", move to the new today
  useEffect(() => {
    let shownToday = todayISO();
    const onVisible = () => {
      if (document.hidden) return;
      const now = todayISO();
      if (now !== shownToday) {
        setDate((d) => (d === shownToday ? now : d));
        shownToday = now;
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  const [aiReady, setAiReady] = useState(false);

  useEffect(() => {
    init();
    getSample().then((s) => setAiReady(Boolean(s)));
    const onHash = () => {
      setRoute(readRoute());
      scroller()?.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // once the data has loaded, apply the display choice saved with it
  useEffect(() => {
    if (store.status === "ready") syncThemeFromData();
  }, [store.status]);

  // refresh the insights in the background after every weigh-in (a new one or a changed weight),
  // whichever page is open; one attempt per weigh-in, so a failure doesn't retry in a loop
  const lw = store.status === "ready" ? latestWeight(store.data) : null;
  const weighInSig = lw ? `${lw.date}:${lw.kg}` : "";
  const triedFor = useRef("");
  useEffect(() => {
    if (store.status !== "ready" || !aiReady || !weighInSig || triedFor.current === weighInSig) return;
    if (!insightsStale(store.data)) return;
    const logged = [...computeDays(store.data, todayISO()).values()].filter((d) => d.logged).length;
    if (logged < MIN_LOGGED_DAYS) return;
    triedFor.current = weighInSig;
    runInsights(store.data);
  }, [store.status, aiReady, weighInSig]);

  if (store.status === "loading") return <div className="shell"><div className="scroller"><div className="app"><div className="center-screen"><div><span className="spinner" style={{ display: "inline-block" }} /><div style={{ marginTop: 10 }}>טוען את הנתונים שלך…</div></div></div></div></div></div>;
  if (store.status === "error") return <div className="shell"><div className="scroller"><div className="app"><div className="center-screen"><div className="alert error">{store.error}</div></div></div></div></div>;

  const onboarded = Boolean(currentSettings(store.data));
  const page = !onboarded ? "prefs" : route;
  const go = (r) => {
    if (location.hash !== "#" + r) location.hash = r;
    else scroller()?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="shell">
      <div className="scroller" id="scroller">
      <main className="app">
        {store.kind === "local" && <div className="alert warn" style={{ margin: "8px 0" }}>הנתונים נשמרים כרגע רק בדפדפן הזה. כדי לשמור אותם בחשבון ולסנכרן בין מכשירים, פתחו את האפליקציה ב-claude.ai כשאתם מחוברים.</div>}
        {page === "log" && <Daily date={date} setDate={setDate} aiReady={aiReady} />}
        {page === "progress" && <History openDay={(d) => { setDate(d); go("log"); }} />}
        {page === "insights" && <Insights aiReady={aiReady} />}
        {page === "prefs" && <Settings key={onboarded ? "s" : "o"} storageKind={store.kind} />}
      </main>
      </div>
      {onboarded && (
        <div className="tabbar">
          <nav aria-label="ניווט">
            <a href="#log" aria-current={page === "log" ? "page" : undefined} onClick={(e) => { e.preventDefault(); if (page === "log") setDate(todayISO()); go("log"); }}><Icon.log />יומן</a>
            <a href="#progress" aria-current={page === "progress" ? "page" : undefined} onClick={(e) => { e.preventDefault(); go("progress"); }}><Icon.chart />התקדמות</a>
            <a href="#insights" aria-current={page === "insights" ? "page" : undefined} onClick={(e) => { e.preventDefault(); go("insights"); }}><Icon.bulb />תובנות</a>
            <a href="#prefs" aria-current={page === "prefs" ? "page" : undefined} onClick={(e) => { e.preventDefault(); go("prefs"); }}><Icon.gear />הגדרות</a>
          </nav>
        </div>
      )}
      <ToastHost />
    </div>
  );
}
