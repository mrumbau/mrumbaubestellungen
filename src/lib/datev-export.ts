// DATEV Buchungsstapel Export – Utility-Bibliothek
// Format: EXTF Version 700, Semicolon-separiert, UTF-8 mit BOM

export interface DATEVExportOptions {
  von: string; // ISO date
  bis: string; // ISO date
  beraterNr?: string;
  mandantenNr?: string;
  gegenKonto?: string;
  aufwandsKonto?: string;
}

export interface FreigegebeneRechnung {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  betrag: number | null;
  projekt_name: string | null;
  created_at: string;
  updated_at: string | null;
  netto: number | null;
  mwst: number | null;
}

/**
 * Generiert ein konsistentes Kreditorenkonto pro Händler.
 * Händler werden alphabetisch sortiert → gleicher Händler = immer gleiches Konto.
 * Bereich: 70001, 70002, ...
 */
export function generiereKreditorenkonto(haendlerIndex: number): string {
  return String(70000 + haendlerIndex + 1);
}

/**
 * Formatiert Betrag für DATEV: Punkt als Dezimal.
 * DATEV Version 700 erwartet bei WKZ=EUR den Punkt als Dezimaltrenner.
 */
export function formatiereBetrag(betrag: number): string {
  return betrag.toFixed(2);
}

/**
 * Formatiert Datum im DATEV-Format.
 * TTMM = Belegdatum (ohne Jahr), TTMMJJJJ = Header-Datum
 */
export function formatiereDatum(date: Date, format: "TTMM" | "TTMMJJJJ" | "JJJJMMTT"): string {
  const tt = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const jjjj = String(date.getFullYear());

  switch (format) {
    case "TTMM":
      return tt + mm;
    case "TTMMJJJJ":
      return tt + mm + jjjj;
    case "JJJJMMTT":
      return jjjj + mm + tt;
  }
}

/**
 * Generiert die DATEV-Header-Zeile (Zeile 1 mit Metadaten).
 */
export function generiereHEADER(options: DATEVExportOptions): string {
  const jetzt = new Date();
  const datumZeit = jetzt.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const wjBeginn = `${new Date(options.von).getFullYear()}0101`;

  return [
    '"EXTF"', "700", "21", '"Buchungsstapel"', "4",
    datumZeit, '""', '"RE"', '""',
    options.beraterNr || "00000", '""', options.mandantenNr || "00000",
    wjBeginn, "4",
    options.von.replace(/-/g, ""), options.bis.replace(/-/g, ""),
    '"MR Umbau Export"', '""', "0", "0", '""', '"EUR"',
    "0", "0", "0", "0", "0", "0",
  ].join(";");
}

/**
 * Generiert die Spaltenbezeichnungen (Zeile 2).
 */
export function generiereKOPFZEILE(): string {
  return [
    "Umsatz", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs",
    "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto",
    "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel",
    "Belegdatum", "Belegfeld 1", "Belegfeld 2",
    "Skonto", "Buchungstext", "Postensperre", "Diverse Adressnummer",
    "Geschäftspartnerbank", "Sachverhalt", "Zinssperre",
    "Beleglink", "Beleginfo - Art 1", "Beleginfo - Inhalt 1",
    "Beleginfo - Art 2", "Beleginfo - Inhalt 2",
    "Beleginfo - Art 3", "Beleginfo - Inhalt 3",
    "Beleginfo - Art 4", "Beleginfo - Inhalt 4",
    "Beleginfo - Art 5", "Beleginfo - Inhalt 5",
    "Beleginfo - Art 6", "Beleginfo - Inhalt 6",
    "Beleginfo - Art 7", "Beleginfo - Inhalt 7",
    "Beleginfo - Art 8", "Beleginfo - Inhalt 8",
    "KOST1", "KOST2", "KOST-Menge",
  ].join(";");
}

/**
 * Generiert eine Buchungszeile für eine freigegebene Rechnung.
 */
export function generiereZEILE(
  rechnung: FreigegebeneRechnung,
  kreditorenkonto: string,
  gegenKonto: string,
  kost1?: string
): string {
  // MwSt-Satz aus Rechnungsdaten ableiten, Fallback 19%
  let netto: number;
  let buSchluessel: string;

  if (rechnung.netto && rechnung.mwst && rechnung.netto > 0) {
    // Netto und MwSt direkt aus Rechnung verfügbar
    netto = rechnung.netto;
    const mwstProzent = Math.round((rechnung.mwst / rechnung.netto) * 100);
    buSchluessel = mwstProzent <= 9 ? "1" : "9"; // 1 = 7%, 9 = 19%
  } else if (rechnung.netto) {
    netto = rechnung.netto;
    buSchluessel = "9"; // Standard 19%
  } else {
    netto = Number(rechnung.betrag) / 1.19;
    buSchluessel = "9"; // Standard 19%
  }

  const betragFormatiert = formatiereBetrag(netto);

  const datum = new Date(rechnung.updated_at || rechnung.created_at);
  const belegDatum = formatiereDatum(datum, "TTMM");

  const belegfeld1 = (rechnung.bestellnummer || "").slice(0, 12);

  let buchungstext = rechnung.haendler_name || "Unbekannt";
  if (rechnung.projekt_name) {
    buchungstext += ` / ${rechnung.projekt_name}`;
  }
  buchungstext = buchungstext.slice(0, 60);

  // Felder bis KOST1 (39 Felder total)
  const felder = [
    betragFormatiert, '"S"', '"EUR"', '""',
    '""', '""', kreditorenkonto, gegenKonto, buSchluessel,
    belegDatum, `"${belegfeld1}"`, '""',
    '""', `"${buchungstext}"`,
    // Postensperre bis Beleginfo (24 leere Felder)
    '""', '""', '""', '""', '""',
    '""', '""', '""', '""', '""',
    '""', '""', '""', '""', '""',
    '""', '""', '""', '""', '""',
    '""', '""', '""', '""',
    // KOST1, KOST2, KOST-Menge
    kost1 ? `"${kost1.slice(0, 36)}"` : '""',
    '""', '""',
  ];

  return felder.join(";");
}

/**
 * Erstellt einen Händler-Index für konsistente Kreditorenkonten.
 * Alphabetisch sortiert → gleiche Zuordnung bei jedem Export.
 */
export function erstelleHaendlerIndex(haendlerNamen: string[]): Map<string, number> {
  const sortiert = [...new Set(haendlerNamen)].sort((a, b) =>
    a.localeCompare(b, "de-DE")
  );
  return new Map(sortiert.map((name, i) => [name, i]));
}

/**
 * Hauptfunktion: Exportiert Rechnungen als DATEV Buchungsstapel CSV.
 */
export function exportiereAlsDATEV(
  rechnungen: FreigegebeneRechnung[],
  options: DATEVExportOptions
): { csv: string; dateiname: string } {
  const gegenKonto = options.gegenKonto || "4980";

  // Händler-Index für Kreditorenkonten
  const haendlerNamen = rechnungen
    .map((r) => r.haendler_name || "Unbekannt");
  const haendlerIndex = erstelleHaendlerIndex(haendlerNamen);

  const header = generiereHEADER(options);
  const kopfzeile = generiereKOPFZEILE();

  const zeilen = rechnungen.map((r) => {
    const name = r.haendler_name || "Unbekannt";
    const idx = haendlerIndex.get(name) ?? 0;
    const konto = generiereKreditorenkonto(idx);
    const kost1 = r.projekt_name || undefined;
    return generiereZEILE(r, konto, gegenKonto, kost1);
  });

  const csv = [header, kopfzeile, ...zeilen].join("\r\n");
  const dateiname = `EXTF_Buchungsstapel_${options.von}_${options.bis}.csv`;

  return { csv, dateiname };
}
