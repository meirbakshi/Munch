/**
 * Bridge to the claude.ai artifact runtime (`window.claude`).
 *
 * When Munch is published as a claude.ai artifact, the page can:
 * - keep data in the artifact's database, in the viewer's private area (`db` + `user`);
 * - ask Claude on the viewer's own account (`sample`), so no API key is needed;
 * - hand the viewer a backup file (`downloads`).
 *
 * Anywhere else (GitHub Pages, `npm run dev`) `window.claude` doesn't exist and
 * every getter here resolves `null`, so the app falls back to IndexedDB and an API key.
 */

/* Minimal shapes of the runtime calls this app uses. */

export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface DocRef {
  id: string;
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface CollectionRef {
  doc(id: string): DocRef;
  limit(n: number): { get(): Promise<{ docs: DocSnap[] }> };
}
export interface ClaudeDb {
  collection(path: string): CollectionRef;
}
export interface ClaudeUser {
  id(): Promise<string | null>;
}
export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>): unknown;
}
export interface SampleOptions {
  tools?: SampleTool[];
  model?: string;
  modelTier?: "quick" | "default" | "complex";
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}
export interface SampleFn {
  json<T = unknown>(input: string, options?: SampleOptions): Promise<T>;
}
export interface SampleError {
  code: string;
  message: string;
  text?: string;
}
export interface ClaudeDownloads {
  save(req: { filename: string; data: string | Blob }): Promise<unknown>;
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

const runtime = (): ClaudeRuntime | null =>
  (globalThis as { claude?: ClaudeRuntime }).claude?.use ? (globalThis as unknown as { claude: ClaudeRuntime }).claude : null;

/** True when the page runs inside the claude.ai artifact runtime. */
export const inClaude = () => runtime() !== null;

const cache = new Map<string, Promise<unknown>>();
function use<T>(name: string): Promise<T | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  if (!cache.has(name)) cache.set(name, rt.use(name).catch(() => null));
  return cache.get(name) as Promise<T | null>;
}

export const getDb = () => use<ClaudeDb>("db");
export const getUser = () => use<ClaudeUser>("user");
export const getSample = () => use<SampleFn>("sample");
export const getDownloads = () => use<ClaudeDownloads>("downloads");

export const isSampleError = (e: unknown): e is SampleError =>
  typeof e === "object" && e !== null && typeof (e as SampleError).code === "string" && !(e instanceof Error);
