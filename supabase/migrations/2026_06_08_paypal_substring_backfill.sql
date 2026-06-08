-- Migration: PayPal-Substring-Backfill auf ALLE Rechnungen (08.06.2026)
-- ------------------------------------------------------------------
-- Zweck: Pragmatische Regel:
--   "Wenn im Rechnungs-Dokument irgendwo 'paypal' (case-insensitive)
--    vorkommt, gilt die Rechnung als PayPal-bezahlt."
--
-- Diese Migration wendet die Regel auf ALLE existierenden Rechnungen an —
-- inkl. archivierte. Sie ergänzt nur fehlende Markierungen; bestehende
-- bezahlt_am-Werte werden NIE überschrieben.
--
-- Pipeline-Code (dokument-persist.ts) wendet dieselbe Regel laufend an,
-- damit neue Rechnungen direkt korrekt markiert werden. Diese Migration
-- ist der einmalige Backfill für den Altbestand.
--
-- Ausführung:
--   - Supabase Dashboard → SQL Editor → Run
--   - Voraussetzung: Migration 2026_06_03_paypal_payment_detection.sql
--     muss bereits ausgeführt sein (legt Spalten + Trigger an).
--
-- Sicherheits-Garantien:
--   ✔ Nur typ='rechnung' wird angefasst
--   ✔ Nur Dokumente die noch NICHT als bezahlt_bereits markiert sind
--   ✔ Niemals Daten löschen
--   ✔ bezahlt_am nur setzen wenn aktuell NULL (COALESCE)
--   ✔ bezahlt_von nur setzen wenn aktuell NULL (COALESCE)
--   ✔ Archivierte Rechnungen (archiviert_am IS NOT NULL) sind eingeschlossen
-- ------------------------------------------------------------------

-- Schritt 1: Backfill in einer einzigen idempotenten Transaktion.
-- Wir nutzen eine CTE damit wir die getroffenen Zeilen für das Report-
-- Logging einsammeln können.

WITH paypal_treffer AS (
  SELECT id
    FROM dokumente
   WHERE typ = 'rechnung'
     -- Nur was noch NICHT als bezahlt markiert ist
     AND (bezahlt_bereits IS NULL OR bezahlt_bereits = FALSE)
     -- Substring-Match (case-insensitive) auf alle relevanten Felder:
     AND (
          (ki_roh_daten::text ILIKE '%paypal%')
       OR (email_betreff      ILIKE '%paypal%')
       OR (email_absender     ILIKE '%paypal%')
       OR (storage_pfad       ILIKE '%paypal%')
       OR (bestellnummer_erkannt ILIKE '%paypal%')
       -- IBAN-Felder können bei PayPal-Konten auch "PayPal" im Halter
       -- enthalten (selten, aber dokumentiert)
       OR (iban               ILIKE '%paypal%')
     )
),
updated AS (
  UPDATE dokumente d
     SET bezahlt_bereits = TRUE,
         zahlungsmethode = 'paypal',
         -- bezahlt_am nur setzen wenn aktuell leer; NIE überschreiben
         bezahlt_am  = COALESCE(d.bezahlt_am,  NOW()),
         bezahlt_von = COALESCE(d.bezahlt_von, 'Auto-erkannt (paypal)')
    FROM paypal_treffer t
   WHERE d.id = t.id
   RETURNING d.id, d.bestellung_id
)
SELECT COUNT(*) AS rechnungen_aktualisiert
  FROM updated;

-- Schritt 2: Verifikations-Queries (optional zum manuellen Nachprüfen)
--
-- Anzahl PayPal-Rechnungen GESAMT (nach Backfill):
--   SELECT COUNT(*) FROM dokumente
--    WHERE typ='rechnung' AND zahlungsmethode='paypal';
--
-- PayPal-Rechnungen mit Bestellungs-Kontext (Stichprobe):
--   SELECT d.id, d.bezahlt_am, d.bezahlt_von, d.email_absender,
--          b.bestellnummer, b.haendler_name, b.status, b.archiviert_am
--     FROM dokumente d
--     JOIN bestellungen b ON b.id = d.bestellung_id
--    WHERE d.typ='rechnung' AND d.zahlungsmethode='paypal'
--    ORDER BY d.bezahlt_am DESC NULLS LAST
--    LIMIT 20;
--
-- Falls eine Rechnung versehentlich als PayPal markiert wurde, manueller
-- Rollback einer einzelnen Zeile:
--   UPDATE dokumente
--      SET bezahlt_bereits = FALSE,
--          zahlungsmethode = NULL,
--          bezahlt_am = NULL,
--          bezahlt_von = NULL
--    WHERE id = '<doku-id-hier>';
