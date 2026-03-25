import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const root = createRoot(document.getElementById("root"));
root.render(<App />);

function clearDevPwaState() {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations.map((registration) => registration.unregister()),
      ),
    )
    .catch(() => {});

  if ("caches" in window) {
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("lifehub-pwa-"))
            .map((key) => caches.delete(key)),
        ),
      )
      .catch(() => {});
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      return;
    }

    clearDevPwaState();
  });
}
