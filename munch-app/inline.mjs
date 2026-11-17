// Builds the artifact page: one file, no <html>/<head>/<body> (the publisher adds them), CSS and JS inline.
import fs from "node:fs";
const dir = "dist/assets";
const files = fs.readdirSync(dir);
const css = files.filter((f) => f.endsWith(".css")).map((f) => fs.readFileSync(`${dir}/${f}`, "utf8")).join("\n");
const js = files.filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(`${dir}/${f}`, "utf8")).join("\n");
const page = `<title>יומן השומן</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="יומן השומן">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap">
<style>${css}</style>
<div id="root" dir="rtl" lang="he"></div>
<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>
`;
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync("out/calorie-app.html", page);
console.log("out/calorie-app.html", (page.length / 1024).toFixed(0) + " KB");
