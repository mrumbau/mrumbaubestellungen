// MR Umbau Bestellerkennung – Popup Script

const kuerzelSelect = document.getElementById("kuerzel");
const statusDiv = document.getElementById("status");

// Gespeichertes Kürzel laden
chrome.storage.sync.get(["kuerzel"], function (result) {
  if (result.kuerzel) {
    kuerzelSelect.value = result.kuerzel;
    showStatus("success", "Aktiv als " + result.kuerzel);
  } else {
    showStatus("warning", "Bitte Benutzer auswählen");
  }
});

// Kürzel speichern bei Änderung
kuerzelSelect.addEventListener("change", function () {
  const value = kuerzelSelect.value;

  if (!value) {
    chrome.storage.sync.remove("kuerzel");
    showStatus("warning", "Bitte Benutzer auswählen");
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#DC2626" });
    return;
  }

  chrome.storage.sync.set({ kuerzel: value }, function () {
    showStatus("success", "Gespeichert als " + value);
    chrome.action.setBadgeText({ text: "" });
  });
});

function showStatus(type, message) {
  statusDiv.className = "status " + type;
  statusDiv.textContent = message;
}
