-- MR Umbau GmbH – Bestellmanagement Schema
-- Exportiert aus Supabase Projekt: fxeobohsgzvymgbnxbdc
-- Stand: 2026-03-16

-- Benutzer-Rollen (verknüpft mit Supabase Auth)
CREATE TABLE benutzer_rollen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  kuerzel TEXT NOT NULL,
  rolle TEXT NOT NULL CHECK (rolle IN ('besteller', 'buchhaltung', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bekannte Händler mit URL-Erkennungsmuster
CREATE TABLE haendler (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  url_muster TEXT[],
  email_absender TEXT[],
  confirmed_at TIMESTAMPTZ, -- NULL = noch nicht vom Admin bestätigt
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Temporäre Signale von Chrome Extension
CREATE TABLE bestellung_signale (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kuerzel TEXT NOT NULL,
  haendler_domain TEXT NOT NULL,
  zeitstempel TIMESTAMPTZ DEFAULT NOW(),
  verarbeitet BOOLEAN DEFAULT FALSE
);

-- Bestellungen (Haupttabelle)
CREATE TABLE bestellungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellnummer TEXT,
  haendler_id UUID REFERENCES haendler(id),
  haendler_name TEXT,
  besteller_kuerzel TEXT NOT NULL,
  besteller_name TEXT NOT NULL,
  betrag NUMERIC(10,2),
  waehrung TEXT DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN (
    'erwartet', 'offen', 'vollstaendig', 'abweichung', 'ls_fehlt', 'freigegeben'
  )),
  hat_bestellbestaetigung BOOLEAN DEFAULT FALSE,
  hat_lieferschein BOOLEAN DEFAULT FALSE,
  hat_rechnung BOOLEAN DEFAULT FALSE,
  lieferschein_physisch BOOLEAN DEFAULT FALSE,
  zuordnung_methode TEXT, -- signal_60min, signal_24h, haendler_affinitaet, name_im_text, email_body_ki, ki_historien, manuell_admin, unbekannt
  artikel_kategorien JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Einzelne Dokumente pro Bestellung
CREATE TABLE dokumente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bestellung_id UUID REFERENCES bestellungen(id),
  typ TEXT NOT NULL CHECK (typ IN ('bestellbestaetigung', 'lieferschein', 'rechnung')),
  quelle TEXT NOT NULL CHECK (quelle IN ('email', 'scan_foto', 'scan_upload', 'email_foto')),
  storage_pfad TEXT,
  email_betreff TEXT,
  email_absender TEXT,
  email_datum TIMESTAMPTZ,
  ki_roh_daten JSONB,
  bestellnummer_erkannt TEXT,
  artikel JSONB,
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
  abweichungen JSONB,
  ki_zusammenfassung TEXT,
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

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE benutzer_rollen ENABLE ROW LEVEL SECURITY;
ALTER TABLE haendler ENABLE ROW LEVEL SECURITY;
ALTER TABLE bestellung_signale ENABLE ROW LEVEL SECURITY;
ALTER TABLE bestellungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE dokumente ENABLE ROW LEVEL SECURITY;
ALTER TABLE abgleiche ENABLE ROW LEVEL SECURITY;
ALTER TABLE freigaben ENABLE ROW LEVEL SECURITY;
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
