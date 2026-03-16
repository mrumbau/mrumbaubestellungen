// MR Umbau Bestellerkennung – Popup Script

var kuerzelSelect = document.getElementById("kuerzel");
var statusDiv = document.getElementById("status");
var manualBtn = document.getElementById("manualBtn");
var manualStatus = document.getElementById("manualStatus");
var historyContainer = document.getElementById("historyContainer");

// ===================================================================
// Kürzel laden & speichern
// ===================================================================

chrome.storage.sync.get(["kuerzel"], function (result) {
  if (result.kuerzel) {
    kuerzelSelect.value = result.kuerzel;
    showStatus(statusDiv, "success", "Aktiv als " + result.kuerzel);
    manualBtn.disabled = false;
  } else {
    showStatus(statusDiv, "warning", "Bitte Benutzer auswählen");
  }
});

kuerzelSelect.addEventListener("change", function () {
  var value = kuerzelSelect.value;

  if (!value) {
    chrome.storage.sync.remove("kuerzel");
    showStatus(statusDiv, "warning", "Bitte Benutzer auswählen");
    manualBtn.disabled = true;
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#DC2626" });
    return;
  }

  chrome.storage.sync.set({ kuerzel: value }, function () {
    showStatus(statusDiv, "success", "Gespeichert als " + value);
    manualBtn.disabled = false;
    chrome.action.setBadgeText({ text: "" });
  });
});

// ===================================================================
// Manuelles Signal senden
// ===================================================================

manualBtn.addEventListener("click", function () {
  manualBtn.disabled = true;
  manualBtn.textContent = "Wird gesendet...";
  manualStatus.style.display = "none";

  chrome.runtime.sendMessage({ type: "manuelles_signal" }, function (response) {
    manualBtn.disabled = false;
    manualBtn.innerHTML =
      '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />' +
      '</svg> Diese Seite ist eine Bestellung';

    if (response && response.success) {
      showStatus(manualStatus, "success", "Signal gesendet: " + response.domain);
      ladeHistory();
    } else {
      var error = (response && response.error) || "Unbekannter Fehler";
      showStatus(manualStatus, "error", error);
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
