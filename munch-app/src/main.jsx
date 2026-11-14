import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

document.documentElement.lang = "he";
document.documentElement.dir = "rtl";
createRoot(document.getElementById("root")).render(<App />);
