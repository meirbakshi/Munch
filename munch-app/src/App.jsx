import { useEffect, useState } from "react";
import { getSample } from "./claude.js";
import { currentSettings, todayISO } from "./calc.js";
import Daily from "./pages/Daily.jsx";
import History from "./pages/History.jsx";
import Settings from "./pages/Settings.jsx";
import { init, useStore } from "./store.js";
import { Icon, ToastHost } from "./ui.jsx";

// Hash routes. "settings" is reserved by claude.ai, so the settings page is "#prefs".
const ROUTES = ["log", "progress", "prefs"];
const readRoute = () => {
  const h = location.hash.replace("#", "");
  return ROUTES.includes(h) ? h : "log";
};

export default function App() {
  const store = useStore();
  const [route, setRoute] = useState(readRoute);
  const [date, setDate] = useState(todayISO);
  const [aiReady, setAiReady] = useState(false);

  useEffect(() => {
    init();
    getSample().then((s) => setAiReady(Boolean(s)));
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (store.status === "loading") return <div className="app"><div className="center-screen"><div><span className="spinner" style={{ display: "inline-block" }} /><div style={{ marginTop: 10 }}>טוען את הנתונים שלך…</div></div></div></div>;
  if (store.status === "error") return <div className="app"><div className="center-screen"><div className="alert error">{store.error}</div></div></div>;

  const onboarded = Boolean(currentSettings(store.data));
  const page = !onboarded ? "prefs" : route;
  const go = (r) => {
    if (location.hash !== "#" + r) location.hash = r;
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <main className="app">
        {store.kind === "local" && <div className="alert warn" style={{ margin: "8px 0" }}>הנתונים נשמרים כרגע רק בדפדפן הזה. כדי לשמור אותם בחשבון ולסנכרן בין מכשירים, פתחו את האפליקציה ב-claude.ai כשאתם מחוברים.</div>}
        {page === "log" && <Daily date={date} setDate={setDate} aiReady={aiReady} />}
        {page === "progress" && <History openDay={(d) => { setDate(d); go("log"); }} />}
        {page === "prefs" && <Settings key={onboarded ? "s" : "o"} storageKind={store.kind} />}
      </main>
      {onboarded && (
        <div className="tabbar">
          <nav aria-label="ניווט">
            <a href="#log" aria-current={page === "log" ? "page" : undefined} onClick={(e) => { e.preventDefault(); if (page === "log") setDate(todayISO()); go("log"); }}><Icon.log />יומן</a>
            <a href="#progress" aria-current={page === "progress" ? "page" : undefined} onClick={(e) => { e.preventDefault(); go("progress"); }}><Icon.chart />התקדמות</a>
            <a href="#prefs" aria-current={page === "prefs" ? "page" : undefined} onClick={(e) => { e.preventDefault(); go("prefs"); }}><Icon.gear />הגדרות</a>
          </nav>
        </div>
      )}
      <ToastHost />
    </>
  );
}
