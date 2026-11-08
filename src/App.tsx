import { NavLink, Navigate, Route, Routes, Link } from "react-router-dom";
import { StoreProvider, useStore } from "./store.tsx";
import Daily from "./pages/Daily.tsx";
import History from "./pages/History.tsx";
import Settings from "./pages/Settings.tsx";

function Shell() {
  const { state, error } = useStore();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={30} height={30} alt="" />
            <span className="brand-name">מאנץ׳</span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end>יומן</NavLink>
            <NavLink to="/history">היסטוריה</NavLink>
            <NavLink to="/settings">הגדרות</NavLink>
          </nav>
        </div>
      </header>
      {error ? (
        <main><div className="alert error">לא ניתן לטעון את הנתונים: {error}</div></main>
      ) : !state ? (
        <main><div className="empty"><span className="spinner" style={{ display: "inline-block" }} /></div></main>
      ) : (
        <Routes>
          <Route path="/" element={state.profile ? <Daily /> : <Navigate to="/settings" replace />} />
          <Route path="/history" element={state.profile ? <History /> : <Navigate to="/settings" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
