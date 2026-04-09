# CLAUDE.md – MR Umbau GmbH | Digitales Bestellmanagement
> Dieses Dokument ist der vollständige Projektkontext für Claude Code.
> Lies alles durch bevor du anfängst. Frag nicht nach was hier steht – bau es einfach.

---

## 🏢 Unternehmen & Kontext

**Firma:** MR Umbau GmbH  
**Domain:** mrumbau.de  
**Webapp URL:** cloud.mrumbau.de (Subdomain bereits angelegt, DNS zeigt auf Vercel)  
**E-Mail System:** Microsoft Exchange / Microsoft 365  
**Shared Mailbox:** info@mrumbau.de (SharedMailbox, kein direkter Login)

---

## 👥 Mitarbeiter & Rollen

| Name | E-Mail | Rolle in Webapp | Kürzel |
|---|---|---|---|
| Marlon Tschon | mt@mrumbau.de | besteller | MT |
| Carsten Reuter | cr@reuter-mr.de | besteller | CR |
| Mohammed Hawrami | it@mrumbau.de | besteller | MH |
| Nada Jerinic | bu@mrumbau.de | buchhaltung | NJ |
| Admin | (du) | admin | — |

**Besteller** sehen nur ihre eigenen Bestellungen.  
**Buchhaltung** sieht nur freigegebene Rechnungen.  
**Admin** sieht alles.

---

## 🧩 Das Problem das wir lösen

Marlon, Carsten und Mohammed bestellen bei Lieferanten/Händlern online über deren Webshops. Alle drei verwenden dieselbe E-Mail-Adresse `info@mrumbau.de` für Konten bei Händlern. Dadurch landen alle eingehenden E-Mails (Bestellbestätigung, Lieferschein, Rechnung) ungefiltert in derselben Inbox – ohne Zuordnung wer bestellt hat, welche Dokumente zusammengehören, und ob Mengen/Preise stimmen.

**Ziel:** Vollautomatisches System das erkennt wer bestellt hat, alle 3 Dokumente einer Bestellung verknüpft, per KI inhaltlich abgleicht, und dem Besteller ermöglicht die Rechnung mit einem Klick an die Buchhaltung freizugeben.

---

## 🏗️ Tech Stack

```
Frontend:     Next.js (React) – deployed auf Vercel
Backend:      Vercel API Routes (Serverless Functions)
Datenbank:    Supabase (PostgreSQL)
Auth:         Supabase Auth
Dateispeicher: Supabase Storage (PDFs, Scan-Fotos)
KI:           OpenAI GPT-4o (PDF-Analyse, OCR, Abgleich)
Automation:   Make.com Pro (E-Mail Verarbeitung, Webhooks)
Extension:    Chrome Extension (Besteller-Erkennung)
DNS:          All-Inkl (CNAME cloud → cname.vercel-dns.com)
```

---

## 🔌 MCP Server – Nutzungsanweisungen

**Du hast Zugriff auf folgende MCP Server. Benutze sie aktiv!**

### Supabase MCP (`supabase` – Connected ✅)
- Verwende Supabase MCP um das Schema direkt in der DB anzulegen
- Führe `schema.sql` über Supabase MCP aus – nicht manuell
- Prüfe nach jedem Schritt ob Tabellen korrekt angelegt sind
- Supabase Projekt URL: `https://fxeobohsgzvymgbnxbdc.supabase.co`
- Commands: `list_tables`, `execute_sql`, `apply_migration`, `list_projects`

### Pencil MCP (`pencil` – Connected ✅)
- Verwende Pencil MCP für ALLE UI-Komponenten bevor du React-Code schreibst
- Workflow: Pencil Design generieren → Design als Referenz nehmen → React/Tailwind Code bauen
- Erstelle für jede Hauptseite zuerst ein Pencil-Design:
  1. Login-Seite
  2. Bestellübersicht (Tabelle)
  3. Bestelldetail (Split-View)
  4. Buchhaltungsansicht
  5. Dashboard
- Primärfarbe: #1E4D8C (Dunkelblau), Akzent: #2E6BAD
- Stil: Professionelles Business-Dashboard, deutsch, clean

```

```
/mrumbaubestellungen        ← GitHub Repository Name
  /app                    Next.js App Router
    /login                Login-Seite
    /dashboard            Übersicht + Statistiken
    /bestellungen         Bestellübersicht (gefiltert nach Rolle)
    /bestellungen/[id]    Bestelldetail + PDF-Viewer + KI-Abgleich + Freigabe
    /buchhaltung          Nur freigegebene Rechnungen (Rolle: buchhaltung)
    /einstellungen        Händlerliste + Benutzerverwaltung (Rolle: admin)
  /api                    Vercel API Routes
    /webhook/bestellung   POST – Empfängt Signal von Chrome Extension
    /webhook/email        POST – Empfängt verarbeitete E-Mail-Daten von Make.com
    /bestellungen         GET – Liste (gefiltert nach User-Rolle)
    /bestellungen/[id]    GET – Details + KI-Abgleich
    /bestellungen/[id]/freigeben  POST – Rechnung freigeben
    /pdfs/[id]            GET – PDF aus Supabase Storage abrufen
    /scan                 POST – Hochgeladenes Foto/PDF an OpenAI zur OCR-Analyse
  /extension              Chrome Extension
    manifest.json
    background.js
    content.js
    config.js             Benutzerkürzel + bekannte Händler-URLs
  /supabase
    schema.sql            Komplettes Datenbankschema
    seed.sql              Testdaten
  /lib
    supabase.js           Supabase Client
    openai.js             OpenAI Client + Prompts
    auth.js               Auth Helpers
  CLAUDE.md               Diese Datei
  .env.local              Secrets (nicht in Git)
```

---

## 🗄️ Supabase Datenbankschema

```sql
-- Benutzer-Rollen (verknüpft mit Supabase Auth)
CREATE TABLE benutzer_rollen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  kuerzel TEXT NOT NULL, -- MT, CR, MH, NJ
  rolle TEXT NOT NULL CHECK (rolle IN ('besteller', 'buchhaltung', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bekannte Händler mit URL-Erkennungsmuster
CREATE TABLE haendler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL, -- z.B. bauhaus.de
  url_muster TEXT[], -- z.B. ['/checkout/confirmation', '/bestellbestaetigung']
  email_absender TEXT[], -- z.B. ['bestellung@bauhaus.de', 'noreply@bauhaus.de']
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Temporäre Signale von Chrome Extension
CREATE TABLE bestellung_signale (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kuerzel TEXT NOT NULL, -- MT, CR, MH
  haendler_domain TEXT NOT NULL,
  zeitstempel TIMESTAMPTZ DEFAULT NOW(),
  verarbeitet BOOLEAN DEFAULT FALSE
);

-- Bestellungen (Haupttabelle)
CREATE TABLE bestellungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellnummer TEXT, -- vom Händler, z.B. #45231
  haendler_id UUID REFERENCES haendler(id),
  haendler_name TEXT,
  besteller_kuerzel TEXT NOT NULL, -- MT, CR, MH
  besteller_name TEXT NOT NULL,
  betrag NUMERIC(10,2),
  waehrung TEXT DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN (
    'erwartet',       -- Signal von Chrome Extension, noch keine E-Mail
    'offen',          -- Mindestens 1 Dokument vorhanden
    'vollstaendig',   -- Alle 3 Dokumente vorhanden, Abgleich OK
    'abweichung',     -- KI hat Abweichung gefunden
    'ls_fehlt',       -- Lieferschein fehlt nach 48h
    'freigegeben'     -- Rechnung freigegeben für Buchhaltung
  )),
  hat_bestellbestaetigung BOOLEAN DEFAULT FALSE,
  hat_lieferschein BOOLEAN DEFAULT FALSE,
  hat_rechnung BOOLEAN DEFAULT FALSE,
  lieferschein_physisch BOOLEAN DEFAULT FALSE, -- wurde eingescannt
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Einzelne Dokumente pro Bestellung
CREATE TABLE dokumente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellung_id UUID REFERENCES bestellungen(id),
  typ TEXT NOT NULL CHECK (typ IN ('bestellbestaetigung', 'lieferschein', 'rechnung')),
  quelle TEXT NOT NULL CHECK (quelle IN ('email', 'scan_foto', 'scan_upload', 'email_foto')),
  storage_pfad TEXT, -- Pfad in Supabase Storage
  email_betreff TEXT,
  email_absender TEXT,
  email_datum TIMESTAMPTZ,
  ki_roh_daten JSONB, -- komplette GPT-4o Antwort
  bestellnummer_erkannt TEXT,
  artikel JSONB, -- [{name, menge, einzelpreis, gesamtpreis}]
  gesamtbetrag NUMERIC(10,2),
  netto NUMERIC(10,2),
  mwst NUMERIC(10,2),
  faelligkeitsdatum DATE,
  lieferdatum DATE,
  iban TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- KI-Abgleich Ergebnis
CREATE TABLE abgleiche (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellung_id UUID REFERENCES bestellungen(id),
  status TEXT NOT NULL CHECK (status IN ('ok', 'abweichung', 'unvollstaendig')),
  abweichungen JSONB, -- [{feld, erwartet, gefunden, schwere}]
  ki_zusammenfassung TEXT, -- GPT-4o Erklärung in Deutsch
  erstellt_am TIMESTAMPTZ DEFAULT NOW()
);

-- Freigaben
CREATE TABLE freigaben (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellung_id UUID REFERENCES bestellungen(id),
  freigegeben_von_kuerzel TEXT NOT NULL,
  freigegeben_von_name TEXT NOT NULL,
  freigegeben_am TIMESTAMPTZ DEFAULT NOW(),
  kommentar TEXT
);

-- Kommentare pro Bestellung
CREATE TABLE kommentare (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellung_id UUID REFERENCES bestellungen(id),
  autor_kuerzel TEXT NOT NULL,
  autor_name TEXT NOT NULL,
  text TEXT NOT NULL,
  erstellt_am TIMESTAMPTZ DEFAULT NOW()
);
```

**Row Level Security (RLS) – WICHTIG:**
```sql
-- RLS aktivieren
ALTER TABLE bestellungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE dokumente ENABLE ROW LEVEL SECURITY;
ALTER TABLE abgleiche ENABLE ROW LEVEL SECURITY;
ALTER TABLE kommentare ENABLE ROW LEVEL SECURITY;

-- Besteller sehen nur ihre eigenen Bestellungen
CREATE POLICY besteller_eigene ON bestellungen
  FOR SELECT USING (
    besteller_kuerzel = (SELECT kuerzel FROM benutzer_rollen WHERE user_id = auth.uid())
  );

-- Buchhaltung sieht NUR freigegebene Bestellungen
CREATE POLICY buchhaltung_freigegeben ON bestellungen
  FOR SELECT USING (
    (SELECT rolle FROM benutzer_rollen WHERE user_id = auth.uid()) = 'buchhaltung'
    AND status = 'freigegeben'
  );

-- Admin sieht alles
CREATE POLICY admin_alle ON bestellungen
  FOR ALL USING (
    (SELECT rolle FROM benutzer_rollen WHERE user_id = auth.uid()) = 'admin'
  );

-- Service Role (für API Routes) umgeht RLS
-- API Routes verwenden SUPABASE_SERVICE_ROLE_KEY → kein RLS
```

---

## ⚙️ Umgebungsvariablen (.env.local)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# OpenAI
OPENAI_API_KEY=sk-...

# Make.com Webhook Sicherheit
MAKE_WEBHOOK_SECRET=geheimer-key-hier

# Chrome Extension Sicherheit
EXTENSION_SECRET=geheimer-key-hier
```

---

## 🔄 Make.com Szenarien

### Szenario 1 – Chrome Extension Signal empfangen
```
HINWEIS: Die Chrome Extension sendet DIREKT an die Vercel API Route,
         NICHT über Make.com. Make.com ist hier nicht beteiligt.

Chrome Extension → POST /api/webhook/bestellung
Payload:  { kuerzel: "MT", haendler_domain: "bauhaus.de", zeitstempel: "...", secret: "..." }
Aktion:   Eintrag in bestellung_signale Tabelle via Supabase Service Role
```

### Szenario 2 – Eingehende E-Mail in info@ verarbeiten
```
Auslöser: Neue E-Mail in info@mrumbau.de (Outlook 365 Connector)
Aktion 1: E-Mail-Text + PDF-Anhänge extrahieren
Aktion 2: PDFs als Base64 + E-Mail-Text an /api/webhook/email senden
Payload:  {
  email_betreff, email_absender, email_datum,
  anhaenge: [{ name, base64, mime_type }]
}
```

### Szenario 3 – Freigabe erkannt → Buchhaltung benachrichtigen
```
Auslöser: Supabase Webhook oder Polling – bestellungen.status = 'freigegeben'
Aktion:   E-Mail an bu@mrumbau.de mit:
          - Bestellnummer, Händler, Betrag, Freigegeben von
          - Rechnung als PDF-Anhang
```

---

## 🤖 OpenAI GPT-4o Prompts

### Prompt für PDF/Bild Analyse:
```
Du bist ein Assistent der Geschäftsdokumente für eine deutsche Baufirma analysiert.
Analysiere das folgende Dokument und gib NUR ein JSON-Objekt zurück, kein Text davor oder danach.

Erkenne den Dokumenttyp: bestellbestaetigung, lieferschein, oder rechnung.

Gib folgende Struktur zurück:
{
  "typ": "rechnung",
  "bestellnummer": "#45231",
  "haendler": "Bauhaus GmbH",
  "datum": "2026-03-12",
  "artikel": [
    { "name": "Bosch Bohrmaschine", "menge": 2, "einzelpreis": 89.99, "gesamtpreis": 179.98 }
  ],
  "gesamtbetrag": 234.50,
  "netto": 197.06,
  "mwst": 37.44,
  "faelligkeitsdatum": "2026-03-26",
  "lieferdatum": null,
  "iban": "DE12 3456 7890 1234 5678 90",
  "konfidenz": 0.95
}

Falls ein Feld nicht erkennbar ist, setze null.
```

### Prompt für KI-Abgleich:
```
Du bist ein Prüfassistent für eine deutsche Baufirma.
Vergleiche die drei folgenden Dokumente einer Bestellung und prüfe ob alles übereinstimmt.

Bestellbestätigung: {bestellbestaetigung_daten}
Lieferschein: {lieferschein_daten}
Rechnung: {rechnung_daten}

Gib NUR ein JSON-Objekt zurück:
{
  "status": "ok" | "abweichung",
  "abweichungen": [
    {
      "feld": "menge",
      "artikel": "Bosch Bohrmaschine",
      "erwartet": 2,
      "gefunden": 1,
      "dokument": "lieferschein",
      "schwere": "hoch"
    }
  ],
  "zusammenfassung": "Alles stimmt überein." | "Abweichung gefunden: ..."
}
```

---

## 🌐 Chrome Extension

Die Extension läuft im Hintergrund in Chrome auf jedem Rechner.
Jeder Rechner hat ein eigenes Benutzerkürzel (MT, CR, MH) das einmalig konfiguriert wird.

**Erkennungslogik:**
```javascript
// config.js – Liste der bekannten Händler-Checkout-URLs
const HAENDLER_PATTERNS = [
  { domain: "bauhaus.de", patterns: ["/checkout/confirmation", "/bestellbestaetigung"] },
  { domain: "obi.de", patterns: ["/bestellbestaetigung", "/order-success"] },
  { domain: "amazon.de", patterns: ["/gp/buy/thankyou", "/order-confirm"] },
  { domain: "wuerth.de", patterns: ["/order/success", "/bestellung/bestaetigung"] },
  // Weitere Händler hier hinzufügen
];

// Wenn URL einem Muster entspricht → Webhook senden
const payload = {
  kuerzel: BENUTZER_KUERZEL, // aus config
  haendler_domain: window.location.hostname,
  zeitstempel: new Date().toISOString(),
  secret: EXTENSION_SECRET
};
fetch(WEBHOOK_URL, { method: "POST", body: JSON.stringify(payload) });
```

---

## 📱 Scan-Funktion (physische Lieferscheine)

In der Bestelldetail-Ansicht gibt es einen "Lieferschein scannen" Button.

**Ablauf:**
1. Button öffnet `<input type="file" accept="image/*" capture="environment">` → Handykamera öffnet sich direkt im Browser
2. Foto wird als Base64 an `/api/scan` gesendet
3. API sendet Bild an OpenAI GPT-4o mit OCR-Prompt
4. Extrahierte Daten werden in `dokumente` Tabelle gespeichert
5. KI-Abgleich wird automatisch gestartet
6. Bestellung wird aktualisiert

Zusätzlich: Datei-Upload Button für PC (PDF oder JPG vom Scanner).

---

## 🎨 Frontend UI/UX Anforderungen

### Allgemein
- Modernes, professionelles Design
- Primärfarbe: #1E4D8C (Dunkelblau)
- Akzentfarbe: #2E6BAD
- Responsive – funktioniert auf Handy (für Scan-Funktion)
- Deutsche Sprache durchgehend

### Status-Farben
```
🔵 erwartet    → Grau   – Signal empfangen, E-Mail noch nicht da
⏳ offen       → Blau   – Dokumente kommen rein
🟢 vollständig → Grün   – Alles da, bereit zur Freigabe
🔴 abweichung  → Rot    – KI hat Problem gefunden
🟡 ls_fehlt    → Gelb   – Lieferschein fehlt nach 48h
✅ freigegeben → Grün (ausgefüllt) – An Buchhaltung übermittelt
```

### Bestellübersicht (Hauptansicht für Besteller)
- Tabelle mit: Bestellnummer, Händler, Datum, Bestätigung ✅/⏳, Lieferschein ✅/⏳, Rechnung ✅/⏳, Status, Aktion
- Filter: Status, Händler, Datum
- Suche: Bestellnummer, Händler

### Bestelldetail
- Oben: Zusammenfassung (Händler, Besteller, Betrag, Status)
- Links: PDF-Viewer (alle 3 Dokumente tabs)
- Rechts: KI-Abgleich Ergebnis (grün = OK, rot = Abweichung mit Erklärung)
- Unten: Kommentarfeld, Scan-Button, Freigabe-Button
- Freigabe-Button nur aktiv wenn: alle 3 Dokumente vorhanden ODER Besteller bestätigt manuell

### Buchhaltungsansicht (Nada)
- Nur freigegebene Rechnungen
- Spalten: Bestellnummer, Händler, Betrag, Freigegeben von, Freigegeben am, Fällig, PDF-Download
- CSV-Export Button
- Summe aller offenen Rechnungen anzeigen

---

## 🔗 API Routes – Detailspezifikation

### POST /api/webhook/bestellung
```javascript
// Empfängt Signal von Chrome Extension
// Prüft EXTENSION_SECRET
// Speichert in bestellung_signale
// Response: { success: true }
```

### POST /api/webhook/email
```javascript
// Empfängt E-Mail-Daten von Make.com
// Prüft MAKE_WEBHOOK_SECRET
// 1. PDFs an OpenAI senden → Daten extrahieren
// 2. Besteller ermitteln: bestellung_signale nach Händler + Zeitstempel (±60 min)
// 3. Bestellung in DB anlegen oder updaten
// 4. Wenn alle 3 Dokumente da → KI-Abgleich starten
// 5. Status aktualisieren
// Response: { success: true, bestellung_id: "..." }
```

### POST /api/bestellungen/[id]/freigeben
```javascript
// Prüft ob User Besteller dieser Bestellung ist (RLS)
// Erstellt Eintrag in freigaben Tabelle
// Aktualisiert bestellungen.status = 'freigegeben'
// Triggert Make.com Szenario 3 (Webhook an Make.com)
// Response: { success: true }
```

### POST /api/scan
```javascript
// Empfängt Base64 Bild oder PDF
// Sendet an OpenAI GPT-4o mit OCR-Prompt
// Speichert PDF/Bild in Supabase Storage
// Speichert extrahierte Daten in dokumente Tabelle
// Startet KI-Abgleich wenn alle Dokumente vorhanden
// Response: { success: true, dokument_id: "..." }
```

---

## 📋 Implementierungsreihenfolge

Baue in genau dieser Reihenfolge:

1. **Supabase Setup** – schema.sql ausführen, RLS aktivieren, Storage Bucket anlegen
2. **Next.js Grundstruktur** – App Router, Supabase Client, Auth Middleware
3. **Login-Seite** – Supabase Auth, Weiterleitung nach Rolle
4. **Vercel API Routes** – alle Endpunkte, zuerst Webhooks
5. **OpenAI Integration** – PDF-Analyse Prompt + Abgleich-Prompt testen
6. **Make.com Szenarien** – Szenario 2 zuerst (E-Mail), dann 1 und 3
7. **Chrome Extension** – manifest.json, background.js, config.js
8. **Frontend Bestellübersicht** – Tabelle mit Filtern
9. **Frontend Bestelldetail** – PDF-Viewer, KI-Abgleich, Freigabe
10. **Scan-Funktion** – Kamera + Upload
11. **Buchhaltungsansicht** – gefilterte Ansicht + CSV Export
12. **Dashboard** – Statistiken, offene Aktionen

---

## ✅ Definition of Done

Das System ist fertig wenn:
- [ ] Marlon bestellt bei Bauhaus → Bestellung erscheint automatisch unter seinem Namen in der Webapp
- [ ] Bestellbestätigung, Lieferschein, Rechnung werden automatisch verknüpft
- [ ] KI-Abgleich erkennt Abweichungen und zeigt sie verständlich an
- [ ] Physischer Lieferschein kann per Handy-Kamera eingescannt werden
- [ ] Marlon klickt "Freigeben" → Nada sieht die Rechnung sofort in ihrer Ansicht
- [ ] Nada kann CSV-Export der freigegebenen Rechnungen erstellen
- [ ] Alles läuft auf cloud.mrumbau.de mit HTTPS

---

## 🚫 Was NICHT gebaut wird

- Keine eigene Buchhaltungssoftware – nur Freigabe-Workflow
- Kein ERP-System
- Keine Anbindung an DATEV (noch nicht)
- Kein automatisches Bezahlen
- Keine Bestellfunktion in der Webapp selbst

---

---

## 📇 CardScan-Modul

**URL:** `/cardscan` (Route-Group `(cardscan)`, eigenes Layout ohne Sidebar)  
**Zweck:** Kontaktdaten aus beliebigen Quellen erfassen und parallel in zwei das-programm.io CRM-Konten anlegen.

**Input-Modi:** Text, Kamera, Foto-Upload (JPEG/PNG/WebP/HEIC), PDF, DOCX, vCard (.vcf), URL-Scraping, Clipboard, Share Target  
**KI-Pipeline:** Google Cloud Vision OCR → GPT-4o Structured Outputs (strict JSON Schema)  
**CRM:** Dual-Write via GraphQL API, Dry-Run-Modus wenn Token leer/DRY_RUN

**Neue Env-Vars (in .env.local):**
```
GOOGLE_CLOUD_VISION_API_KEY=AIza...
DAS_PROGRAMM_TOKEN_CRM1=...
DAS_PROGRAMM_TOKEN_CRM2=... (oder DRY_RUN)
DAS_PROGRAMM_ENDPOINT=https://app.das-programm.io/api/graphql
```

**DB-Tabellen:** `cardscan_captures`, `cardscan_sync_errors` (mit RLS)  
**Storage:** Bucket `cardscan-images` (privat, RLS)  
**Service Worker:** `/cardscan-sw.js` auf `/cardscan` scoped – keine Interaktion mit Bestellwesen  
**Dependencies:** `heic2any`, `cheerio`, `pdf-parse`, `mammoth`

**Architektur-Prinzip:** Vollständig getrennt vom Bestellwesen. Keine Änderungen an bestehenden Tabellen, Routen oder Komponenten. Nur zentrale Utility-Libraries werden wiederverwendet (auth, csrf, rate-limit, errors, logger, supabase).

---

*Erstellt aus einem ausführlichen Planungsgespräch. Alle Entscheidungen wurden bewusst getroffen.*  
*Version 2.0 | März 2026 | MR Umbau GmbH*  
*MCPs: Supabase ✅ + Pencil ✅ konfiguriert und ready*
