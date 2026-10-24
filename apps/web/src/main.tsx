import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LedgerApp } from "./features/ledger/LedgerApp";
import "./styles.css";

// Retire only this app's worker and caches; keep IndexedDB and unrelated apps.
if ("serviceWorker" in navigator) {
  const scope = new URL(import.meta.env.BASE_URL, location.origin).href;
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    for (const registration of registrations) {
      if (registration.scope === scope) await registration.unregister();
    }
    if ("caches" in window) {
      for (const name of await caches.keys()) {
        if (name.startsWith("workbox-") && name.endsWith(scope)) await caches.delete(name);
      }
    }
  }).catch(() => { /* Retry retirement on the next online visit. */ });
}


const root = document.getElementById("root");

if (!root) {
  throw new Error("앱을 표시할 루트 요소를 찾지 못했습니다.");
}

createRoot(root).render(
  <StrictMode>
    <LedgerApp />
  </StrictMode>,
);
