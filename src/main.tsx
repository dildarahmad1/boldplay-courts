import { createRoot } from "react-dom/client";
import { createElement } from "react";
import "./index.css";
import AppErrorBoundary from "./components/AppErrorBoundary";

const rootElement = document.getElementById("root");

if (rootElement) {
  const root = createRoot(rootElement);
  import("./App.tsx")
    .then(({ default: App }) => {
      root.render(createElement(AppErrorBoundary, null, createElement(App)));
    })
    .catch((error: unknown) => {
      console.error("Yarika failed to start", error);
      const showStartupError = (window as Window & { __yarikaStartupError?: () => void }).__yarikaStartupError;
      showStartupError?.();
    });
} else {
  console.error("Yarika root element was not found");
}
