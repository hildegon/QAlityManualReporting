import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useUiStore } from "./stores/uiStore";
import "./index.css";

// Apply the saved theme to <html> before first paint to avoid a flash.
const initialTheme = useUiStore.getState().theme;
document.documentElement.classList.toggle("dark", initialTheme === "dark");

// Keep <html class="dark"> in sync whenever the store changes.
useUiStore.subscribe((state) => {
  document.documentElement.classList.toggle("dark", state.theme === "dark");
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
