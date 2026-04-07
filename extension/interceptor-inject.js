// MR Umbau — Early Interceptor Injection (document_start)
// Injiziert interceptor.js in die MAIN world BEVOR Shop-Scripts laufen.
// Muss als separates content_script mit run_at: "document_start" laufen.

(function() {
  "use strict";
  try {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", chrome.runtime.getURL("interceptor.js"), false);
    xhr.send();
    if (xhr.status === 200) {
      var script = document.createElement("script");
      script.textContent = xhr.responseText;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    }
  } catch(e) {
    // CSP oder anderer Fehler → Fallback auf DOM-Scan in content.js
  }
})();
