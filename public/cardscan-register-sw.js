// Registriert den CardScan Service Worker (scoped auf /cardscan).
// F5.10: Errors NICHT mehr silent-catchen — Diagnose bei Registrierungs-Fehlern
// (HTTPS-Constraint, Storage-Quota, ungültiger Scope) braucht Sichtbarkeit.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/cardscan-sw.js", { scope: "/cardscan" })
    .then(function (reg) {
      // Nur in Dev-Console sichtbar — keine Auswirkung auf User-Experience.
      if (typeof console !== "undefined" && console.debug) {
        console.debug("[CardScan SW] registered, scope:", reg.scope);
      }
    })
    .catch(function (err) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[CardScan SW] registration failed:", err);
      }
    });
}
