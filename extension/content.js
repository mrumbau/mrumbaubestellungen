// MR Umbau Bestellerkennung – Content Script (Hybrid-Ansatz)
//
// Dreistufige Erkennung mit dynamischer Config vom Server:
// STUFE 1: Bekannte Händler (hardcoded + gelernt) → sofort Signal
// STUFE 2: Lokaler Score → URL + Titel + DOM + Inhalt bewerten
// STUFE 3: KI-Bestätigung → GPT-4o-mini (nur ~5% der Seiten)

(function () {
  var hostname = window.location.hostname;
  var pathname = window.location.pathname.toLowerCase();
  var fullUrl = window.location.href;
  var FETCH_TIMEOUT_MS = 5000;

  if (!fullUrl.startsWith("http")) return;

  // --- VORFILTER (hardcoded, sofort verfügbar) ---

  var isIgnored = IGNORED_DOMAINS.some(function (domain) {
    return hostname === domain || hostname.endsWith("." + domain);
  });
  if (isIgnored) return;

  var isIgnoredPath = IGNORED_PATHS.some(function (p) {
    return pathname.startsWith(p);
  });
  if (isIgnoredPath) return;

  function extractRootDomain(host) {
    var parts = host.split(".");
    if (parts.length <= 2) return host;
    return parts.slice(-2).join(".");
  }

  var rootDomain = extractRootDomain(hostname);

  // Duplikat-Schutz (sessionStorage + localStorage mit 30-Min-TTL)
  var signalKey = "mr_signal_" + rootDomain + "_" + pathname;
  if (sessionStorage.getItem(signalKey)) return;
  try {
    var lsEntry = localStorage.getItem(signalKey);
    if (lsEntry && (Date.now() - parseInt(lsEntry, 10)) < 1800000) return; // 30 Min
  } catch (e) { /* localStorage nicht verfügbar */ }

  // Fetch mit Timeout
  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || FETCH_TIMEOUT_MS);
    var opts = Object.assign({}, options, { signal: controller.signal });
    return fetch(url, opts).finally(function () { clearTimeout(timer); });
  }

  // ===================================================================
  // STUFE 0: API-Interceptor Listener
  // Die Injection in MAIN world passiert über interceptor-inject.js (document_start).
  // Hier empfangen wir nur die Ergebnisse via postMessage.
  // ===================================================================

  var interceptorOrderNumber = null;
  var interceptorInjected = false;

  // Prüfe ob Interceptor aktiv ist via chrome.scripting (kein inline Script → CSP-sicher)
  try {
    chrome.runtime.sendMessage({ type: "check_interceptor_status", tabUrl: fullUrl }, function(response) {
      if (response && response.active) interceptorInjected = true;
    });
  } catch(e) {}

  // Background Worker fragt ob Interceptor aktiv ist (für CSP-Fallback)
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === "interceptor_check") {
      sendResponse({ active: interceptorInjected });
      return false;
    }
  });

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "MR_UMBAU_ORDER") return;

    var orderNumber = event.data.orderNumber;
    if (!orderNumber || interceptorOrderNumber) return;
    interceptorOrderNumber = orderNumber;

    console.log("[MR Umbau] Bestellnummer aus API-Response:", orderNumber, "(via " + event.data.source + ")");
    sendeSignal(rootDomain, "api_intercept", orderNumber, 10);
  });

  // ===================================================================
  // STUFE 1: Hardcoded Händler (sofort, ohne async)
  // ===================================================================

  function pruefeHaendlerListe(liste) {
    return liste.find(function (haendler) {
      var domainMatch =
        hostname === haendler.domain ||
        hostname.endsWith("." + haendler.domain);
      if (!domainMatch) return false;
      return haendler.patterns.some(function (pattern) {
        // Exakter Pfad-Segment-Match: Pattern muss als vollständiger Pfad-Teil vorkommen.
        // "/checkout/confirmation" matcht "/checkout/confirmation" und "/checkout/confirmation?id=1"
        // aber NICHT "/checkout/confirmation_pending" oder "/mycheckout/confirmation"
        return pathname === pattern ||
               pathname.startsWith(pattern + "/") ||
               pathname.startsWith(pattern + "?") ||
               pathname.startsWith(pattern + "#") ||
               pathname === pattern + "/";
      });
    });
  }

  // Hilfsfunktion: Nur senden wenn Interceptor nicht schon was gefunden hat
  function sollSignalSenden() {
    return !interceptorOrderNumber;
  }

  var treffer = pruefeHaendlerListe(HAENDLER_PATTERNS);
  if (treffer) {
    // Kurz warten bis DOM vollständig geladen, dann Bestellnummer extrahieren
    setTimeout(function () {
      if (!sollSignalSenden()) return; // Interceptor hat schon gesendet
      var nr = extractBestellnummer();
      sendeSignal(treffer.domain, "bekannt", nr, 10);
    }, 1000);
    return;
  }

  // ===================================================================
  // Dynamische Config laden, dann Stufe 1b + 2 + 3
  // ===================================================================

  var configTimeout = setTimeout(function () {
    configTimeout = null;
    starteStufe2(null);
  }, 3000);

  chrome.runtime.sendMessage({ type: "get_config" }, function (response) {
    if (!configTimeout) return; // Timeout bereits ausgelöst
    clearTimeout(configTimeout);

    if (chrome.runtime.lastError) {
      starteStufe2(null);
      return;
    }

    var serverConfig = (response && response.config) || null;

    // Stufe 1b: Gelernte Händler vom Server prüfen
    if (serverConfig && serverConfig.haendler) {
      // Auch dynamische Ignored-Domains prüfen
      if (serverConfig.ignored_domains) {
        var dynIgnored = serverConfig.ignored_domains.some(function (domain) {
          return hostname === domain || hostname.endsWith("." + domain);
        });
        if (dynIgnored) return;
      }

      var gelernterTreffer = pruefeHaendlerListe(serverConfig.haendler);
      if (gelernterTreffer) {
        if (!sollSignalSenden()) return; // Interceptor hat schon gesendet
        console.log("[MR Umbau] Gelernt erkannt:", gelernterTreffer.domain);
        sendeSignal(gelernterTreffer.domain, "bekannt", extractBestellnummer(), 10);
        return;
      }
    }

    starteStufe2(serverConfig);
  });

  // ===================================================================
  // STUFE 2: Lokaler Score
  // ===================================================================

  function starteStufe2(serverConfig) {
    setTimeout(function () {
      if (!sollSignalSenden()) return; // Interceptor hat schon gesendet

      // ── STUFE 2a: Bestellnummer-Scan (höchste Priorität) ──
      // Wenn eine Bestellnummer auf der Seite gefunden wird → das IST eine Bestätigungsseite.
      // Kein URL-Pattern oder Score nötig. Die Bestellnummer ist der Beweis.
      var bestellnummer = extractBestellnummer();
      if (bestellnummer) {
        // Zusätzlich prüfen ob die Seite auch Bestätigungssignale hat
        // (verhindert False Positives auf Produktseiten die zufällig eine Nummer zeigen)
        var bodyText = extractCompactText();
        var bestaetigungsSignale = [
          "vielen dank", "thank you", "bestellung aufgegeben", "bestellung erhalten",
          "order confirmed", "order placed", "bestellbestätigung", "auftragsbestätigung",
          "bestellung erfolgreich", "erfolgreich bestellt", "bestellung wurde",
          "wir haben ihre bestellung", "your order has been",
        ];
        var hatBestaetigung = bestaetigungsSignale.some(function (s) { return bodyText.includes(s); });

        if (hatBestaetigung) {
          console.log("[MR Umbau] Bestellnummer erkannt:", bestellnummer, "→ Signal senden (Bestätigungsseite)");
          sendeSignal(rootDomain, "bestellnummer", bestellnummer, 10);
          return;
        }
      }

      // ── STUFE 2b: Score-basierte Erkennung (Fallback) ──
      var score = berechneScore(serverConfig);

      var schwelle_sicher = (serverConfig && serverConfig.score_sicher) || SCORE_SICHER;
      var schwelle_vielleicht = (serverConfig && serverConfig.score_vielleicht) || SCORE_VIELLEICHT;

      console.debug("[MR Umbau] Score:", score, "| Schwellen: sicher=" + schwelle_sicher + ", vielleicht=" + schwelle_vielleicht, "| URL:", pathname);

      if (score >= schwelle_sicher) {
        console.log("[MR Umbau] Lokaler Score:", score, "→ Signal senden");
        sendeSignal(rootDomain, "lokal_score", bestellnummer, score);
      } else if (score >= schwelle_vielleicht) {
        console.log("[MR Umbau] Lokaler Score:", score, "→ KI-Bestätigung");
        kiBestaetigung();
      }
    }, 1500);
  }

  // ===================================================================
  // Score-Berechnung (dynamische oder hardcoded Keywords)
  // ===================================================================

  function berechneScore(cfg) {
    var score = 0;

    // Prüfe ob aktuelle Domain ein bekannter Händler ist (gelernt oder hardcoded)
    var istBekannterHaendler = false;
    var bekanntePatterns = [];
    if (cfg && cfg.haendler) {
      cfg.haendler.forEach(function (h) {
        if (hostname === h.domain || hostname.endsWith("." + h.domain)) {
          istBekannterHaendler = true;
          bekanntePatterns = bekanntePatterns.concat(h.patterns || []);
        }
      });
    }
    HAENDLER_PATTERNS.forEach(function (h) {
      if (hostname === h.domain || hostname.endsWith("." + h.domain)) {
        istBekannterHaendler = true;
      }
    });

    // URL-Patterns (+3 pro Treffer)
    var urlPatterns = (cfg && cfg.score_url_patterns) || SCORE_URL_PATTERNS;
    urlPatterns.forEach(function (pattern) {
      if (pathname.includes(pattern)) score += 3;
    });

    // Negative URL-Patterns (-3 pro Treffer) — aktiver Checkout, nicht Bestätigung
    // ABER: Bei bekannten Händlern nur die gelernten Patterns von negativer Bewertung ausnehmen
    var negUrlPatterns = (cfg && cfg.score_negative_url_patterns) || SCORE_NEGATIVE_URL_PATTERNS;
    negUrlPatterns.forEach(function (pattern) {
      if (!pathname.includes(pattern)) return;
      // Prüfe ob dieses Pattern ein gelerntes Händler-Pattern ist → nicht negativ bewerten
      if (istBekannterHaendler && bekanntePatterns.some(function (bp) { return bp === pattern || bp.startsWith(pattern); })) return;
      score -= 3;
    });

    // Titel-Keywords (+2 pro Treffer)
    var title = document.title.toLowerCase();
    var titleKeywords = (cfg && cfg.score_title_keywords) || SCORE_TITLE_KEYWORDS;
    titleKeywords.forEach(function (keyword) {
      if (title.includes(keyword)) score += 2;
    });

    // DOM-Selektoren (+2 pro Treffer, max 6)
    var domScore = 0;
    var domSelectors = (cfg && cfg.score_dom_selectors) || SCORE_DOM_SELECTORS;
    domSelectors.forEach(function (selector) {
      try {
        if (domScore < 6 && document.querySelector(selector)) domScore += 2;
      } catch (e) { /* ungültiger Selektor */ }
    });
    score += domScore;

    // Negative DOM-Selektoren (-2 pro Treffer, max -6) — Checkout-Formulare noch aktiv
    var negDomScore = 0;
    var negDomSelectors = (cfg && cfg.score_negative_dom_selectors) || SCORE_NEGATIVE_DOM_SELECTORS;
    negDomSelectors.forEach(function (selector) {
      try {
        if (negDomScore > -6 && document.querySelector(selector)) negDomScore -= 2;
      } catch (e) { /* ungültiger Selektor */ }
    });
    score += negDomScore;

    // Seiteninhalt extrahieren (einmal für alle Content-Checks)
    var bodyText = extractCompactText();

    // Bestätigungs-spezifische Keywords (+4 pro Treffer) — starke Positivsignale
    var confirmKeywords = (cfg && cfg.score_confirmation_keywords) || SCORE_CONFIRMATION_KEYWORDS;
    confirmKeywords.forEach(function (keyword) {
      if (bodyText.includes(keyword)) score += 4;
    });

    // Seiteninhalt-Keywords (+1 pro Treffer, max 5)
    var contentScore = 0;
    var contentKeywords = (cfg && cfg.score_content_keywords) || SCORE_CONTENT_KEYWORDS;
    contentKeywords.forEach(function (keyword) {
      if (contentScore < 5 && bodyText.includes(keyword)) contentScore += 1;
    });
    score += contentScore;

    // Negative Seiteninhalt-Keywords (-2 pro Treffer, max -8) — "Jetzt bestellen" etc.
    var negContentScore = 0;
    var negContentKeywords = (cfg && cfg.score_negative_content_keywords) || SCORE_NEGATIVE_CONTENT_KEYWORDS;
    negContentKeywords.forEach(function (keyword) {
      if (negContentScore > -8 && bodyText.includes(keyword)) negContentScore -= 2;
    });
    score += negContentScore;

    return score;
  }

  // ===================================================================
  // Kompakter Text aus Seiteninhalt
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
  // Bestellnummer extrahieren
  // ===================================================================

  function extractBestellnummer() {
    // ── STRATEGIE 1: DOM-Selektoren (strukturierte Daten, höchste Zuverlässigkeit) ──
    var domSelectors = [
      "[data-order-id]", "[data-order-number]", "[data-orderid]",
      "[data-testid='order-number']", "[data-testid='order-id']",
      "[data-qa='order-number']", "[data-qa='order-id']",
      ".order-number", ".order-id", ".ordernumber", ".orderNumber",
      ".confirmation-number", ".confirmation-id",
      "#order-number", "#ordernumber", "#orderNumber",
      "[class*='order-confirm'] [class*='number']",
      "[class*='orderNumber']", "[class*='order-number']",
      "[class*='bestellnummer']", "[class*='auftragsnummer']",
    ];

    for (var s = 0; s < domSelectors.length; s++) {
      try {
        var el = document.querySelector(domSelectors[s]);
        if (el) {
          // data-attribute Wert hat Priorität
          var dataVal = el.getAttribute("data-order-id") || el.getAttribute("data-order-number") || el.getAttribute("data-orderid");
          if (dataVal && dataVal.length >= 3 && dataVal.length <= 30) return dataVal.trim();
          // Textinhalt
          var text = (el.textContent || "").trim();
          var numMatch = text.match(/([A-Z0-9][\w\-]{2,29})/i);
          if (numMatch) return numMatch[1];
        }
      } catch (e) { /* ungültiger Selektor */ }
    }

    // ── STRATEGIE 2: Seitentext mit Keyword-Kontext (bewährte Regex-Patterns) ──
    var bodyText = extractCompactText();

    var textPatterns = [
      // Deutsch
      /bestellnummer[:\s#]*([A-Z0-9][\w\-]{2,29})/i,
      /auftragsnummer[:\s#]*([A-Z0-9][\w\-]{2,29})/i,
      /bestellung[:\s#]+([A-Z0-9][\w\-]{2,29})/i,
      /ihre bestellung\s+#?\s*([A-Z0-9][\w\-]{2,29})/i,
      /auftrags?[:\s#]+([A-Z0-9][\w\-]{2,29})/i,
      // Englisch
      /order\s*(?:number|no|nr|#|id)[:\s#]*([A-Z0-9][\w\-]{2,29})/i,
      /order\s*:\s*#?\s*([A-Z0-9][\w\-]{2,29})/i,
      /confirmation\s*(?:number|#|id)[:\s#]*([A-Z0-9][\w\-]{2,29})/i,
      // Amazon-spezifisch (Format: 303-1234567-1234567)
      /(\d{3}-\d{7}-\d{7})/,
    ];

    for (var i = 0; i < textPatterns.length; i++) {
      var match = bodyText.match(textPatterns[i]);
      if (match && match[1] && match[1].length >= 3) return match[1];
    }

    // ── STRATEGIE 3: URL-Parameter (manche Shops haben Order-ID in URL) ──
    var urlParams = new URLSearchParams(window.location.search);
    var urlKeys = ["order_id", "orderid", "orderId", "order_number", "bestellnummer", "order", "confirmation"];
    for (var u = 0; u < urlKeys.length; u++) {
      var val = urlParams.get(urlKeys[u]);
      if (val && val.length >= 3 && val.length <= 30) return val;
    }

    // ── STRATEGIE 4: HTML data-Attribute im Body (JSON-LD, Microdata) ──
    try {
      var jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var j = 0; j < jsonLdScripts.length; j++) {
        var jsonText = jsonLdScripts[j].textContent;
        if (jsonText && jsonText.includes("orderNumber")) {
          var parsed = JSON.parse(jsonText);
          if (parsed.orderNumber) return String(parsed.orderNumber);
          if (parsed["@graph"]) {
            for (var g = 0; g < parsed["@graph"].length; g++) {
              if (parsed["@graph"][g].orderNumber) return String(parsed["@graph"][g].orderNumber);
            }
          }
        }
      }
    } catch (e) { /* JSON-Parse fehlgeschlagen */ }

    return null;
  }

  // ===================================================================
  // STUFE 3: KI-Bestätigung (mit Timeout + JSON-Validierung)
  // ===================================================================

  function kiBestaetigung() {
    var seitenText = extractCompactText();
    if (seitenText.length < 50) return;

    chrome.storage.sync.get(["kuerzel"], function (result) {
      var kuerzel = result.kuerzel;
      if (!kuerzel) return;

      fetchWithTimeout(ERKENNUNG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fullUrl,
          title: document.title,
          text: seitenText,
          secret: EXTENSION_SECRET,
          kuerzel: kuerzel,
        }),
      }, FETCH_TIMEOUT_MS)
        .then(function (res) {
          if (!res.ok) return null;
          return res.json();
        })
        .then(function (data) {
          // JSON-Validierung: prüfe erwartete Felder
          if (!data || typeof data !== "object") return;
          if (typeof data.ist_bestellung !== "boolean") return;
          if (!data.ist_bestellung) return;

          var domain = (typeof data.haendler_domain === "string" && data.haendler_domain) || rootDomain;
          var bestellnummer = (typeof data.bestellnummer === "string") ? data.bestellnummer : null;
          sendeSignal(domain, "ki", bestellnummer, 6);
          console.log(
            "[MR Umbau] KI bestätigt:", domain,
            "Konfidenz:", data.konfidenz
          );
        })
        .catch(function (err) {
          if (err.name === "AbortError") {
            console.debug("[MR Umbau] KI-Check: Zeitüberschreitung");
          } else {
            console.debug("[MR Umbau] KI-Fehler:", err.message);
          }
        });
    });
  }

  // ===================================================================
  // Signal senden (mit Timeout + Retry-Queue bei Fehler)
  // ===================================================================

  function sendeSignal(domain, quelle, bestellnummer, score) {
    chrome.storage.sync.get(["kuerzel"], function (result) {
      var kuerzel = result.kuerzel;
      if (!kuerzel) {
        console.warn("[MR Umbau] Kein Kürzel konfiguriert.");
        return;
      }

      // Confidence: Score normalisiert auf 0.0-1.0 (10+ = 1.0)
      var confidence = score != null ? Math.min(1.0, Math.max(0.0, score / 10)) : 0.5;

      var payload = {
        kuerzel: kuerzel,
        haendler_domain: domain,
        zeitstempel: new Date().toISOString(),
        secret: EXTENSION_SECRET,
        erkennung: quelle,
        seiten_url: fullUrl,
        page_title: document.title.slice(0, 200),
        confidence: confidence,
      };

      if (bestellnummer) {
        payload.bestellnummer = bestellnummer;
      }

      fetchWithTimeout(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, FETCH_TIMEOUT_MS)
        .then(function (res) {
          if (res.ok) {
            sessionStorage.setItem(signalKey, "1");
            try { localStorage.setItem(signalKey, String(Date.now())); } catch (e) { /* ok */ }
            console.log(
              "[MR Umbau] Signal gesendet:",
              domain, "(" + kuerzel + ")", "[" + quelle + "]"
            );
            chrome.runtime.sendMessage({
              type: "bestellung_erkannt",
              domain: domain,
              quelle: quelle,
              bestellnummer: bestellnummer,
            });
          } else {
            console.warn("[MR Umbau] Signal fehlgeschlagen:", res.status);
            queueFailedSignal(payload);
          }
        })
        .catch(function (err) {
          if (err.name === "AbortError") {
            console.warn("[MR Umbau] Signal: Zeitüberschreitung");
          } else {
            console.warn("[MR Umbau] Signal-Fehler:", err.message);
          }
          queueFailedSignal(payload);
        });
    });
  }

  // Fehlgeschlagenes Signal zur Background-Queue senden
  function queueFailedSignal(payload) {
    // Secret nicht in Queue speichern (wird beim Retry neu geladen)
    var queuePayload = Object.assign({}, payload);
    delete queuePayload.secret;
    chrome.runtime.sendMessage({
      type: "signal_failed",
      payload: queuePayload,
    });
  }
})();
