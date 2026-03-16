// MR Umbau Bestellerkennung – Background Service Worker (Manifest V3)

var BADGE_COLORS = {
  bekannt: "#570006",
  lokal_score: "#2563eb",
  ki: "#d97706",
  manuell: "#7c3aed",
};

var CONFIG_CACHE_KEY = "mr_config_cache";
var HISTORY_KEY = "mr_erkennungs_history";
var CACHE_TTL = 60 * 60 * 1000; // 1 Stunde
var MAX_HISTORY = 20;

// ===================================================================
// Dynamische Config vom Server laden (Händler + Score-Keywords)
// ===================================================================

function ladeConfigVomServer() {
  chrome.storage.sync.get(["kuerzel"], function (result) {
    if (!result.kuerzel) return;

    fetch("https://cloud.mrumbau.de/api/extension/config", {
      headers: { "x-extension-secret": "mrumbau-ext-2026" },
    })
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
        console.debug("[MR Umbau] Config laden fehlgeschlagen:", err.message);
      });
  });
}

// Beim Start und stündlich aktualisieren
ladeConfigVomServer();
setInterval(ladeConfigVomServer, CACHE_TTL);

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
    // Max 20 Einträge behalten
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
  ladeConfigVomServer();

  chrome.storage.sync.get(["kuerzel"], function (result) {
    if (!result.kuerzel) {
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#DC2626" });
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

    // History-Eintrag
    addToHistory(message.domain, message.quelle, message.bestellnummer);

    // Config neu laden (neues Pattern könnte gelernt worden sein)
    setTimeout(ladeConfigVomServer, 3000);
  }

  // Content Script fragt nach Config (Händler + Score-Keywords)
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
    return true; // async sendResponse
  }

  // Popup fragt nach History
  if (message.type === "get_history") {
    chrome.storage.local.get([HISTORY_KEY], function (result) {
      sendResponse({ history: result[HISTORY_KEY] || [] });
    });
    return true;
  }

  // Manuelles Signal von Popup ("Diese Seite ist eine Bestellung")
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

      chrome.storage.sync.get(["kuerzel"], function (result) {
        if (!result.kuerzel) {
          sendResponse({ success: false, error: "Kein Kürzel konfiguriert" });
          return;
        }

        fetch("https://cloud.mrumbau.de/api/webhook/bestellung", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kuerzel: result.kuerzel,
            haendler_domain: domain,
            zeitstempel: new Date().toISOString(),
            secret: "mrumbau-ext-2026",
            erkennung: "manuell",
            seiten_url: tab.url,
          }),
        })
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
              sendResponse({ success: false, error: "Server-Fehler" });
            }
          })
          .catch(function (err) {
            sendResponse({ success: false, error: err.message });
          });
      });
    });
    return true; // async sendResponse
  }
});
