import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { applyTheme } from "./theme.js";

document.documentElement.lang = "he";
document.documentElement.dir = "rtl";
applyTheme(); // before the first paint, so there is no flash of the other theme
createRoot(document.getElementById("root")).render(<App />);
