"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      let reloading = false;
      const activateUpdate = (registration: ServiceWorkerRegistration) => {
        if (registration.waiting) registration.waiting.postMessage("SKIP_WAITING");
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) worker.postMessage("SKIP_WAITING");
          });
        });
      };
      const onControllerChange = () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        activateUpdate(registration);
        registration.update().catch(() => undefined);
      }).catch(() => undefined);
      return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    }
  }, []);
  return null;
}
