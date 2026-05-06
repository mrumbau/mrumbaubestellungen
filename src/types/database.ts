export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      abgleiche: {
        Row: {
          abweichungen: Json | null
          bestellung_id: string | null
          erstellt_am: string | null
          id: string
          ki_zusammenfassung: string | null
          status: string
        }
        Insert: {
          abweichungen?: Json | null
          bestellung_id?: string | null
          erstellt_am?: string | null
          id?: string
          ki_zusammenfassung?: string | null
          status: string
        }
        Update: {
          abweichungen?: Json | null
          bestellung_id?: string | null
          erstellt_am?: string | null
          id?: string
          ki_zusammenfassung?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "abgleiche_bestellung_id_fkey"
            columns: ["bestellung_id"]
            isOneToOne: false
            referencedRelation: "bestellungen"
            referencedColumns: ["id"]
          },
        ]
      }
      abo_anbieter: {
        Row: {
          created_at: string
          domain: string
          email_absender: string[] | null
          erwarteter_betrag: number | null
          id: string
          intervall: string | null
          kuendigungsfrist_tage: number | null
          letzte_rechnung_am: string | null
          letzter_betrag: number | null
          naechste_rechnung: string | null
          name: string
          notizen: string | null
          toleranz_prozent: number | null
          vertragsbeginn: string | null
          vertragsende: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          email_absender?: string[] | null
          erwarteter_betrag?: number | null
          id?: string
          intervall?: string | null
          kuendigungsfrist_tage?: number | null
          letzte_rechnung_am?: string | null
          letzter_betrag?: number | null
          naechste_rechnung?: string | null
          name: string
          notizen?: string | null
          toleranz_prozent?: number | null
          vertragsbeginn?: string | null
          vertragsende?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          email_absender?: string[] | null
          erwarteter_betrag?: number | null
          id?: string
          intervall?: string | null
          kuendigungsfrist_tage?: number | null
          letzte_rechnung_am?: string | null
          letzter_betrag?: number | null
          naechste_rechnung?: string | null
          name?: string
          notizen?: string | null
          toleranz_prozent?: number | null
          vertragsbeginn?: string | null
          vertragsende?: string | null
        }
        Relationships: []
      }
      benutzer_rollen: {
        Row: {
          created_at: string
          dashboard_config: Json | null
          email: string
          id: string
          kuerzel: string
          name: string
          rolle: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          dashboard_config?: Json | null
          email: string
          id?: string
          kuerzel: string
          name: string
          rolle: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          dashboard_config?: Json | null
          email?: string
          id?: string
          kuerzel?: string
          name?: string
          rolle?: string
          user_id?: string | null
        }
        Relationships: []
      }
      besteller_rules: {
        Row: {
          condition: Json
          confidence: number
          created_at: string
          created_by: string | null
          enabled: boolean
          hit_count: number
          id: string
          last_hit_at: string | null
          name: string
          notes: string | null
          priority: number
          target_kuerzel: string | null
        }
        Insert: {
          condition: Json
          confidence?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          name: string
          notes?: string | null
          priority?: number
          target_kuerzel?: string | null
        }
        Update: {
          condition?: Json
          confidence?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          name?: string
          notes?: string | null
          priority?: number
          target_kuerzel?: string | null
        }
        Relationships: []
      }
      bestellung_signale: {
        Row: {
          confidence: number | null
          erkennung: string | null
          haendler_domain: string
          id: string
          kuerzel: string
          matched_bestellung_id: string | null
          order_nummer: string | null
          page_title: string | null
          status: string | null
          url_path: string | null
          verarbeitet: boolean | null
          zeitstempel: string | null
        }
        Insert: {
          confidence?: number | null
          erkennung?: string | null
          haendler_domain: string
          id?: string
          kuerzel: string
          matched_bestellung_id?: string | null
          order_nummer?: string | null
          page_title?: string | null
          status?: string | null
          url_path?: string | null
          verarbeitet?: boolean | null
          zeitstempel?: string | null
        }
        Update: {
          confidence?: number | null
          erkennung?: string | null
          haendler_domain?: string
          id?: string
          kuerzel?: string
          matched_bestellung_id?: string | null
          order_nummer?: string | null
          page_title?: string | null
          status?: string | null
          url_path?: string | null
          verarbeitet?: boolean | null
          zeitstempel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bestellung_signale_matched_bestellung_id_fkey"
            columns: ["matched_bestellung_id"]
            isOneToOne: false
            referencedRelation: "bestellungen"
            referencedColumns: ["id"]
          },
        ]
      }
      bestellungen: {
        Row: {
          archiviert_am: string | null
          archiviert_von: string | null
          artikel_kategorien: Json | null
          auftragsnummer: string | null
          bestelldatum: string | null
          besteller_kuerzel: string
          besteller_name: string
          bestellnummer: string | null
          bestellungsart: string
          betrag: number | null
          betrag_ist_netto: boolean | null
          bezahlt_am: string | null
          bezahlt_von: string | null
          created_at: string
          faelligkeitsdatum: string | null
          haendler_id: string | null
          haendler_name: string | null
          hat_aufmass: boolean | null
          hat_bestellbestaetigung: boolean | null
          hat_leistungsnachweis: boolean | null
          hat_lieferschein: boolean | null
          hat_rechnung: boolean | null
          hat_versandbestaetigung: boolean | null
          id: string
          kunden_id: string | null
          kunden_name: string | null
          kundennummer: string | null
          lieferadresse_erkannt: string | null
          lieferschein_physisch: boolean | null
          lieferscheinnummer: string | null
          mahnung_am: string | null
          mahnung_count: number | null
          projekt_bestaetigt: boolean | null
          projekt_id: string | null
          projekt_name: string | null
          projekt_referenz: string | null
          projekt_vorschlag_begruendung: string | null
          projekt_vorschlag_id: string | null
          projekt_vorschlag_konfidenz: number | null
          projekt_vorschlag_methode: string | null
          status: string
          subunternehmer_id: string | null
          tracking_nummer: string | null
          tracking_url: string | null
          updated_at: string | null
          versanddienstleister: string | null
          voraussichtliche_lieferung: string | null
          waehrung: string | null
          zuordnung_methode: string | null
        }
        Insert: {
          archiviert_am?: string | null
          archiviert_von?: string | null
          artikel_kategorien?: Json | null
          auftragsnummer?: string | null
          bestelldatum?: string | null
          besteller_kuerzel: string
          besteller_name: string
          bestellnummer?: string | null
          bestellungsart?: string
          betrag?: number | null
          betrag_ist_netto?: boolean | null
          bezahlt_am?: string | null
          bezahlt_von?: string | null
          created_at?: string
          faelligkeitsdatum?: string | null
          haendler_id?: string | null
          haendler_name?: string | null
          hat_aufmass?: boolean | null
          hat_bestellbestaetigung?: boolean | null
          hat_leistungsnachweis?: boolean | null
          hat_lieferschein?: boolean | null
          hat_rechnung?: boolean | null
          hat_versandbestaetigung?: boolean | null
          id?: string
          kunden_id?: string | null
          kunden_name?: string | null
          kundennummer?: string | null
          lieferadresse_erkannt?: string | null
          lieferschein_physisch?: boolean | null
          lieferscheinnummer?: string | null
          mahnung_am?: string | null
          mahnung_count?: number | null
          projekt_bestaetigt?: boolean | null
          projekt_id?: string | null
          projekt_name?: string | null
          projekt_referenz?: string | null
          projekt_vorschlag_begruendung?: string | null
          projekt_vorschlag_id?: string | null
          projekt_vorschlag_konfidenz?: number | null
          projekt_vorschlag_methode?: string | null
          status?: string
          subunternehmer_id?: string | null
          tracking_nummer?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          versanddienstleister?: string | null
          voraussichtliche_lieferung?: string | null
          waehrung?: string | null
          zuordnung_methode?: string | null
        }
        Update: {
          archiviert_am?: string | null
          archiviert_von?: string | null
          artikel_kategorien?: Json | null
          auftragsnummer?: string | null
          bestelldatum?: string | null
          besteller_kuerzel?: string
          besteller_name?: string
          bestellnummer?: string | null
          bestellungsart?: string
          betrag?: number | null
          betrag_ist_netto?: boolean | null
          bezahlt_am?: string | null
          bezahlt_von?: string | null
          created_at?: string
          faelligkeitsdatum?: string | null
          haendler_id?: string | null
          haendler_name?: string | null
          hat_aufmass?: boolean | null
          hat_bestellbestaetigung?: boolean | null
          hat_leistungsnachweis?: boolean | null
          hat_lieferschein?: boolean | null
          hat_rechnung?: boolean | null
          hat_versandbestaetigung?: boolean | null
          id?: string
          kunden_id?: string | null
          kunden_name?: string | null
          kundennummer?: string | null
          lieferadresse_erkannt?: string | null
          lieferschein_physisch?: boolean | null
          lieferscheinnummer?: string | null
          mahnung_am?: string | null
          mahnung_count?: number | null
          projekt_bestaetigt?: boolean | null
          projekt_id?: string | null
          projekt_name?: string | null
          projekt_referenz?: string | null
          projekt_vorschlag_begruendung?: string | null
          projekt_vorschlag_id?: string | null
          projekt_vorschlag_konfidenz?: number | null
          projekt_vorschlag_methode?: string | null
          status?: string
          subunternehmer_id?: string | null
          tracking_nummer?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          versanddienstleister?: string | null
          voraussichtliche_lieferung?: string | null
          waehrung?: string | null
          zuordnung_methode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bestellungen_haendler_id_fkey"
            columns: ["haendler_id"]
            isOneToOne: false
            referencedRelation: "haendler"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bestellungen_kunden_id_fkey"
            columns: ["kunden_id"]
            isOneToOne: false
            referencedRelation: "kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bestellungen_projekt_id_fkey"
            columns: ["projekt_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bestellungen_projekt_vorschlag_id_fkey"
            columns: ["projekt_vorschlag_id"]
            isOneToOne: false
            referencedRelation: "projekte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bestellungen_subunternehmer_id_fkey"
            columns: ["subunternehmer_id"]
            isOneToOne: false
            referencedRelation: "subunternehmer"
            referencedColumns: ["id"]
          },
        ]
      }
      cardscan_captures: {
        Row: {
          confidence_scores: Json | null
          created_at: string
          crm1_customer_id: string | null
          crm1_duration_ms: number | null
          crm1_error: string | null
          crm1_reference_number: string | null
          crm1_status: string | null
          crm2_customer_id: string | null
          crm2_duration_ms: number | null
          crm2_error: string | null
          crm2_reference_number: string | null
          crm2_status: string | null
          duplicate_matches: Json | null
          duplicate_override: boolean | null
          extracted_data: Json | null
          final_data: Json | null
          id: string
          llm_duration_ms: number | null
          ocr_duration_ms: number | null
          openai_cost_eur: number | null
          openai_input_tokens: number | null
          openai_output_tokens: number | null
          raw_image_path: string | null
          raw_text: string | null
          source_meta: Json | null
          source_type: string
          status: string
          updated_at: string
          user_id: string
          vision_cost_eur: number | null
        }
        Insert: {
          confidence_scores?: Json | null
          created_at?: string
          crm1_customer_id?: string | null
          crm1_duration_ms?: number | null
          crm1_error?: string | null
          crm1_reference_number?: string | null
          crm1_status?: string | null
          crm2_customer_id?: string | null
          crm2_duration_ms?: number | null
          crm2_error?: string | null
          crm2_reference_number?: string | null
          crm2_status?: string | null
          duplicate_matches?: Json | null
          duplicate_override?: boolean | null
          extracted_data?: Json | null
          final_data?: Json | null
          id?: string
          llm_duration_ms?: number | null
          ocr_duration_ms?: number | null
          openai_cost_eur?: number | null
          openai_input_tokens?: number | null
          openai_output_tokens?: number | null
          raw_image_path?: string | null
          raw_text?: string | null
          source_meta?: Json | null
          source_type: string
          status?: string
          updated_at?: string
          user_id: string
          vision_cost_eur?: number | null
        }
        Update: {
          confidence_scores?: Json | null
          created_at?: string
          crm1_customer_id?: string | null
          crm1_duration_ms?: number | null
          crm1_error?: string | null
          crm1_reference_number?: string | null
          crm1_status?: string | null
          crm2_customer_id?: string | null
          crm2_duration_ms?: number | null
          crm2_error?: string | null
          crm2_reference_number?: string | null
          crm2_status?: string | null
          duplicate_matches?: Json | null
          duplicate_override?: boolean | null
          extracted_data?: Json | null
          final_data?: Json | null
          id?: string
          llm_duration_ms?: number | null
          ocr_duration_ms?: number | null
          openai_cost_eur?: number | null
          openai_input_tokens?: number | null
          openai_output_tokens?: number | null
          raw_image_path?: string | null
          raw_text?: string | null
          source_meta?: Json | null
          source_type?: string
          status?: string
          updated_at?: string
          user_id?: string
          vision_cost_eur?: number | null
        }
        Relationships: []
      }
      cardscan_sync_errors: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          capture_id: string
          created_at: string
          crm: string
          error_details: Json | null
          error_message: string
          error_type: string
          id: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          capture_id: string
          created_at?: string
          crm: string
          error_details?: Json | null
          error_message: string
          error_type: string
          id?: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          capture_id?: string
          created_at?: string
          crm?: string
          error_details?: Json | null
          error_message?: string
          error_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cardscan_sync_errors_capture_id_fkey"
            columns: ["capture_id"]
            isOneToOne: false
            referencedRelation: "cardscan_captures"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_ki_cache: {
        Row: {
          generated_at: string
          id: string
          inhalt: Json
          typ: string
          user_id: string
        }
        Insert: {
          generated_at?: string
          id?: string
          inhalt: Json
          typ: string
          user_id: string
        }
        Update: {
          generated_at?: string
          id?: string
          inhalt?: Json
          typ?: string
          user_id?: string
        }
        Relationships: []
      }
      dokumente: {
        Row: {
          artikel: Json | null
          auftragsnummer: string | null
          bestelldatum: string | null
          besteller_im_dokument: string | null
          bestellnummer_erkannt: string | null
          bestellung_id: string | null
          content_hash: string | null
          created_at: string
          email_absender: string | null
          email_betreff: string | null
          email_datum: string | null
          faelligkeitsdatum: string | null
          gesamtbetrag: number | null
          iban: string | null
          id: string
          ki_roh_daten: Json | null
          kundennummer: string | null
          lieferdatum: string | null
          lieferscheinnummer: string | null
          mwst: number | null
          netto: number | null
          projekt_referenz: string | null
          quelle: string
          storage_pfad: string | null
          typ: string
        }
        Insert: {
          artikel?: Json | null
          auftragsnummer?: string | null
          bestelldatum?: string | null
          besteller_im_dokument?: string | null
          bestellnummer_erkannt?: string | null
          bestellung_id?: string | null
          content_hash?: string | null
          created_at?: string
          email_absender?: string | null
          email_betreff?: string | null
          email_datum?: string | null
          faelligkeitsdatum?: string | null
          gesamtbetrag?: number | null
          iban?: string | null
          id?: string
          ki_roh_daten?: Json | null
          kundennummer?: string | null
          lieferdatum?: string | null
          lieferscheinnummer?: string | null
          mwst?: number | null
          netto?: number | null
          projekt_referenz?: string | null
          quelle: string
          storage_pfad?: string | null
          typ: string
        }
        Update: {
          artikel?: Json | null
          auftragsnummer?: string | null
          bestelldatum?: string | null
          besteller_im_dokument?: string | null
          bestellnummer_erkannt?: string | null
          bestellung_id?: string | null
          content_hash?: string | null
          created_at?: string
          email_absender?: string | null
          email_betreff?: string | null
          email_datum?: string | null
          faelligkeitsdatum?: string | null
          gesamtbetrag?: number | null
          iban?: string | null
          id?: string
          ki_roh_daten?: Json | null
          kundennummer?: string | null
          lieferdatum?: string | null
          lieferscheinnummer?: string | null
          mwst?: number | null
          netto?: number | null
          projekt_referenz?: string | null
          quelle?: string
          storage_pfad?: string | null
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "dokumente_bestellung_id_fkey"
            columns: ["bestellung_id"]
            isOneToOne: false
            referencedRelation: "bestellungen"
            referencedColumns: ["id"]
          },
        ]
      }
      email_blacklist: {
        Row: {
          erstellt_am: string | null
          grund: string | null
          id: string
          muster: string
          typ: string
        }
        Insert: {
          erstellt_am?: string | null
          grund?: string | null
          id?: string
          muster: string
          typ?: string
        }
        Update: {
          erstellt_am?: string | null
          grund?: string | null
          id?: string
          muster?: string
          typ?: string
        }
        Relationships: []
      }
      email_processing_log: {
        Row: {
          bestellung_id: string | null
          check_at: string | null
          created_at: string
          error_msg: string | null
          folder_hint: string | null
          folder_id: string
          folder_mismatch: boolean | null
          graph_message_id: string
          has_attachments: boolean | null
          internet_message_id: string
          ki_classified_as: string | null
          ki_confidence: number | null
          last_retry_at: string | null
          openai_cost_eur: number | null
          openai_input_tokens: number | null
          openai_output_tokens: number | null
          parser_name: string | null
          parser_source: string | null
          processed_at: string | null
          received_at: string | null
          retry_count: number
          sender: string | null
          status: Database["public"]["Enums"]["email_processing_status"]
          subject: string | null
        }
        Insert: {
          bestellung_id?: string | null
          check_at?: string | null
          created_at?: string
          error_msg?: string | null
          folder_hint?: string | null
          folder_id: string
          folder_mismatch?: boolean | null
          graph_message_id: string
          has_attachments?: boolean | null
          internet_message_id: string
          ki_classified_as?: string | null
          ki_confidence?: number | null
          last_retry_at?: string | null
          openai_cost_eur?: number | null
          openai_input_tokens?: number | null
          openai_output_tokens?: number | null
          parser_name?: string | null
          parser_source?: string | null
          processed_at?: string | null
          received_at?: string | null
          retry_count?: number
          sender?: string | null
          status?: Database["public"]["Enums"]["email_processing_status"]
          subject?: string | null
        }
        Update: {
          bestellung_id?: string | null
          check_at?: string | null
          created_at?: string
          error_msg?: string | null
          folder_hint?: string | null
          folder_id?: string
          folder_mismatch?: boolean | null
          graph_message_id?: string
          has_attachments?: boolean | null
          internet_message_id?: string
          ki_classified_as?: string | null
          ki_confidence?: number | null
          last_retry_at?: string | null
          openai_cost_eur?: number | null
          openai_input_tokens?: number | null
          openai_output_tokens?: number | null
          parser_name?: string | null
          parser_source?: string | null
          processed_at?: string | null
          received_at?: string | null
          retry_count?: number
          sender?: string | null
          status?: Database["public"]["Enums"]["email_processing_status"]
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_processing_log_bestellung_id_fkey"
            columns: ["bestellung_id"]
            isOneToOne: false
            referencedRelation: "bestellungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_processing_log_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "mail_sync_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: number
          payload: Json
        }
        Insert: {
          actor?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: number
          payload?: Json
        }
        Update: {
          actor?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: number
          payload?: Json
        }
        Relationships: []
      }
      firma_einstellungen: {
        Row: {
          id: string
          schluessel: string
          wert: string
        }
        Insert: {
          id?: string
          schluessel: string
          wert: string
        }
        Update: {
          id?: string
          schluessel?: string
          wert?: string
        }
        Relationships: []
      }
      freigaben: {
        Row: {
          bestellung_id: string | null
          freigegeben_am: string | null
          freigegeben_von_kuerzel: string
          freigegeben_von_name: string
          id: string
          kommentar: string | null
        }
        Insert: {
          bestellung_id?: string | null
          freigegeben_am?: string | null
          freigegeben_von_kuerzel: string
          freigegeben_von_name: string
          id?: string
          kommentar?: string | null
        }
        Update: {
          bestellung_id?: string | null
          freigegeben_am?: string | null
          freigegeben_von_kuerzel?: string
          freigegeben_von_name?: string
          id?: string
          kommentar?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "freigaben_bestellung_id_fkey"
            columns: ["bestellung_id"]
            isOneToOne: false
            referencedRelation: "bestellungen"
            referencedColumns: ["id"]
          },
        ]
      }
      haendler: {
        Row: {
          confirmed_at: string | null
          created_at: string
          domain: string
          email_absender: string[] | null
          id: string
          name: string
          url_muster: string[] | null
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          domain: string
          email_absender?: string[] | null
          id?: string
          name: string
          url_muster?: string[] | null
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          domain?: string
          email_absender?: string[] | null
          id?: string
          name?: string
          url_muster?: string[] | null
        }
        Relationships: []
      }
      kommentare: {
        Row: {
          autor_kuerzel: string
          autor_name: string
          bestellung_id: string | null
          erstellt_am: string | null
          id: string
          text: string
        }
        Insert: {
          autor_kuerzel: string
          autor_name: string
          bestellung_id?: string | null
          erstellt_am?: string | null
          id?: string
          text: string
        }
        Update: {
          autor_kuerzel?: string
          autor_name?: string
          bestellung_id?: string | null
          erstellt_am?: string | null
          id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "kommentare_bestellung_id_fkey"
            columns: ["bestellung_id"]
            isOneToOne: false
            referencedRelation: "bestellungen"
            referencedColumns: ["id"]
          },
        ]
      }
      kunden: {
        Row: {
          adresse: string | null
          confirmed_at: string | null
          created_at: string
          email: string | null
          farbe: string | null
          id: string
          keywords: string[] | null
          kuerzel: string | null
          name: string
          notizen: string | null
          telefon: string | null
        }
        Insert: {
          adresse?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string | null
          farbe?: string | null
          id?: string
          keywords?: string[] | null
          kuerzel?: string | null
          name: string
          notizen?: string | null
          telefon?: string | null
        }
        Update: {
          adresse?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string | null
          farbe?: string | null
          id?: string
          keywords?: string[] | null
          kuerzel?: string | null
          name?: string
          notizen?: string | null
          telefon?: string | null
        }
        Relationships: []
      }
      mail_sync_folders: {
        Row: {
          created_at: string
          delta_token: string | null
          document_hint: string | null
          enabled: boolean
          folder_name: string
          folder_path: string
          graph_folder_id: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          last_sync_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delta_token?: string | null
          document_hint?: string | null
          enabled?: boolean
          folder_name: string
          folder_path: string
          graph_folder_id: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delta_token?: string | null
          document_hint?: string | null
          enabled?: boolean
          folder_name?: string
          folder_path?: string
          graph_folder_id?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      mail_sync_subscriptions: {
        Row: {
          client_state: string
          consecutive_failures: number
          created_at: string
          expiration_at: string
          folder_id: string
          graph_subscription_id: string
          id: string
          last_renewal_error: string | null
          last_renewed_at: string
          notification_url: string
          resource: string
        }
        Insert: {
          client_state: string
          consecutive_failures?: number
          created_at?: string
          expiration_at: string
          folder_id: string
          graph_subscription_id: string
          id?: string
          last_renewal_error?: string | null
          last_renewed_at?: string
          notification_url: string
          resource: string
        }
        Update: {
          client_state?: string
          consecutive_failures?: number
          created_at?: string
          expiration_at?: string
          folder_id?: string
          graph_subscription_id?: string
          id?: string
          last_renewal_error?: string | null
          last_renewed_at?: string
          notification_url?: string
          resource?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_sync_subscriptions_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "mail_sync_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      openai_analysis_cache: {
        Row: {
          analyse_data: Json
          content_hash: string
          created_at: string
          hit_count: number
          last_hit_at: string
          mime_type: string
        }
        Insert: {
          analyse_data: Json
          content_hash: string
          created_at?: string
          hit_count?: number
          last_hit_at?: string
          mime_type: string
        }
        Update: {
          analyse_data?: Json
          content_hash?: string
          created_at?: string
          hit_count?: number
          last_hit_at?: string
          mime_type?: string
        }
        Relationships: []
      }
      openai_usage_daily: {
        Row: {
          cost_eur: number
          cost_usd: number
          date: string
          input_tokens: number
          model: string
          num_requests: number
          output_tokens: number
          source: string
          synced_at: string
        }
        Insert: {
          cost_eur?: number
          cost_usd?: number
          date: string
          input_tokens?: number
          model: string
          num_requests?: number
          output_tokens?: number
          source?: string
          synced_at?: string
        }
        Update: {
          cost_eur?: number
          cost_usd?: number
          date?: string
          input_tokens?: number
          model?: string
          num_requests?: number
          output_tokens?: number
          source?: string
          synced_at?: string
        }
        Relationships: []
      }
      projekte: {
        Row: {
          adresse: string | null
          adresse_keywords: string[] | null
          beschreibung: string | null
          besteller_affinitaet: Json | null
          budget: number | null
          created_at: string
          erstellt_von: string | null
          farbe: string | null
          id: string
          kunde: string | null
          kunden_id: string | null
          name: string
          status: string
        }
        Insert: {
          adresse?: string | null
          adresse_keywords?: string[] | null
          beschreibung?: string | null
          besteller_affinitaet?: Json | null
          budget?: number | null
          created_at?: string
          erstellt_von?: string | null
          farbe?: string | null
          id?: string
          kunde?: string | null
          kunden_id?: string | null
          name: string
          status?: string
        }
        Update: {
          adresse?: string | null
          adresse_keywords?: string[] | null
          beschreibung?: string | null
          besteller_affinitaet?: Json | null
          budget?: number | null
          created_at?: string
          erstellt_von?: string | null
          farbe?: string | null
          id?: string
          kunde?: string | null
          kunden_id?: string | null
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projekte_kunden_id_fkey"
            columns: ["kunden_id"]
            isOneToOne: false
            referencedRelation: "kunden"
            referencedColumns: ["id"]
          },
        ]
      }
      subunternehmer: {
        Row: {
          ansprechpartner: string | null
          confirmed_at: string | null
          created_at: string
          email: string | null
          email_absender: string[] | null
          firma: string
          gewerk: string | null
          iban: string | null
          id: string
          notizen: string | null
          steuer_nr: string | null
          telefon: string | null
        }
        Insert: {
          ansprechpartner?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string | null
          email_absender?: string[] | null
          firma: string
          gewerk?: string | null
          iban?: string | null
          id?: string
          notizen?: string | null
          steuer_nr?: string | null
          telefon?: string | null
        }
        Update: {
          ansprechpartner?: string | null
          confirmed_at?: string | null
          created_at?: string
          email?: string | null
          email_absender?: string[] | null
          firma?: string
          gewerk?: string | null
          iban?: string | null
          id?: string
          notizen?: string | null
          steuer_nr?: string | null
          telefon?: string | null
        }
        Relationships: []
      }
      verworfene_emails: {
        Row: {
          absender_adresse: string
          absender_domain: string
          created_at: string
          email_betreff: string
          id: string
          verworfen_von: string
        }
        Insert: {
          absender_adresse: string
          absender_domain: string
          created_at?: string
          email_betreff: string
          id?: string
          verworfen_von: string
        }
        Update: {
          absender_adresse?: string
          absender_domain?: string
          created_at?: string
          email_betreff?: string
          id?: string
          verworfen_von?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          bestellnummer: string | null
          bestellung_id: string | null
          created_at: string
          fehler_text: string | null
          id: string
          status: string
          typ: string
        }
        Insert: {
          bestellnummer?: string | null
          bestellung_id?: string | null
          created_at?: string
          fehler_text?: string | null
          id?: string
          status: string
          typ: string
        }
        Update: {
          bestellnummer?: string | null
          bestellung_id?: string | null
          created_at?: string
          fehler_text?: string | null
          id?: string
          status?: string
          typ?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_bestellung_id_fkey"
            columns: ["bestellung_id"]
            isOneToOne: false
            referencedRelation: "bestellungen"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dashboard_kpis_global: {
        Row: {
          abweichung_count: number | null
          aktiv_count: number | null
          diese_woche_faellig_count: number | null
          diese_woche_faellig_volumen: number | null
          freigegeben_count: number | null
          freigegeben_volumen: number | null
          gesamt_volumen: number | null
          ls_fehlt_count: number | null
          offen_count: number | null
          refreshed_at: string | null
          total_count: number | null
          ueberfaellig_count: number | null
          ueberfaellig_volumen: number | null
          vollstaendig_count: number | null
        }
        Relationships: []
      }
      dashboard_kpis_per_besteller: {
        Row: {
          abweichung_count: number | null
          aktiv_count: number | null
          besteller_kuerzel: string | null
          diese_woche_faellig_count: number | null
          diese_woche_faellig_volumen: number | null
          freigegeben_count: number | null
          freigegeben_volumen: number | null
          gesamt_volumen: number | null
          ls_fehlt_count: number | null
          offen_count: number | null
          refreshed_at: string | null
          ueberfaellig_count: number | null
          ueberfaellig_volumen: number | null
          vollstaendig_count: number | null
        }
        Relationships: []
      }
      dokumente_cross_bestellung_duplikate: {
        Row: {
          anzahl_bestellungen: number | null
          anzahl_dokus: number | null
          bestellung_ids: string[] | null
          content_hash: string | null
          erste_erfassung: string | null
          letzte_erfassung: string | null
          typen: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      append_haendler_url_pattern: {
        Args: { p_haendler_id: string; p_max_count?: number; p_pattern: string }
        Returns: boolean
      }
      cleanup_stale_pending_mails: { Args: never; Returns: number }
      delete_orphan_dokumente_pdfs: {
        Args: { p_cutoff: string; p_limit: number }
        Returns: {
          deleted_name: string
        }[]
      }
      delete_versand_only_bestellungen: {
        Args: { p_ids: string[] }
        Returns: number
      }
      dsgvo_anonymize_besteller: { Args: { p_kuerzel: string }; Returns: Json }
      fan_out_pending_mails: {
        Args: never
        Returns: {
          base_url: string
          triggered_count: number
        }[]
      }
      find_orphan_dokumente_pdfs: {
        Args: { p_cutoff: string; p_limit: number }
        Returns: {
          created_at: string
          name: string
          size_bytes: number
        }[]
      }
      freigeben_bestellung: {
        Args: {
          p_bestellung_id: string
          p_kommentar?: string
          p_kuerzel: string
          p_name: string
        }
        Returns: Json
      }
      fuzzy_match_bestellung: {
        Args: {
          p_days?: number
          p_haendler_id?: string
          p_haendler_name?: string
          p_search_nummer: string
          p_subunternehmer_id?: string
          p_threshold?: number
        }
        Returns: {
          auftragsnummer: string
          bestellnummer: string
          haendler_name: string
          id: string
          lieferscheinnummer: string
          match_field: string
          similarity_score: number
        }[]
      }
      get_user_kuerzel: { Args: never; Returns: string }
      get_user_rolle: { Args: never; Returns: string }
      increment_email_retry_count: {
        Args: { p_internet_message_id: string }
        Returns: undefined
      }
      increment_mahnung: { Args: { p_bestellung_id: string }; Returns: number }
      log_event: {
        Args: {
          p_actor: string
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_payload?: Json
        }
        Returns: undefined
      }
      match_besteller_rules: {
        Args: {
          p_email_absender: string
          p_email_betreff: string
          p_haendler_domain: string
          p_haendler_id: string
        }
        Returns: {
          confidence: number
          rule_id: string
          rule_name: string
          target_kuerzel: string
        }[]
      }
      persist_dokument_atomic: {
        Args: {
          p_artikel: Json
          p_auftragsnummer: string
          p_bestelldatum: string
          p_besteller_im_dokument: string
          p_bestellnummer_erkannt: string
          p_bestellung_id: string
          p_content_hash: string
          p_email_absender: string
          p_email_betreff: string
          p_email_datum: string
          p_faelligkeitsdatum: string
          p_gesamtbetrag: number
          p_iban: string
          p_ki_roh_daten: Json
          p_kundennummer: string
          p_lieferdatum: string
          p_lieferscheinnummer: string
          p_mwst: number
          p_netto: number
          p_projekt_referenz: string
          p_quelle: string
          p_storage_pfad: string
          p_typ: string
        }
        Returns: string
      }
      refresh_dashboard_kpis: { Args: never; Returns: undefined }
      sync_one_flag: {
        Args: { p_bestellung_id: string; p_typ: string }
        Returns: undefined
      }
      trigger_discover_emails: { Args: never; Returns: number }
      trigger_retry_failed_emails: { Args: never; Returns: number }
    }
    Enums: {
      email_processing_status: "pending" | "irrelevant" | "processed" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      email_processing_status: ["pending", "irrelevant", "processed", "failed"],
    },
  },
} as const
