-- MR Umbau GmbH – Bestellmanagement Schema
-- Exportiert aus Supabase Projekt: fxeobohsgzvymgbnxbdc
-- Stand: 2026-03-17

-- ============================================================
-- Helper Functions (für RLS Policies)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_rolle()
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT rolle FROM benutzer_rollen WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_kuerzel()
  RETURNS text
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT kuerzel FROM benutzer_rollen WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- Tabellen
-- ============================================================

-- Benutzer-Rollen (verknüpft mit Supabase Auth)
CREATE TABLE benutzer_rollen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  kuerzel TEXT NOT NULL,
  rolle TEXT NOT NULL CHECK (rolle IN ('besteller', 'buchhaltung', 'admin')),
  dashboard_config JSONB DEFAULT '{}',
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
  projekt_id UUID REFERENCES projekte(id),
  projekt_name TEXT,
  kunden_id UUID REFERENCES kunden(id),
  kunden_name TEXT,
  lieferadresse_erkannt TEXT,
  projekt_vorschlag_id UUID REFERENCES projekte(id),
  projekt_vorschlag_konfidenz DECIMAL(3,2),
  projekt_vorschlag_methode TEXT,
  projekt_vorschlag_begruendung TEXT,
  projekt_bestaetigt BOOLEAN DEFAULT false,
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

-- Kunden
CREATE TABLE kunden (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kuerzel TEXT,
  adresse TEXT,
  email TEXT,
  telefon TEXT,
  notizen TEXT,
  keywords TEXT[] DEFAULT '{}',
  farbe TEXT DEFAULT '#2563eb',
  confirmed_at TIMESTAMPTZ, -- NULL = auto-erkannt, noch nicht bestätigt
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Projekte / Baustellen
CREATE TABLE projekte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  beschreibung TEXT,
  kunde TEXT,
  kunden_id UUID REFERENCES kunden(id),
  adresse TEXT,
  adresse_keywords TEXT[] DEFAULT '{}',
  besteller_affinitaet JSONB,
  status TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'abgeschlossen', 'pausiert', 'archiviert')),
  farbe TEXT DEFAULT '#570006',
  budget NUMERIC(10,2),
  erstellt_von UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Firma-Einstellungen (Büro-Adresse, Konfidenz-Schwellwerte etc.)
CREATE TABLE firma_einstellungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schluessel TEXT UNIQUE NOT NULL,
  wert TEXT NOT NULL
);

-- Webhook-Logs (Protokoll für alle Webhook-/Cron-Aufrufe)
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typ TEXT NOT NULL CHECK (typ IN ('email', 'extension', 'cron')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  bestellung_id UUID REFERENCES bestellungen(id),
  bestellnummer TEXT,
  fehler_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

-- bestellung_signale
CREATE INDEX idx_signale_domain_verarbeitet_zeit ON bestellung_signale (haendler_domain, verarbeitet, zeitstempel DESC);
CREATE INDEX idx_signale_kuerzel_domain_zeit ON bestellung_signale (kuerzel, haendler_domain, zeitstempel DESC);

-- haendler
CREATE INDEX idx_haendler_domain ON haendler (domain);

-- benutzer_rollen
CREATE INDEX idx_benutzer_rollen_user_id ON benutzer_rollen (user_id);
CREATE INDEX idx_benutzer_rollen_kuerzel ON benutzer_rollen (kuerzel);

-- bestellungen
CREATE INDEX idx_bestellungen_status ON bestellungen (status);
CREATE INDEX idx_bestellungen_besteller_kuerzel ON bestellungen (besteller_kuerzel);
CREATE INDEX idx_bestellungen_created_at ON bestellungen (created_at DESC);
CREATE INDEX idx_bestellungen_projekt_id ON bestellungen (projekt_id);
CREATE INDEX idx_bestellungen_kunden_id ON bestellungen (kunden_id);
CREATE INDEX idx_bestellungen_projekt_vorschlag_id ON bestellungen (projekt_vorschlag_id);
CREATE INDEX idx_bestellungen_projekt_bestaetigt ON bestellungen (projekt_bestaetigt);
CREATE INDEX idx_bestellungen_bestellnummer ON bestellungen (bestellnummer);
CREATE INDEX idx_bestellungen_updated_at ON bestellungen (updated_at DESC);

-- dokumente
CREATE INDEX idx_dokumente_bestellung_id ON dokumente (bestellung_id);

-- abgleiche
CREATE INDEX idx_abgleiche_bestellung_id ON abgleiche (bestellung_id);

-- freigaben (UNIQUE = max 1 Freigabe pro Bestellung)
CREATE UNIQUE INDEX idx_freigaben_bestellung_unique ON freigaben (bestellung_id);

-- kommentare
CREATE INDEX idx_kommentare_bestellung_id ON kommentare (bestellung_id);

-- kunden
CREATE INDEX idx_kunden_name ON kunden (name);

-- projekte
CREATE INDEX idx_projekte_status ON projekte (status);
CREATE INDEX idx_projekte_kunden_id ON projekte (kunden_id);

-- webhook_logs
CREATE INDEX idx_webhook_logs_created_at ON webhook_logs (created_at DESC);
CREATE INDEX idx_webhook_logs_status ON webhook_logs (status);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE benutzer_rollen ENABLE ROW LEVEL SECURITY;
ALTER TABLE haendler ENABLE ROW LEVEL SECURITY;
ALTER TABLE bestellung_signale ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden ENABLE ROW LEVEL SECURITY;
ALTER TABLE bestellungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE dokumente ENABLE ROW LEVEL SECURITY;
ALTER TABLE abgleiche ENABLE ROW LEVEL SECURITY;
ALTER TABLE freigaben ENABLE ROW LEVEL SECURITY;
ALTER TABLE kommentare ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE projekte ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- benutzer_rollen
CREATE POLICY benutzer_rollen_admin ON benutzer_rollen
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY benutzer_rollen_eigene ON benutzer_rollen
  FOR SELECT USING (user_id = auth.uid());

-- haendler
CREATE POLICY haendler_admin ON haendler
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY haendler_alle_lesen ON haendler
  FOR SELECT USING (true);

-- kunden
CREATE POLICY kunden_admin ON kunden
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY kunden_alle_lesen ON kunden
  FOR SELECT USING (true);

-- firma_einstellungen
ALTER TABLE firma_einstellungen ENABLE ROW LEVEL SECURITY;
CREATE POLICY firma_admin ON firma_einstellungen
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY firma_alle_lesen ON firma_einstellungen
  FOR SELECT USING (true);

-- Seed: Standard-Einstellungen
INSERT INTO firma_einstellungen (schluessel, wert) VALUES ('buero_adresse', '') ON CONFLICT DO NOTHING;
INSERT INTO firma_einstellungen (schluessel, wert) VALUES ('konfidenz_direkt', '0.85') ON CONFLICT DO NOTHING;
INSERT INTO firma_einstellungen (schluessel, wert) VALUES ('konfidenz_vorschlag', '0.60') ON CONFLICT DO NOTHING;

-- bestellung_signale
CREATE POLICY signale_admin ON bestellung_signale
  FOR ALL USING (get_user_rolle() = 'admin');

-- bestellungen
CREATE POLICY admin_alle ON bestellungen
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY besteller_eigene ON bestellungen
  FOR SELECT USING (besteller_kuerzel = get_user_kuerzel());
CREATE POLICY besteller_update_eigene ON bestellungen
  FOR UPDATE USING (besteller_kuerzel = get_user_kuerzel());
CREATE POLICY buchhaltung_freigegeben ON bestellungen
  FOR SELECT USING (get_user_rolle() = 'buchhaltung' AND status = 'freigegeben');

-- dokumente
CREATE POLICY dokumente_admin ON dokumente
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY dokumente_besteller ON dokumente
  FOR SELECT USING (bestellung_id IN (
    SELECT id FROM bestellungen WHERE besteller_kuerzel = get_user_kuerzel()
  ));
CREATE POLICY dokumente_besteller_insert ON dokumente
  FOR INSERT WITH CHECK (bestellung_id IN (
    SELECT id FROM bestellungen WHERE besteller_kuerzel = get_user_kuerzel()
  ));
CREATE POLICY dokumente_besteller_update ON dokumente
  FOR UPDATE USING (bestellung_id IN (
    SELECT id FROM bestellungen WHERE besteller_kuerzel = get_user_kuerzel()
  ));
CREATE POLICY dokumente_buchhaltung ON dokumente
  FOR SELECT USING (
    get_user_rolle() = 'buchhaltung'
    AND bestellung_id IN (SELECT id FROM bestellungen WHERE status = 'freigegeben')
  );

-- abgleiche
CREATE POLICY abgleiche_admin ON abgleiche
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY abgleiche_besteller ON abgleiche
  FOR SELECT USING (bestellung_id IN (
    SELECT id FROM bestellungen WHERE besteller_kuerzel = get_user_kuerzel()
  ));
CREATE POLICY abgleiche_besteller_insert ON abgleiche
  FOR INSERT WITH CHECK (bestellung_id IN (
    SELECT id FROM bestellungen WHERE besteller_kuerzel = get_user_kuerzel()
  ));

-- freigaben
CREATE POLICY freigaben_admin ON freigaben
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY freigaben_besteller ON freigaben
  FOR SELECT USING (bestellung_id IN (
    SELECT id FROM bestellungen WHERE besteller_kuerzel = get_user_kuerzel()
  ));
CREATE POLICY freigaben_besteller_insert ON freigaben
  FOR INSERT WITH CHECK (bestellung_id IN (
    SELECT id FROM bestellungen WHERE besteller_kuerzel = get_user_kuerzel()
  ));

-- kommentare
CREATE POLICY kommentare_admin ON kommentare
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY kommentare_besteller_select ON kommentare
  FOR SELECT USING (bestellung_id IN (
    SELECT id FROM bestellungen WHERE besteller_kuerzel = get_user_kuerzel()
  ));
CREATE POLICY kommentare_besteller_insert ON kommentare
  FOR INSERT WITH CHECK (
    autor_kuerzel = (SELECT kuerzel FROM benutzer_rollen WHERE user_id = auth.uid())
    AND bestellung_id IN (
      SELECT id FROM bestellungen WHERE besteller_kuerzel = (SELECT kuerzel FROM benutzer_rollen WHERE user_id = auth.uid())
    )
  );

-- projekte
CREATE POLICY projekte_admin ON projekte
  FOR ALL USING (get_user_rolle() = 'admin');
CREATE POLICY projekte_besteller_lesen ON projekte
  FOR SELECT USING (get_user_rolle() = 'besteller');
CREATE POLICY projekte_buchhaltung_lesen ON projekte
  FOR SELECT USING (get_user_rolle() = 'buchhaltung');

-- webhook_logs (nur Admin darf lesen, Service Role schreibt)
CREATE POLICY admin_read_webhook_logs ON webhook_logs
  FOR SELECT USING (
    (SELECT rolle FROM benutzer_rollen WHERE user_id = auth.uid()) = 'admin'
  );

-- ============================================================
-- CardScan-Modul (Migration: cardscan_setup, April 2026)
-- ============================================================

CREATE TABLE cardscan_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN
    ('image', 'text', 'url', 'file', 'clipboard', 'share')),
  source_meta JSONB,
  raw_image_path TEXT,
  raw_text TEXT,
  extracted_data JSONB,
  confidence_scores JSONB,
  final_data JSONB,
  crm1_customer_id TEXT,
  crm1_reference_number TEXT,
  crm1_status TEXT CHECK (crm1_status IN ('pending', 'success', 'failed', 'skipped')),
  crm1_error TEXT,
  crm2_customer_id TEXT,
  crm2_reference_number TEXT,
  crm2_status TEXT CHECK (crm2_status IN ('pending', 'success', 'failed', 'skipped')),
  crm2_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending', 'extracting', 'review', 'writing', 'success',
     'partial_success', 'failed', 'discarded')),
  duplicate_matches JSONB,
  duplicate_override BOOLEAN DEFAULT FALSE,
  ocr_duration_ms INT,
  llm_duration_ms INT,
  crm1_duration_ms INT,
  crm2_duration_ms INT
);

CREATE TABLE cardscan_sync_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  capture_id UUID NOT NULL REFERENCES cardscan_captures(id) ON DELETE CASCADE,
  crm TEXT NOT NULL CHECK (crm IN ('crm1', 'crm2')),
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id)
);

CREATE INDEX cardscan_captures_user_created_idx
  ON cardscan_captures(user_id, created_at DESC);
CREATE INDEX cardscan_captures_status_idx
  ON cardscan_captures(status)
  WHERE status IN ('failed', 'partial_success');
CREATE INDEX cardscan_sync_errors_unack_idx
  ON cardscan_sync_errors(acknowledged, created_at DESC)
  WHERE acknowledged = FALSE;

ALTER TABLE cardscan_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardscan_sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cardscan_captures_select_own" ON cardscan_captures
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cardscan_captures_insert_own" ON cardscan_captures
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cardscan_captures_update_own" ON cardscan_captures
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cardscan_captures_admin" ON cardscan_captures
  FOR ALL USING (get_user_rolle() = 'admin');

CREATE POLICY "cardscan_sync_errors_select_own" ON cardscan_sync_errors
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cardscan_sync_errors_update_own" ON cardscan_sync_errors
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cardscan_sync_errors_admin" ON cardscan_sync_errors
  FOR ALL USING (get_user_rolle() = 'admin');

-- Storage: Bucket cardscan-images (privat, RLS)
-- Erstellt via Supabase Dashboard/API, nicht DDL.
-- RLS Policies auf storage.objects:
CREATE POLICY "cardscan_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'cardscan-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "cardscan_images_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'cardscan-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "cardscan_images_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'cardscan-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Dashboard KI-Cache: pro User + typ ein Eintrag, upsert-fähig.
-- Ziel: Auto-Load der KI-Zusammenfassung + KI-Priorisierung beim
-- Page-Load ohne jedesmal OpenAI neu zu fragen. Regeneration
-- on-demand via "Neu generieren"-Button.
-- ============================================================
CREATE TABLE dashboard_ki_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  typ TEXT NOT NULL CHECK (typ IN ('zusammenfassung', 'priorisierung')),
  inhalt JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, typ)
);

CREATE INDEX dashboard_ki_cache_user_typ_idx
  ON dashboard_ki_cache(user_id, typ);

ALTER TABLE dashboard_ki_cache ENABLE ROW LEVEL SECURITY;

-- Jeder User sieht und verwaltet nur eigenen Cache
CREATE POLICY dashboard_ki_cache_own ON dashboard_ki_cache
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
