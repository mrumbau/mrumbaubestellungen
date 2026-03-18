// MR Umbau Bestellerkennung – Background Service Worker (Manifest V3)

var BADGE_COLORS = {
  bekannt: "#570006",
  lokal_score: "#2563eb",
  ki: "#d97706",
  manuell: "#7c3aed",
};

var CONFIG_CACHE_KEY = "mr_config_cache";
var HISTORY_KEY = "mr_erkennungs_history";
var FAILED_SIGNALS_KEY = "mr_failed_signals";
var CACHE_TTL = 60 * 60 * 1000; // 1 Stunde
var MAX_HISTORY = 20;
var MAX_FAILED_SIGNALS = 50;
var FETCH_TIMEOUT_MS = 8000;

// ===================================================================
// Fetch mit Timeout
// ===================================================================

function fetchWithTimeout(url, options, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs || FETCH_TIMEOUT_MS);
  var opts = Object.assign({}, options, { signal: controller.signal });
  return fetch(url, opts).finally(function () { clearTimeout(timer); });
}

// ===================================================================
// Dynamische Config vom Server laden (Händler + Score-Keywords)
// ===================================================================

function ladeConfigVomServer() {
  chrome.storage.sync.get(["kuerzel"], function (result) {
    if (!result.kuerzel) return;

    fetchWithTimeout("https://cloud.mrumbau.de/api/extension/config", {
      headers: { "x-extension-secret": EXTENSION_SECRET },
    }, FETCH_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.haendler) return;

        var cache = {};
        cache[CONFIG_CACHE_KEY] = {
          config: data,
          timestamp: Date.now(),
        };
        chrome.storage.local.set(cache);
        console.log(
          "[MR Umbau] Config aktualisiert:",
          data.haendler.length, "Händler,",
          (data.score_url_patterns || []).length, "URL-Patterns"
        );
      })
      .catch(function (err) {
        if (err.name === "AbortError") {
          console.debug("[MR Umbau] Config laden: Timeout");
        } else {
          console.debug("[MR Umbau] Config laden fehlgeschlagen:", err.message);
        }
      });
  });
}

// Beim Start und stündlich aktualisieren
ladeConfigVomServer();
setInterval(ladeConfigVomServer, CACHE_TTL);

// ===================================================================
// Failed-Signal Retry Queue
// ===================================================================

function retryFailedSignals() {
  chrome.storage.local.get([FAILED_SIGNALS_KEY], function (result) {
    var failed = result[FAILED_SIGNALS_KEY] || [];
    if (failed.length === 0) return;

    console.log("[MR Umbau] Retry:", failed.length, "fehlgeschlagene Signale");

    var remaining = [];
    var retryCount = 0;

    function processNext() {
      if (retryCount >= failed.length) {
        var update = {};
        update[FAILED_SIGNALS_KEY] = remaining;
        chrome.storage.local.set(update);
        return;
      }

      var signal = failed[retryCount];
      retryCount++;

      // Signal älter als 24h → verwerfen
      if (Date.now() - new Date(signal.zeitstempel).getTime() > 24 * 60 * 60 * 1000) {
        processNext();
        return;
      }

      signal.secret = EXTENSION_SECRET;
      fetchWithTimeout("https://cloud.mrumbau.de/api/webhook/bestellung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signal),
      }, FETCH_TIMEOUT_MS)
        .then(function (res) {
          if (!res.ok) remaining.push(signal);
          processNext();
        })
        .catch(function () {
          remaining.push(signal);
          processNext();
        });
    }

    processNext();
  });
}

// Retry alle 5 Minuten
setInterval(retryFailedSignals, 5 * 60 * 1000);
// Und einmal beim Start nach 30 Sekunden
setTimeout(retryFailedSignals, 30000);

// ===================================================================
// Erkennungs-History verwalten
// ===================================================================

function addToHistory(domain, quelle, bestellnummer) {
  chrome.storage.local.get([HISTORY_KEY], function (result) {
    var history = result[HISTORY_KEY] || [];
    history.unshift({
      domain: domain,
      quelle: quelle,
      bestellnummer: bestellnummer || null,
      zeit: new Date().toISOString(),
    });
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }
    var update = {};
    update[HISTORY_KEY] = history;
    chrome.storage.local.set(update);
  });
}

// ===================================================================
// Installation
// ===================================================================

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get(["kuerzel"], function (result) {
    if (!result.kuerzel) {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#DC2626" });
    } else {
      ladeConfigVomServer();
    }
  });
});

// ===================================================================
// Message Handler
// ===================================================================

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // Badge bei erkannter Bestellung
  if (message.type === "bestellung_erkannt") {
    var badgeColor = BADGE_COLORS[message.quelle] || "#570006";

    chrome.action.setBadgeText({ text: "1" });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });

    setTimeout(function () {
      chrome.action.setBadgeText({ text: "" });
    }, 5000);

    addToHistory(message.domain, message.quelle, message.bestellnummer);
    setTimeout(ladeConfigVomServer, 3000);
  }

  // Content Script fragt nach Config
  if (message.type === "get_config") {
    chrome.storage.local.get([CONFIG_CACHE_KEY], function (result) {
      var cache = result[CONFIG_CACHE_KEY];
      if (cache && cache.config && (Date.now() - cache.timestamp) < CACHE_TTL) {
        sendResponse({ config: cache.config });
      } else {
        sendResponse({ config: null });
        ladeConfigVomServer();
      }
    });
    return true;
  }

  // Content Script fragt nach Secret
  if (message.type === "get_secret") {
    sendResponse({ secret: EXTENSION_SECRET });
    return false;
  }

  // Popup fragt nach History
  if (message.type === "get_history") {
    chrome.storage.local.get([HISTORY_KEY], function (result) {
      sendResponse({ history: result[HISTORY_KEY] || [] });
    });
    return true;
  }

  // Fehlgeschlagenes Signal zur Queue hinzufügen
  if (message.type === "signal_failed") {
    chrome.storage.local.get([FAILED_SIGNALS_KEY], function (result) {
      var failed = result[FAILED_SIGNALS_KEY] || [];
      failed.push(message.payload);
      if (failed.length > MAX_FAILED_SIGNALS) {
        failed = failed.slice(-MAX_FAILED_SIGNALS);
      }
      var upd = {};
      upd[FAILED_SIGNALS_KEY] = failed;
      chrome.storage.local.set(upd);
      sendResponse({ queued: true });
    });
    return true;
  }

  // Manuelles Signal von Popup
  if (message.type === "manuelles_signal") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0] || !tabs[0].url) {
        sendResponse({ success: false, error: "Kein aktiver Tab" });
        return;
      }

      var tab = tabs[0];
      var url;
      try {
        url = new URL(tab.url);
      } catch (e) {
        sendResponse({ success: false, error: "Ungültige URL" });
        return;
      }

      var parts = url.hostname.split(".");
      var domain = parts.length <= 2 ? url.hostname : parts.slice(-2).join(".");

      chrome.storage.sync.get(["kuerzel"], function (syncResult) {
        if (!syncResult.kuerzel) {
          sendResponse({ success: false, error: "Kein Kürzel konfiguriert" });
          return;
        }

        fetchWithTimeout("https://cloud.mrumbau.de/api/webhook/bestellung", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kuerzel: syncResult.kuerzel,
            haendler_domain: domain,
            zeitstempel: new Date().toISOString(),
            secret: EXTENSION_SECRET,
            erkennung: "manuell",
            seiten_url: tab.url,
          }),
        }, FETCH_TIMEOUT_MS)
          .then(function (res) {
            if (res.ok) {
              addToHistory(domain, "manuell", null);

              chrome.action.setBadgeText({ text: "1" });
              chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS.manuell });
              setTimeout(function () {
                chrome.action.setBadgeText({ text: "" });
              }, 5000);

              sendResponse({ success: true, domain: domain });
            } else {
              sendResponse({ success: false, error: "Server-Fehler (" + res.status + ")" });
            }
          })
          .catch(function (err) {
            if (err.name === "AbortError") {
              sendResponse({ success: false, error: "Zeitüberschreitung" });
            } else {
              sendResponse({ success: false, error: err.message });
            }
          });
      });
    });
    return true;
  }
});
