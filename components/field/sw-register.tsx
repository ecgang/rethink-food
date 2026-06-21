"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that caches the /field app shell so it opens on
 * a flaky kitchen/loading-dock connection. Mounted only inside the field layout
 * — the Command Center doesn't need offline caching.
 */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/field", updateViaCache: "none" })
      .catch(() => {
        // registration is a progressive enhancement — never block the app on it
      });
  }, []);
  return null;
}
