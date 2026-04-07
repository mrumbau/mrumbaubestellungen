// MR Umbau — MAIN World Interceptor
// Fängt fetch() und XMLHttpRequest ab um Bestellnummern aus API-Responses zu extrahieren.
// Wird als inline-Script in die MAIN world injiziert (von content.js).
// Kommuniziert via window.postMessage zurück zum ISOLATED content script.

(function() {
  "use strict";

  // ===================================================================
  // Checkout-URL Erkennung
  // ===================================================================

  var CHECKOUT_PATTERNS = [
    // Generische Checkout-Endpoints
    "/checkout/confirm", "/checkout/order", "/checkout/complete", "/checkout/submit",
    "/checkout/place", "/checkout/finish", "/checkout/success", "/checkout/done",
    // Order-Endpoints
    "/order/create", "/order/submit", "/order/place", "/order/confirm",
    "/order/complete", "/order/finish",
    // Deutsche Varianten
    "/bestellung/absenden", "/bestellung/bestaetigen", "/bestellung/abschliessen",
    "/bestellung/aufgeben", "/kasse/absenden", "/kasse/bestaetigen",
    // API-Endpoints (spezifisch — nicht /api/order allein, das matcht auch /api/orders und Order-History)
    "/api/order/create", "/api/order/submit", "/api/order/place", "/api/order/confirm",
    "/api/checkout/submit", "/api/checkout/confirm", "/api/checkout/complete",
    "/api/purchase/create", "/api/purchase/confirm",
    "/api/cart/checkout", "/api/cart/submit",
    // Shop-spezifisch
    "/buy/submit", "/purchase/complete", "/purchase/confirm",
    "/cart/order", "/cart/submit", "/cart/complete",
    // Amazon
    "/gp/buy/spc/handlers/static-submit-decoupled",
    "/gp/buy/shared/handlers/async-continue",
  ];

  function isCheckoutUrl(url) {
    if (!url) return false;
    var lower = String(url).toLowerCase();
    for (var i = 0; i < CHECKOUT_PATTERNS.length; i++) {
      if (lower.indexOf(CHECKOUT_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  // ===================================================================
  // Bestellnummer aus JSON extrahieren
  // ===================================================================

  var DIRECT_FIELDS = [
    // Englisch
    "orderId", "orderNumber", "order_id", "order_number", "orderNo", "order_no",
    "orderID", "OrderId", "OrderNumber",
    // Deutsch
    "bestellnummer", "bestellNummer", "Bestellnummer",
    "auftragsnummer", "auftragsNummer", "Auftragsnummer", "auftragsNr",
    // Confirmation
    "confirmationNumber", "confirmation_number", "confirmationId", "confirmation_id",
    // Transaction
    "transactionId", "transaction_id", "transactionNumber",
    // Purchase
    "purchaseId", "purchase_id", "purchaseNumber",
    // Referenz
    "referenceNumber", "reference_number", "referenceId",
  ];

  var NESTED_KEYS = ["order", "confirmation", "result", "data", "response", "checkout", "purchase", "payload"];

  function extractOrderFromJson(data, depth) {
    if (!data || typeof data !== "object" || (depth || 0) > 3) return null;

    // Array? Erstes Element prüfen
    if (Array.isArray(data)) {
      if (data.length > 0 && typeof data[0] === "object") {
        return extractOrderFromJson(data[0], (depth || 0) + 1);
      }
      return null;
    }

    // Direkte Felder prüfen
    for (var i = 0; i < DIRECT_FIELDS.length; i++) {
      var val = data[DIRECT_FIELDS[i]];
      if (val && (typeof val === "string" || typeof val === "number")) {
        var str = String(val).trim();
        if (str.length >= 3 && str.length <= 40) return str;
      }
    }

    // Verschachtelte Objekte prüfen
    for (var j = 0; j < NESTED_KEYS.length; j++) {
      var nested = data[NESTED_KEYS[j]];
      if (nested && typeof nested === "object") {
        var found = extractOrderFromJson(nested, (depth || 0) + 1);
        if (found) return found;
      }
    }

    // Letzter Versuch: "id" oder "number" Feld wenn es nach Bestellnummer aussieht
    if (data.id && typeof data.id === "string" && /^[A-Z0-9][\w\-]{2,29}$/i.test(data.id)) {
      return data.id;
    }
    if (data.number && typeof data.number === "string" && /^[A-Z0-9][\w\-]{2,29}$/i.test(data.number)) {
      return data.number;
    }

    return null;
  }

  // ===================================================================
  // Bereits gesendet? (verhindert Doppelsignale)
  // ===================================================================

  var alreadySent = {};

  function sendOrderSignal(orderNumber, source) {
    if (alreadySent[orderNumber]) return;
    alreadySent[orderNumber] = true;

    window.postMessage({
      type: "MR_UMBAU_ORDER",
      orderNumber: orderNumber,
      source: source,
      timestamp: new Date().toISOString(),
    }, "*");
  }

  // ===================================================================
  // fetch() Monkey-Patch
  // ===================================================================

  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var result = origFetch.apply(this, arguments);

    try {
      var method = (init && init.method) ? init.method.toUpperCase() : "GET";
      var urlStr = typeof input === "string" ? input : (input && input.url ? input.url : "");

      if (method !== "GET" && isCheckoutUrl(urlStr)) {
        result.then(function(response) {
          var clone = response.clone();
          clone.json().then(function(data) {
            var orderNum = extractOrderFromJson(data, 0);
            if (orderNum) {
              sendOrderSignal(orderNum, "fetch");
            }
          }).catch(function() { /* Kein JSON → ignorieren */ });
        }).catch(function() { /* Netzwerkfehler → ignorieren */ });
      }
    } catch(e) { /* Fehler im Interceptor darf fetch nicht blockieren */ }

    return result;
  };

  // ===================================================================
  // XMLHttpRequest Monkey-Patch
  // ===================================================================

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._mrMethod = method;
    this._mrUrl = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    try {
      if (this._mrMethod && this._mrMethod.toUpperCase() !== "GET" && isCheckoutUrl(this._mrUrl)) {
        var xhr = this;
        xhr.addEventListener("load", function() {
          try {
            if (xhr.responseType === "" || xhr.responseType === "text" || xhr.responseType === "json") {
              var data = xhr.responseType === "json" ? xhr.response : JSON.parse(xhr.responseText);
              var orderNum = extractOrderFromJson(data, 0);
              if (orderNum) {
                sendOrderSignal(orderNum, "xhr");
              }
            }
          } catch(e) { /* Parse-Fehler → ignorieren */ }
        });
      }
    } catch(e) { /* Fehler im Interceptor darf XHR nicht blockieren */ }

    return origSend.apply(this, arguments);
  };

  // Flag für content.js (CSP-Fallback Check)
  window.__mrUmbauInterceptor = true;

  console.debug("[MR Umbau] API-Interceptor aktiv");

})();
