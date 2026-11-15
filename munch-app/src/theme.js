/** The app's display setting: "system" follows the device (and claude.ai), or force "light" / "dark".
 *  It's a per-device preference, so it lives in this browser's storage. */
const KEY = "munch-theme";
export function getTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
export function applyTheme(t = getTheme()) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-app-theme");
  else root.setAttribute("data-app-theme", t);
}
export function setTheme(t) {
  try {
    if (t === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* storage blocked: the choice still applies until the app is closed */
  }
  applyTheme(t);
}
