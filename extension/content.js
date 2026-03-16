// MR Umbau Bestellerkennung – Content Script
// Läuft auf allen bekannten Händler-Seiten und prüft ob die aktuelle URL
// einer Checkout-Bestätigungsseite entspricht.

(function () {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  // Prüfe ob die aktuelle Seite zu einem bekannten Händler-Checkout passt
  const treffer = HAENDLER_PATTERNS.find(function (haendler) {
    const domainMatch =
      hostname === haendler.domain ||
      hostname.endsWith("." + haendler.domain);
    if (!domainMatch) return false;

    return haendler.patterns.some(function (pattern) {
      return pathname.includes(pattern);
    });
  });

  if (!treffer) return;

  // Benutzerkürzel aus Storage laden und Signal senden
  chrome.storage.sync.get(["kuerzel"], function (result) {
    const kuerzel = result.kuerzel;
    if (!kuerzel) {
      console.warn(
        "[MR Umbau] Kein Benutzerkürzel konfiguriert. Bitte Extension-Popup öffnen und Kürzel setzen."
      );
      return;
    }

    const payload = {
      kuerzel: kuerzel,
      haendler_domain: treffer.domain,
      zeitstempel: new Date().toISOString(),
      secret: EXTENSION_SECRET,
    };

    fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (res.ok) {
          console.log(
            "[MR Umbau] Bestellsignal gesendet:",
            treffer.domain,
            "(" + kuerzel + ")"
          );
          // Nachricht an Background-Script für Badge-Update
          chrome.runtime.sendMessage({
            type: "bestellung_erkannt",
            domain: treffer.domain,
          });
        } else {
          console.error("[MR Umbau] Webhook-Fehler:", res.status);
        }
      })
      .catch(function (err) {
        console.error("[MR Umbau] Netzwerkfehler:", err);
      });
  });
})();
