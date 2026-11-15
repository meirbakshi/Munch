import { getData, mutate } from "./store.js";

/**
 * The app's display setting: "system" follows the device (and claude.ai), or force "light" / "dark".
 * It's saved with the user's data (core → prefs.theme), so it survives the app being closed and
 * syncs between devices. A copy in browser storage only lets the first paint use it before the
 * data has loaded; iOS may clear that copy, and the saved choice then restores it.
 */
const KEY = "munch-theme";
const valid = (v) => (v === "light" || v === "dark" ? v : "system");

export function getTheme() {
  try {
    return valid(localStorage.getItem(KEY));
  } catch {
    return "system";
  }
}
function remember(t) {
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* storage blocked: the saved choice in the data still applies */
  }
}
export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-app-theme");
  else root.setAttribute("data-app-theme", t);
}
/** Called when the user picks a theme. */
export function setTheme(t) {
  t = valid(t);
  remember(t);
  applyTheme(t);
  return mutate((d) => void (d.prefs = { ...(d.prefs || {}), theme: t }));
}
/** Called once the data has loaded: the saved choice wins over the browser's copy. */
export function syncThemeFromData() {
  const saved = getData().prefs?.theme;
  if (saved) {
    const t = valid(saved);
    remember(t);
    applyTheme(t);
    return t;
  }
  // nothing saved yet (chosen before this version): keep the browser's choice and save it
  const local = getTheme();
  if (local !== "system") mutate((d) => void (d.prefs = { ...(d.prefs || {}), theme: local })).catch(() => {});
  return local;
}
