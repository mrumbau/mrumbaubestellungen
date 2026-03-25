// MR Umbau Bestellerkennung – Popup Script

var kuerzelSelect = document.getElementById("kuerzel");
var statusDiv = document.getElementById("status");
var haendlerBtn = document.getElementById("haendlerBtn");
var bestellungBtn = document.getElementById("bestellungBtn");
var actionStatus = document.getElementById("actionStatus");
var historyContainer = document.getElementById("historyContainer");

// ===================================================================
// Kürzel laden & speichern
// ===================================================================

chrome.storage.sync.get(["kuerzel"], function (result) {
  if (result.kuerzel) {
    kuerzelSelect.value = result.kuerzel;
    showStatus(statusDiv, "success", "Aktiv als " + result.kuerzel);
    haendlerBtn.disabled = false;
    bestellungBtn.disabled = false;
  } else {
    showStatus(statusDiv, "warning", "Bitte Benutzer auswählen");
  }
});

kuerzelSelect.addEventListener("change", function () {
  var value = kuerzelSelect.value;

  if (!value) {
    chrome.storage.sync.remove("kuerzel");
    showStatus(statusDiv, "warning", "Bitte Benutzer auswählen");
    haendlerBtn.disabled = true;
    bestellungBtn.disabled = true;
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#DC2626" });
    return;
  }

  chrome.storage.sync.set({ kuerzel: value }, function () {
    showStatus(statusDiv, "success", "Gespeichert als " + value);
    haendlerBtn.disabled = false;
    bestellungBtn.disabled = false;
    chrome.action.setBadgeText({ text: "" });
  });
});

// ===================================================================
// Beim Öffnen: Prüfen ob aktuelle Seite bereits als Händler bekannt ist
// ===================================================================

function pruefeAktuelleSeite() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs[0] || !tabs[0].url) return;

    var url;
    try {
      url = new URL(tabs[0].url);
    } catch (e) {
      return;
    }

    var parts = url.hostname.split(".");
    var domain = parts.length <= 2 ? url.hostname : parts.slice(-2).join(".");

    // Gecachte Config prüfen
    chrome.runtime.sendMessage({ type: "get_config" }, function (response) {
      if (!response || !response.config || !response.config.haendler) return;

      var bekannt = response.config.haendler.some(function (h) {
        return h.domain === domain;
      });

      if (bekannt) {
        haendlerBtn.classList.add("bekannt");
        haendlerBtn.disabled = true;
        haendlerBtn.innerHTML =
          '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />' +
          '</svg> Händler bereits bekannt: ' + escapeHtml(domain);
      }
    });
  });
}

pruefeAktuelleSeite();

// ===================================================================
// Händler merken (nur Domain lernen, KEINE Bestellung)
// ===================================================================

haendlerBtn.addEventListener("click", function () {
  haendlerBtn.disabled = true;
  haendlerBtn.textContent = "Wird gesendet...";
  actionStatus.style.display = "none";

  chrome.runtime.sendMessage({ type: "haendler_merken" }, function (response) {
    haendlerBtn.disabled = false;
    haendlerBtn.innerHTML =
      '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />' +
      '</svg> Händler merken';

    if (response && response.success) {
      var msg = response.neu
        ? "Neuer Händler gespeichert: " + response.domain
        : "Händler bereits bekannt: " + response.domain;
      showStatus(actionStatus, "success", msg);
      // Button auf "bekannt" umstellen
      haendlerBtn.classList.add("bekannt");
      haendlerBtn.disabled = true;
      haendlerBtn.innerHTML =
        '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />' +
        '</svg> Händler bereits bekannt: ' + escapeHtml(response.domain);
    } else {
      var error = (response && response.error) || "Unbekannter Fehler";
      showStatus(actionStatus, "error", error);
    }
  });
});

// ===================================================================
// Bestellung melden (erwartet-Eintrag erstellen)
// ===================================================================

bestellungBtn.addEventListener("click", function () {
  bestellungBtn.disabled = true;
  bestellungBtn.innerHTML =
    '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite"><circle cx="12" cy="12" r="10" stroke-dasharray="30 70" /></svg> Wird gemeldet...';
  actionStatus.style.display = "none";
  var hint = document.getElementById("bestellungHint");

  chrome.runtime.sendMessage({ type: "manuelles_signal" }, function (response) {
    if (response && response.success) {
      bestellungBtn.classList.add("gesendet");
      bestellungBtn.innerHTML =
        '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />' +
        '</svg> Gemeldet!';
      if (hint) hint.textContent = escapeHtml(response.domain) + " wurde als Bestellung registriert";
      ladeHistory();
      // Nach 3 Sekunden Button zurücksetzen
      setTimeout(function () {
        bestellungBtn.classList.remove("gesendet");
        bestellungBtn.disabled = false;
        bestellungBtn.innerHTML =
          '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />' +
          '</svg> Gerade bestellt';
        if (hint) hint.textContent = "Klicke hier nachdem du eine Bestellung aufgegeben hast";
      }, 3000);
    } else {
      bestellungBtn.disabled = false;
      bestellungBtn.innerHTML =
        '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />' +
        '</svg> Gerade bestellt';
      var error = (response && response.error) || "Unbekannter Fehler";
      showStatus(actionStatus, "error", error);
    }
  });
});

// ===================================================================
// Erkennungs-History laden
// ===================================================================

function ladeHistory() {
  chrome.runtime.sendMessage({ type: "get_history" }, function (response) {
    var history = (response && response.history) || [];

    if (history.length === 0) {
      historyContainer.innerHTML =
        '<p class="history-empty">Noch keine Bestellungen erkannt</p>';
      return;
    }

    var html = '<ul class="history-list">';
    history.forEach(function (item) {
      var zeit = formatZeit(item.zeit);
      var quelle = item.quelle || "bekannt";
      var quelleLabel = {
        bekannt: "Bekannt",
        lokal_score: "Score",
        ki: "KI",
        manuell: "Manuell",
      }[quelle] || quelle;

      html +=
        '<li class="history-item">' +
        '  <div class="history-dot ' + quelle + '"></div>' +
        '  <div class="history-info">' +
        '    <div class="history-domain">' + escapeHtml(item.domain) + '</div>' +
        '    <div class="history-meta">' +
        '      <span>' + zeit + '</span>' +
        (item.bestellnummer ? '<span>#' + escapeHtml(item.bestellnummer) + '</span>' : '') +
        '    </div>' +
        '  </div>' +
        '  <span class="history-tag ' + quelle + '">' + quelleLabel + '</span>' +
        '</li>';
    });
    html += '</ul>';

    historyContainer.innerHTML = html;
  });
}

ladeHistory();

// ===================================================================
// Hilfsfunktionen
// ===================================================================

function showStatus(el, type, message) {
  el.className = "status-bar " + type;
  el.textContent = message;
  el.style.display = "block";
}

function formatZeit(isoString) {
  try {
    var d = new Date(isoString);
    var now = new Date();
    var diff = now - d;

    if (diff < 60000) return "Gerade eben";
    if (diff < 3600000) return Math.floor(diff / 60000) + " Min.";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " Std.";

    if (d.toDateString() === now.toDateString()) {
      return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
    }

    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return "Gestern";
    }

    return d.getDate() + "." + (d.getMonth() + 1) + ".";
  } catch (e) {
    return "";
  }
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
