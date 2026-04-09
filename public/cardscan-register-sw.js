// Registriert den CardScan Service Worker (scoped auf /cardscan)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/cardscan-sw.js", { scope: "/cardscan" })
    .catch(function () {});
}
