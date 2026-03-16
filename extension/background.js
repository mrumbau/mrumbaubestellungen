// MR Umbau Bestellerkennung – Background Service Worker (Manifest V3)

// Badge-Farben nach Erkennungsquelle
var BADGE_COLORS = {
  bekannt: "#570006",      // Corporate Rot – bekannter Händler
  lokal_score: "#2563eb",  // Blau – lokaler Score
  ki: "#d97706",           // Orange – KI-bestätigt
};

chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === "bestellung_erkannt") {
    var badgeColor = BADGE_COLORS[message.quelle] || "#570006";

    chrome.action.setBadgeText({ text: "1" });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });

    setTimeout(function () {
      chrome.action.setBadgeText({ text: "" });
    }, 5000);
  }
});

// Bei Installation Standard-Kürzel-Hinweis setzen
chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get(["kuerzel"], function (result) {
    if (!result.kuerzel) {
      // Badge als Erinnerung dass Kürzel noch fehlt
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#DC2626" });
    }
  });
});
