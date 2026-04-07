// MR Umbau — Early Interceptor Injection (document_start)
// Injiziert interceptor.js in die MAIN world BEVOR Shop-Scripts laufen.
// Verwendet async fetch statt synchronem XHR (deprecated + Performance-Problem).

(function() {
  "use strict";
  try {
    var url = chrome.runtime.getURL("interceptor.js");
    fetch(url).then(function(res) {
      if (!res.ok) return;
      return res.text();
    }).then(function(code) {
      if (!code) return;
      var script = document.createElement("script");
      script.textContent = code;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    }).catch(function() {
      // Fetch fehlgeschlagen → Fallback über chrome.scripting in background.js
    });
  } catch(e) {
    // chrome.runtime nicht verfügbar → ignorieren
  }
})();
