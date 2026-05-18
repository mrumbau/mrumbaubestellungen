/**
 * Pipeline-Dedup: verhindert dass Stub-Dokumente (kein PDF + kein Betrag)
 * ein vorhandenes vollständiges Rechnungs-Doku verdoppeln.
 *
 * Hintergrund (18.05.2026): zwei verschiedene Bug-Mechaniken erzeugten je ein
 * Stub-Duplikat in der Buchhaltung:
 *   - Race-Condition (Brillux 7004572): zwei Worker verarbeiteten dieselbe Mail
 *     mit 17s Abstand. Erster Worker persistierte das PDF-Doku mit Betrag,
 *     zweiter Worker persistierte ein zweites Doku ohne PDF und ohne Betrag
 *     (idempotency.claimMessage griff in diesem Fall nicht — möglicherweise
 *     wegen unterschiedlicher internet_message_ids beim Mail-Resend).
 *   - Reminder-Mail (Klaus Alter 78611): eine Woche nach der Original-Rechnung
 *     kam vom selben Vendor eine "Rechnung 78611"-Mail ohne neuen Inhalt
 *     (vermutlich Reminder). Pipeline klassifizierte sie als typ=rechnung und
 *     legte ein zweites Doku an — ohne PDF, ohne Betrag.
 *
 * Beide Bugs landen in der Buchhaltung als doppelte Zeile (Buchhaltung rendert
 * pro Rechnungs-Doku eine Zeile). User-sichtbarer Schaden: doppelte Buchung.
 *
 * Pre-Persist-Check: Wenn das NEUE Doku ein Rechnungs-Stub ist (kein PDF UND
 * kein Betrag) UND auf derselben Bestellung schon ein VOLLSTÄNDIGES Rechnungs-
 * Doku mit derselben bestellnummer_erkannt existiert → SKIP persist.
 *
 * Was wird NICHT geblockt (bewusst):
 *   - Legitime Teil-Rechnungen mit eigener bestellnummer_erkannt (Raab Karcher
 *     schickt z.B. 2 separate Rechnungen für eine Auftragsbestätigung — beide
 *     mit eigener RG-Nummer + eigenem Betrag). bestellnummer_erkannt
 *     unterscheidet sich → kein Skip.
 *   - Erste Rechnung wenn noch nichts da ist (existierende.length === 0).
 *   - Wenn das neue Doku selbst Daten mitbringt (PDF ODER Betrag): vermutlich
 *     legitime Korrektur/Update — persist normal und lass den Unique-Index die
 *     letzte Idempotenz-Entscheidung treffen.
 */
import { createServiceClient } from "@/lib/supabase";
import { logInfo } from "@/lib/logger";

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface StubDuplicateInput {
  supabase: ServiceClient;
  bestellungId: string;
  typ: string;
  bestellnummerErkannt: string | null;
  newGesamtbetrag: number | null;
  newStoragePfad: string | null;
  /** Für Logging-Kontext (E-Mail-Identifikation). */
  emailBetreff?: string | null;
  emailAbsender?: string | null;
}

/**
 * Returns true wenn dieser persist_dokument_atomic-Call übersprungen werden
 * soll (weil ein vollständiges Doku mit derselben Bestellnummer schon
 * existiert und das neue nur ein Stub ist).
 *
 * Sicher gegen Race: prüft *vor* dem Insert. Im Race-Fall verlieren wir
 * den späteren Stub (gut), nicht den früheren mit Daten.
 */
export async function shouldSkipAsStubDuplicate(input: StubDuplicateInput): Promise<boolean> {
  const {
    supabase, bestellungId, typ, bestellnummerErkannt,
    newGesamtbetrag, newStoragePfad, emailBetreff, emailAbsender,
  } = input;

  // Schutz greift nur für Rechnungen (häufigster Buchhaltungs-Doku-Typ).
  // Bestellbestätigung + Lieferschein + Versandbestätigung dürfen mehrfach
  // existieren — sie sind keine Buchungsbelege.
  if (typ !== "rechnung") return false;

  // Stub-Bedingung: kein PDF UND kein Betrag UND eine Bestellnummer zum
  // matchen. Ohne Bestellnummer können wir nicht sicher dedup'en.
  const istStub = !newStoragePfad && (newGesamtbetrag == null || Number(newGesamtbetrag) === 0);
  if (!istStub) return false;
  if (!bestellnummerErkannt) return false;

  // Existierende vollständige Rechnung mit derselben bestellnummer_erkannt?
  const { data: existing, error } = await supabase
    .from("dokumente")
    .select("id, gesamtbetrag, storage_pfad")
    .eq("bestellung_id", bestellungId)
    .eq("typ", "rechnung")
    .eq("bestellnummer_erkannt", bestellnummerErkannt)
    .limit(5);

  if (error) {
    // Fail-open: bei DB-Fehler nicht skip'en (sonst verlieren wir vielleicht
    // legitime Daten). Pipeline läuft normal weiter — schlimmster Fall ist
    // ein Duplikat, das per Hand bereinigt werden muss.
    logInfo("pipeline/dedup", "Existing-Check fehlgeschlagen, fail-open", {
      bestellungId, bestellnummerErkannt, error: error.message,
    });
    return false;
  }

  if (!existing || existing.length === 0) return false;

  const hasVollstaendig = existing.some(
    (d) => d.storage_pfad || (d.gesamtbetrag != null && Number(d.gesamtbetrag) > 0),
  );
  if (!hasVollstaendig) return false;

  logInfo("pipeline/dedup", "Stub-Duplikat-Rechnung geskippt", {
    bestellungId,
    bestellnummer_erkannt: bestellnummerErkannt,
    existing_count: existing.length,
    email_betreff: emailBetreff,
    email_absender: emailAbsender,
    grund: "Vollständiges Rechnungs-Doku mit gleicher BN existiert bereits — neue Mail hat kein PDF und keinen Betrag (vermutlich Race oder Reminder-Mail)",
  });
  return true;
}
