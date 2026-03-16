// MR Umbau Bestellerkennung – Content Script (Hybrid-Ansatz)
//
// Dreistufige Erkennung:
// STUFE 1: Bekannte Händler → sofort Signal (0ms, 0 API-Calls)
// STUFE 2: Lokaler Score → URL + Titel + DOM + Inhalt bewerten
//          ≥6 Punkte → sofort Signal (0 API-Calls)
//          3-5 Punkte → STUFE 3
//          <3 Punkte → ignorieren
// STUFE 3: KI-Bestätigung → GPT-4o-mini entscheidet (nur ~5% der Seiten)

(function () {
  var hostname = window.location.hostname;
  var pathname = window.location.pathname.toLowerCase();
  var fullUrl = window.location.href;

  // --- VORFILTER ---

  var isIgnored = IGNORED_DOMAINS.some(function (domain) {
    return hostname === domain || hostname.endsWith("." + domain);
  });
  if (isIgnored) return;

  var isIgnoredPath = IGNORED_PATHS.some(function (p) {
    return pathname.startsWith(p);
  });
  if (isIgnoredPath) return;

  if (!fullUrl.startsWith("http")) return;

  function extractRootDomain(host) {
    var parts = host.split(".");
    if (parts.length <= 2) return host;
    return parts.slice(-2).join(".");
  }

  var rootDomain = extractRootDomain(hostname);

  // Duplikat-Schutz
  var signalKey = "mr_signal_" + rootDomain + "_" + pathname;
  if (sessionStorage.getItem(signalKey)) return;

  // ===================================================================
  // STUFE 1: Bekannte Händler (sofort)
  // ===================================================================

  var treffer = HAENDLER_PATTERNS.find(function (haendler) {
    var domainMatch =
      hostname === haendler.domain ||
      hostname.endsWith("." + haendler.domain);
    if (!domainMatch) return false;
    return haendler.patterns.some(function (pattern) {
      return pathname.includes(pattern);
    });
  });

  if (treffer) {
    sendeSignal(treffer.domain, "bekannt", null);
    return;
  }

  // ===================================================================
  // STUFE 2: Lokaler Score (nach kurzer Wartezeit für DOM)
  // ===================================================================

  setTimeout(function () {
    var score = berechneScore();

    if (score >= SCORE_SICHER) {
      // Hoher Score → sofort senden, kein KI nötig
      console.log("[MR Umbau] Lokaler Score:", score, "→ Signal senden");
      sendeSignal(rootDomain, "lokal_score", extractBestellnummer());
    } else if (score >= SCORE_VIELLEICHT) {
      // Mittlerer Score → KI fragen
      console.log("[MR Umbau] Lokaler Score:", score, "→ KI-Bestätigung");
      kiBestaetigung();
    }
    // score < SCORE_VIELLEICHT → ignorieren (kein Log, kein Call)
  }, 1500);

  // ===================================================================
  // Score-Berechnung
  // ===================================================================

  function berechneScore() {
    var score = 0;

    // URL-Patterns (+3 pro Treffer)
    SCORE_URL_PATTERNS.forEach(function (pattern) {
      if (pathname.includes(pattern)) score += 3;
    });

    // Titel-Keywords (+2 pro Treffer)
    var title = document.title.toLowerCase();
    SCORE_TITLE_KEYWORDS.forEach(function (keyword) {
      if (title.includes(keyword)) score += 2;
    });

    // DOM-Selektoren (+2 pro Treffer, max 6)
    var domScore = 0;
    SCORE_DOM_SELECTORS.forEach(function (selector) {
      try {
        if (domScore < 6 && document.querySelector(selector)) domScore += 2;
      } catch (e) { /* ungültiger Selektor */ }
    });
    score += domScore;

    // Seiteninhalt-Keywords (+1 pro Treffer, max 5)
    var bodyText = extractCompactText();
    var contentScore = 0;
    SCORE_CONTENT_KEYWORDS.forEach(function (keyword) {
      if (contentScore < 5 && bodyText.includes(keyword)) contentScore += 1;
    });
    score += contentScore;

    return score;
  }

  // ===================================================================
  // Kompakter Text aus Seiteninhalt (für Score + KI)
  // ===================================================================

  function extractCompactText() {
    var container =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector('[role="main"]') ||
      document.body;

    if (!container) return "";

    var skipTags = {
      SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, NAV: 1,
      FOOTER: 1, HEADER: 1, IFRAME: 1,
    };

    var textParts = [];
    var walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          var parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (skipTags[parent.tagName]) return NodeFilter.FILTER_REJECT;
          if (parent.offsetHeight === 0) return NodeFilter.FILTER_REJECT;
          var text = node.textContent.trim();
          if (text.length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    while (walker.nextNode() && textParts.join(" ").length < 1500) {
      textParts.push(walker.currentNode.textContent.trim());
    }

    return textParts.join(" ").toLowerCase().slice(0, 1500);
  }

  // ===================================================================
  // Bestellnummer aus Seite extrahieren (lokal, kein API)
  // ===================================================================

  function extractBestellnummer() {
    var bodyText = extractCompactText();

    // Gängige Muster für Bestellnummern
    var patterns = [
      /bestellnummer[:\s#]*([A-Z0-9\-]{3,20})/i,
      /order\s*(?:number|no|nr|#)[:\s#]*([A-Z0-9\-]{3,20})/i,
      /auftragsnummer[:\s#]*([A-Z0-9\-]{3,20})/i,
      /ordernummer[:\s#]*([A-Z0-9\-]{3,20})/i,
      /bestellung\s*#\s*([A-Z0-9\-]{3,20})/i,
      /#\s*(\d{4,10})\b/,
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = bodyText.match(patterns[i]);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  // ===================================================================
  // STUFE 3: KI-Bestätigung (nur bei Score 3-5)
  // ===================================================================

  function kiBestaetigung() {
    var seitenText = extractCompactText();
    if (seitenText.length < 50) return;

    chrome.storage.sync.get(["kuerzel"], function (result) {
      var kuerzel = result.kuerzel;
      if (!kuerzel) return;

      fetch(ERKENNUNG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fullUrl,
          title: document.title,
          text: seitenText,
          secret: EXTENSION_SECRET,
          kuerzel: kuerzel,
        }),
      })
        .then(function (res) {
          if (!res.ok) return null;
          return res.json();
        })
        .then(function (data) {
          if (!data || !data.ist_bestellung) return;

          var domain = data.haendler_domain || rootDomain;
          sendeSignal(domain, "ki", data.bestellnummer);
          console.log(
            "[MR Umbau] KI bestätigt: Bestellung bei",
            domain,
            "Konfidenz:",
            data.konfidenz
          );
        })
        .catch(function (err) {
          console.debug("[MR Umbau] KI-Fehler:", err.message);
        });
    });
  }

  // ===================================================================
  // Signal senden
  // ===================================================================

  function sendeSignal(domain, quelle, bestellnummer) {
    chrome.storage.sync.get(["kuerzel"], function (result) {
      var kuerzel = result.kuerzel;
      if (!kuerzel) {
        console.warn("[MR Umbau] Kein Kürzel konfiguriert.");
        return;
      }

      var payload = {
        kuerzel: kuerzel,
        haendler_domain: domain,
        zeitstempel: new Date().toISOString(),
        secret: EXTENSION_SECRET,
        erkennung: quelle,
      };

      if (bestellnummer) {
        payload.bestellnummer = bestellnummer;
      }

      fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (res.ok) {
            sessionStorage.setItem(signalKey, "1");
            console.log(
              "[MR Umbau] Signal gesendet:",
              domain, "(" + kuerzel + ")", "[" + quelle + "]"
            );
            chrome.runtime.sendMessage({
              type: "bestellung_erkannt",
              domain: domain,
              quelle: quelle,
            });
          }
        })
        .catch(function () {});
    });
  }
})();
