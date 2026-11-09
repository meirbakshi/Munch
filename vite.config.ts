import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * `vite build --mode artifact` builds the claude.ai artifact version (dist-artifact/):
 * the same app, without the home-screen (PWA) tags, which don't apply inside claude.ai.
 */
const artifactHtml = (): Plugin => ({
  name: "munch-artifact-html",
  transformIndexHtml: (html) =>
    html
      .replace(/\s*<link rel="(apple-touch-icon|manifest)"[^>]*>/g, "")
      .replace(/\s*<meta name="apple-mobile-web-app-[^>]*>/g, "")
      .replace(/<title>.*<\/title>/, "<title>מאנץ׳</title>"),
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "artifact" ? [artifactHtml()] : [])],
  // Relative asset paths so the build works under https://<user>.github.io/<repo>/ and as an artifact
  base: "./",
  build: { chunkSizeWarningLimit: 1500, ...(mode === "artifact" ? { outDir: "dist-artifact" } : {}) },
}));
