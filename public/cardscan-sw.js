// CardScan Service Worker – Scope: /cardscan
// Minimaler SW für PWA-Installation und Share Target.
// Kein Caching (App braucht immer frische Daten von Supabase/APIs).

const SW_VERSION = "1.0.0";

self.addEventListener("install", (event) => {
  console.log(`[CardScan SW ${SW_VERSION}] Install`);
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log(`[CardScan SW ${SW_VERSION}] Activate`);
  event.waitUntil(self.clients.claim());
});

// Share Target: POST-Requests von der Share-API abfangen
// und an die /cardscan/share Seite weiterleiten
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nur Share-Target-POSTs abfangen
  if (
    url.pathname === "/cardscan/share" &&
    event.request.method === "POST"
  ) {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();

        // Daten in einen Cache-Eintrag schreiben, den die Share-Page lesen kann
        const cache = await caches.open("cardscan-share");

        const shareData = {};

        // Text-Felder
        const title = formData.get("title");
        const text = formData.get("text");
        const sharedUrl = formData.get("url");
        if (title) shareData.title = title;
        if (text) shareData.text = text;
        if (sharedUrl) shareData.url = sharedUrl;

        // Dateien
        const file = formData.get("file");
        if (file && file instanceof File) {
          const arrayBuffer = await file.arrayBuffer();
          shareData.file = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: Array.from(new Uint8Array(arrayBuffer)),
          };
        }

        // Session-ID generieren um Cache-Kollisionen zwischen Tabs zu vermeiden
        const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

        // In Cache speichern mit Session-Key
        await cache.put(
          `/cardscan/share-data/${sessionId}`,
          new Response(JSON.stringify(shareData), {
            headers: { "Content-Type": "application/json" },
          })
        );

        // Zur Share-Page weiterleiten mit Session-ID
        return Response.redirect(`/cardscan/share?sid=${sessionId}`, 303);
      })()
    );
    return;
  }

  // Alle anderen Requests: Network-first (kein Caching)
});
