/**
 * Some claude.ai viewers make the page's frame taller than the screen, so "the bottom of the page"
 * is off screen. This watches which part of the frame is actually visible (an IntersectionObserver
 * on a full-frame element measures against the real screen, even inside a frame) and exposes it as
 * --frame-top / --frame-bottom, which the shell, sheets and toasts use as their edges.
 */
export function trackVisibleFrame() {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;inset:0;pointer-events:none;visibility:hidden;z-index:-1";
  document.body.appendChild(probe);
  const root = document.documentElement.style;
  let last = "";
  const thresholds = Array.from({ length: 201 }, (_, i) => i / 200);
  const io = new IntersectionObserver(([e]) => {
    const r = e.intersectionRect, h = window.innerHeight;
    // ignore readings that can't be the real screen (frame scrolled away, or a tiny sliver)
    if (!e.isIntersecting || r.height < 240) return;
    const top = Math.max(0, Math.round(r.top)), bottom = Math.max(0, Math.round(h - r.bottom));
    const key = top + "/" + bottom;
    if (key === last) return;
    last = key;
    root.setProperty("--frame-top", top + "px");
    root.setProperty("--frame-bottom", bottom + "px");
  }, { threshold: thresholds });
  io.observe(probe);
  const onResize = () => { io.unobserve(probe); io.observe(probe); };
  window.addEventListener("resize", onResize);
  return () => { io.disconnect(); probe.remove(); window.removeEventListener("resize", onResize); };
}
