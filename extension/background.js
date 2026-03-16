// MR Umbau Bestellerkennung – Background Service Worker (Manifest V3)

// Badge kurz anzeigen wenn eine Bestellung erkannt wurde
chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === "bestellung_erkannt") {
    // Badge auf "1" setzen für 5 Sekunden
    chrome.action.setBadgeText({ text: "1" });
    chrome.action.setBadgeBackgroundColor({ color: "#1E4D8C" });

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
