/** Bridge to the claude.ai artifact runtime. Every getter resolves null outside claude.ai. */
const rt = () => (typeof window !== "undefined" && window.claude && typeof window.claude.use === "function" ? window.claude : null);
const cache = new Map();
function use(name) {
  const r = rt();
  if (!r) return Promise.resolve(null);
  if (!cache.has(name)) cache.set(name, r.use(name).catch(() => null));
  return cache.get(name);
}
export const getDb = () => use("db");
export const getUser = () => use("user");
export const getSample = () => use("sample");
export const getMcp = () => use("mcp");
export const getDownloads = () => use("downloads");
export const inClaude = () => rt() !== null;
